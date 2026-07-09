/**
 * Mint a publishable API key for a client (ADR-0002). Offline, Exactly-operated.
 *
 *   npm run mint-key -- --client <client_id>
 *
 * Stores only the prefix + SHA-256 hash; prints the full key ONCE. It cannot be
 * recovered later — if lost, mint a new one and revoke the old.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { generateApiKey } from "../src/lib/api-key";

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
  const { client: clientId } = parseArgs();
  if (!clientId) {
    console.error("Usage: npm run mint-key -- --client <client_id>");
    process.exit(1);
  }
  if (clientId.startsWith("eck_")) {
    console.error(
      "--client expects the client UUID (from `insert into clients ... returning id`), not an API key (eck_...).",
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

  const { key, keyPrefix, keyHash } = generateApiKey();
  const { error } = await db.from("api_keys").insert({
    client_id: clientId,
    key_prefix: keyPrefix,
    key_hash: keyHash,
  });
  if (error) throw error;

  console.log(`Minted API key for "${client.name}" (${clientId}).`);
  console.log(`\n  ${key}\n`);
  console.log("Store it now — it will not be shown again.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
