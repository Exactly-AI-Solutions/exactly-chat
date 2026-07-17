/**
 * Create a new client (the unit of tenancy). Offline, Exactly-operated.
 *
 *   npm run create-client -- --name "Comm-Fit" [--origins "https://a.com,https://b.com"]
 *
 * Prints the new client UUID. Feed that UUID to `set-config`, `mint-key`, and
 * the ingest scripts. Config content (guidelines / qa / kb / widget) is attached
 * separately with `set-config` so this script stays a single, focused step.
 */
import "dotenv/config";
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
  const name = args.name?.trim();
  if (!name) {
    console.error('Usage: npm run create-client -- --name "<name>" [--origins <csv>]');
    process.exit(1);
  }

  const insert: Record<string, unknown> = { name };
  if (args.origins) {
    insert.allowed_origins = args.origins
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const db = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await db.from("clients").insert(insert).select("id, name").single();
  if (error) throw error;

  console.log(`Created client "${data.name}".`);
  console.log(`\n  ${data.id}\n`);
  console.log("Next: set-config (guidelines/qa/kb/widget), mint-key, and whitelist origins.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
