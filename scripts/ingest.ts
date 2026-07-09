/**
 * Knowledge Base ingestion (ROADMAP Phase 2). Offline, Exactly-operated.
 *
 *   npm run ingest -- --client <client_id> --dir <folder_of_pdfs>
 *
 * Reads every PDF in the folder, extracts text per page (pdf-parse v2), chunks
 * it, embeds with OpenAI text-embedding-3-small (ADR-0003), and full-replaces
 * the client's kb_chunks.
 *
 * Replace strategy is build-then-swap: insert the new chunks, THEN delete the
 * old ones — so the KB is never empty mid-ingest. It is not a single DB
 * transaction; that is fine for offline ingest of a client that isn't serving
 * live traffic. Before re-ingesting a LIVE client, move this into a
 * transactional RPC.
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { PDFParse } from "pdf-parse";

// Must match src/config embedding model (ADR-0003): ingestion and query-time
// embedding have to use the same model or retrieval silently degrades.
const EMBEDDING_MODEL = "text-embedding-3-small";

// Ingestion tunables.
const CHUNK_SIZE = 1000; // characters
const CHUNK_OVERLAP = 150; // characters
const INSERT_BATCH = 100; // rows per insert call

function parseArgs(): Record<string, string | undefined> {
  const args = process.argv.slice(2);
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      out[a.slice(2)] = args[i + 1];
      i++;
    }
  }
  return out;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

/** Character-based chunking with overlap, breaking on whitespace where possible. */
function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(" ", end);
      if (lastSpace > start + CHUNK_SIZE / 2) end = lastSpace;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks;
}

type Chunk = { content: string; sourceFilename: string; sourcePage: number };

async function extractChunks(dir: string): Promise<Chunk[]> {
  const entries = await readdir(dir);
  const pdfs = entries.filter((f) => extname(f).toLowerCase() === ".pdf");
  if (pdfs.length === 0) throw new Error(`No PDF files found in ${dir}`);

  const chunks: Chunk[] = [];
  for (const file of pdfs) {
    const buf = await readFile(join(dir, file));
    const parser = new PDFParse({ data: buf });
    try {
      const result = await parser.getText();
      for (const page of result.pages) {
        for (const content of chunkText(page.text)) {
          chunks.push({ content, sourceFilename: file, sourcePage: page.num });
        }
      }
    } finally {
      await parser.destroy();
    }
    console.log(`  parsed ${file}`);
  }
  return chunks;
}

async function main(): Promise<void> {
  const { client: clientId, dir } = parseArgs();
  if (!clientId || !dir) {
    console.error("Usage: npm run ingest -- --client <client_id> --dir <pdf_dir>");
    process.exit(1);
  }
  if (clientId.startsWith("eck_")) {
    console.error(
      "--client expects the client UUID (from `insert into clients ... returning id`), not the API key (eck_...).",
    );
    process.exit(1);
  }

  const db = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Clients are managed manually for now (ROADMAP Phase 8).
  const { data: client, error: clientErr } = await db
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr) throw clientErr;
  if (!client) {
    throw new Error(`Client ${clientId} not found. Create the client row first.`);
  }

  console.log(`Ingesting for "${client.name}" (${clientId}) from ${dir}`);

  const chunks = await extractChunks(dir);
  console.log(`Extracted ${chunks.length} chunks.`);
  if (chunks.length === 0) throw new Error("No text extracted from the PDFs.");

  const { embeddings } = await embedMany({
    model: openai.textEmbeddingModel(EMBEDDING_MODEL),
    values: chunks.map((c) => c.content),
  });
  console.log(`Embedded ${embeddings.length} chunks.`);

  // Build-then-swap: capture existing ids, insert new, then delete the old ids.
  const { data: oldRows, error: oldErr } = await db
    .from("kb_chunks")
    .select("id")
    .eq("client_id", clientId);
  if (oldErr) throw oldErr;
  const oldIds = (oldRows ?? []).map((r) => r.id as string);

  const rows = chunks.map((c, i) => ({
    client_id: clientId,
    content: c.content,
    embedding: embeddings[i],
    source_filename: c.sourceFilename,
    source_page: c.sourcePage,
  }));

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await db.from("kb_chunks").insert(batch);
    if (error) throw error;
    console.log(`  inserted ${Math.min(i + INSERT_BATCH, rows.length)}/${rows.length}`);
  }

  if (oldIds.length > 0) {
    const { error } = await db
      .from("kb_chunks")
      .delete()
      .eq("client_id", clientId)
      .in("id", oldIds);
    if (error) throw error;
    console.log(`Removed ${oldIds.length} previous chunks.`);
  }

  console.log("Ingestion complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
