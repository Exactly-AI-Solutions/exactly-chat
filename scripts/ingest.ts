/**
 * Knowledge Base ingestion (ROADMAP Phase 2). Offline, Exactly-operated.
 *
 *   npm run ingest -- --client <client_id> --dir <folder_of_docs>
 *   npm run ingest -- --client <client_id> --file <path_to_one_doc>
 *
 * Reads PDF, Markdown, or plain-text docs (`.pdf`, `.md`, `.markdown`, `.txt`),
 * chunks them, embeds with OpenAI text-embedding-3-small (ADR-0003), and
 * full-replaces the client's kb_chunks. Use `--file` to ingest a single
 * document without pulling in sibling files in the same directory (process
 * docs, changelogs, probes) that aren't meant to ground the bot.
 *
 * Chunking is format-aware, not client-special-cased, so any KB written in
 * either shape below is handled the same way:
 *  - Claim-block docs (3+ lines matching `**[SOME-ID]` at line start) are
 *    split one block per chunk — each block already carries its own claim,
 *    evidence, source and date, so no overlap is needed.
 *  - Otherwise, docs with Markdown `##`/`###` headers are split one section
 *    per chunk, sub-split only if a section runs past SECTION_SPLIT_CEILING.
 *  - Plain text with neither falls back to the original character-based
 *    chunker (used as-is for PDFs, which are chunked per page for
 *    provenance).
 *
 * Replace strategy is build-then-swap: insert the new chunks, THEN delete the
 * old ones — so the KB is never empty mid-ingest. It is not a single DB
 * transaction; that is fine for offline ingest of a client that isn't serving
 * live traffic. Before re-ingesting a LIVE client, move this into a
 * transactional RPC.
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join, extname, basename, dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { PDFParse } from "pdf-parse";

// Must match src/config embedding model (ADR-0003): ingestion and query-time
// embedding have to use the same model or retrieval silently degrades.
// text-embedding-3-small is also OpenAI's cheapest embedding model.
const EMBEDDING_MODEL = "text-embedding-3-small";

// Ingestion tunables.
const CHUNK_SIZE = 1000; // characters — character-fallback chunker
const CHUNK_OVERLAP = 150; // characters
const SECTION_SPLIT_CEILING = 1800; // characters — header sections larger than this get sub-split
const INSERT_BATCH = 100; // rows per insert call

const TEXT_EXT = new Set([".md", ".markdown", ".txt"]);
// e.g. "**[CF-C6-01] Legal entity name — VERIFIED — C1**" — generic on
// purpose (no "CF-" literal) so any client's claim-ID convention matches.
const CLAIM_BLOCK_RE = /^\*\*\[[^\]]+\][^\n]*$/gm;
const HEADER_RE = /^#{2,3}\s+.+$/gm;

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

type Chunk = { content: string; sourceFilename: string; sourcePage: number | null };

/** One claim block = one chunk. Blocks already carry their own evidence,
 * source and date, so they need no overlap and no further splitting. */
function chunkByClaimBlocks(text: string, sourceFilename: string): Chunk[] {
  const matches = [...text.matchAll(CLAIM_BLOCK_RE)];
  const chunks: Chunk[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    let slice = text.slice(start, end);
    // A real claim block never contains a Markdown heading. Stray section
    // text (an aside like "### Summary" sitting between two blocks in
    // source order) can otherwise get glued onto the end of the preceding
    // block's chunk — truncate at the first heading if one appears.
    const headingIdx = slice.search(/\n#{1,6}\s+/);
    if (headingIdx !== -1) slice = slice.slice(0, headingIdx);
    const content = slice.trim();
    if (content) chunks.push({ content, sourceFilename, sourcePage: null });
  }
  return chunks;
}

/** One Markdown `##`/`###` section = one chunk, sub-split only if oversized. */
function chunkByHeaders(text: string, sourceFilename: string): Chunk[] {
  const matches = [...text.matchAll(HEADER_RE)];
  const chunks: Chunk[] = [];
  // Content before the first header (if any) still needs to be captured.
  const preamble = text.slice(0, matches[0]?.index ?? text.length).trim();
  if (preamble) {
    for (const c of chunkText(preamble)) chunks.push({ content: c, sourceFilename, sourcePage: null });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const section = text.slice(start, end).trim();
    if (!section) continue;
    if (section.length <= SECTION_SPLIT_CEILING) {
      chunks.push({ content: section, sourceFilename, sourcePage: null });
    } else {
      for (const sub of chunkText(section)) chunks.push({ content: sub, sourceFilename, sourcePage: null });
    }
  }
  return chunks;
}

/** Pick a chunking strategy by document shape — never by client name. */
function chunkDocument(text: string, sourceFilename: string): Chunk[] {
  const blockMatches = text.match(CLAIM_BLOCK_RE) ?? [];
  if (blockMatches.length >= 3) {
    console.log(`    claim-block chunking (${blockMatches.length} blocks detected)`);
    return chunkByClaimBlocks(text, sourceFilename);
  }
  const headerMatches = text.match(HEADER_RE) ?? [];
  if (headerMatches.length >= 1) {
    console.log(`    header-aware chunking (${headerMatches.length} sections detected)`);
    return chunkByHeaders(text, sourceFilename);
  }
  console.log(`    character-based chunking (no structure detected)`);
  return chunkText(text).map((c) => ({ content: c, sourceFilename, sourcePage: null }));
}

async function readTextFile(dir: string, file: string): Promise<string> {
  const raw = await readFile(join(dir, file), "utf8");
  return raw.replace(/\n{3,}/g, "\n\n").trim();
}

/** PDFs are chunked per page (character-based) so provenance carries a page number. */
async function chunkPdf(dir: string, file: string): Promise<Chunk[]> {
  const buf = await readFile(join(dir, file));
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    const chunks: Chunk[] = [];
    for (const page of result.pages) {
      for (const content of chunkText(page.text)) {
        chunks.push({ content, sourceFilename: file, sourcePage: page.num });
      }
    }
    return chunks;
  } finally {
    await parser.destroy();
  }
}

async function extractChunksForFile(dir: string, file: string): Promise<Chunk[]> {
  const ext = extname(file).toLowerCase();
  if (ext === ".pdf") return chunkPdf(dir, file);
  const text = await readTextFile(dir, file);
  return chunkDocument(text, file);
}

async function extractChunks(dir: string): Promise<Chunk[]> {
  const entries = await readdir(dir);
  const files = entries
    .filter((f) => {
      const ext = extname(f).toLowerCase();
      return ext === ".pdf" || TEXT_EXT.has(ext);
    })
    .sort();
  if (files.length === 0) {
    throw new Error(`No .pdf, .md, .markdown, or .txt files found in ${dir}`);
  }

  const chunks: Chunk[] = [];
  for (const file of files) {
    console.log(`  reading ${file}`);
    chunks.push(...(await extractChunksForFile(dir, file)));
  }
  return chunks;
}

async function main(): Promise<void> {
  const { client: clientId, dir, file } = parseArgs();
  if (!clientId || (!dir && !file)) {
    console.error("Usage: npm run ingest -- --client <client_id> --dir <doc_dir>");
    console.error("   or: npm run ingest -- --client <client_id> --file <path_to_doc>");
    process.exit(1);
  }
  if (dir && file) {
    console.error("Pass either --dir or --file, not both.");
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

  console.log(`Ingesting for "${client.name}" (${clientId}) from ${file ?? dir}`);

  const chunks = file
    ? await extractChunksForFile(dirname(file), basename(file))
    : await extractChunks(dir!);
  console.log(`Extracted ${chunks.length} chunks.`);
  if (chunks.length === 0) throw new Error("No text extracted from the source document(s).");
  const avgLen = Math.round(chunks.reduce((s, c) => s + c.content.length, 0) / chunks.length);
  console.log(`Average chunk length: ${avgLen} chars.`);

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
