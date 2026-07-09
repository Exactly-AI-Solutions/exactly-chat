/**
 * Interim text ingestion (ADR-0008). Reads KB docs (Markdown, text, or PDF) and
 * stores the WHOLE KB as text on the client — no embeddings, no OpenAI.
 *
 *   npm run ingest-text -- --client <client_id> --dir <folder_of_docs>
 *
 * Use while OpenAI credits are unavailable (config.retrieval.mode = "full-kb").
 * When credits return, switch to `npm run ingest` + mode "embeddings".
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

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

const TEXT_EXT = new Set([".md", ".markdown", ".txt"]);

async function extractFileText(dir: string, file: string): Promise<string> {
  const ext = extname(file).toLowerCase();
  if (ext === ".pdf") {
    const buf = await readFile(join(dir, file));
    const parser = new PDFParse({ data: buf });
    try {
      const result = await parser.getText();
      return result.text.replace(/\n{3,}/g, "\n\n").trim();
    } finally {
      await parser.destroy();
    }
  }
  // Markdown / plain text: already text, read directly.
  const raw = await readFile(join(dir, file), "utf8");
  return raw.replace(/\n{3,}/g, "\n\n").trim();
}

async function extractText(dir: string): Promise<string> {
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

  const parts: string[] = [];
  for (const file of files) {
    const text = await extractFileText(dir, file);
    parts.push(`## Source: ${file}\n\n${text}`);
    console.log(`  read ${file}`);
  }
  return parts.join("\n\n");
}

async function main(): Promise<void> {
  const { client: clientId, dir } = parseArgs();
  if (!clientId || !dir) {
    console.error("Usage: npm run ingest-text -- --client <client_id> --dir <doc_dir>");
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

  const { data: client, error: clientErr } = await db
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr) throw clientErr;
  if (!client) throw new Error(`Client ${clientId} not found.`);

  console.log(`Extracting KB text for "${client.name}" (${clientId}) from ${dir}`);
  const text = await extractText(dir);

  const { error } = await db
    .from("clients")
    .update({ knowledge_base: text })
    .eq("id", clientId);
  if (error) throw error;

  console.log(`Stored ${text.length} characters of KB text. Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
