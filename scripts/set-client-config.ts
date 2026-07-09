/**
 * Set a client's text config from files: Guidelines, QA Samples, Knowledge Base.
 *
 *   npm run set-config -- --client <id> \
 *     --guidelines client-config/howorth-francis/guidelines.md \
 *     --qa        client-config/howorth-francis/qa-samples.md \
 *     --kb        kb/howorth_francis_kb_v1.4.md
 *
 * Any subset of --guidelines / --qa / --kb may be provided. Updates only those.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

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

async function main(): Promise<void> {
  const args = parseArgs();
  const clientId = args.client;
  if (!clientId) {
    console.error(
      "Usage: npm run set-config -- --client <id> [--guidelines <file>] [--qa <file>] [--kb <file>] [--widget <file>]",
    );
    process.exit(1);
  }
  if (clientId.startsWith("eck_")) {
    console.error(
      "--client expects the client UUID (from `insert into clients ... returning id`), not the API key (eck_...).",
    );
    process.exit(1);
  }

  const update: Record<string, unknown> = {};
  if (args.guidelines) update.guidelines = await readFile(args.guidelines, "utf8");
  if (args.qa) update.qa_samples = await readFile(args.qa, "utf8");
  if (args.kb) update.knowledge_base = await readFile(args.kb, "utf8");
  if (args.widget) update.widget_config = JSON.parse(await readFile(args.widget, "utf8"));
  if (args.origins) {
    update.allowed_origins = args.origins
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Object.keys(update).length === 0) {
    console.error(
      "Nothing to set. Pass at least one of --guidelines / --qa / --kb / --widget <file> / --origins <csv>.",
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

  const { error } = await db.from("clients").update(update).eq("id", clientId);
  if (error) throw error;

  console.log(`Updated ${client.name} (${clientId}):`);
  for (const [k, v] of Object.entries(update)) {
    const desc =
      typeof v === "string" ? `${v.length} chars` : Array.isArray(v) ? v.join(", ") : "set";
    console.log(`  ${k}: ${desc}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
