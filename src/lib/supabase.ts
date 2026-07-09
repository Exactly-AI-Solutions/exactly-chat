import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/config";

let client: SupabaseClient | undefined;

/**
 * Server-only Supabase client using the service-role (secret) key.
 *
 * The secret key bypasses RLS by design (ADR-0004) — RLS is enabled on every
 * table purely to lock the anon/publishable role out of the public REST API,
 * not for tenant isolation. All client-vs-client isolation is enforced by the
 * data-access seam in `data.ts`; do NOT use this client to touch tenant-owned
 * tables directly outside that seam.
 */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(
      requireEnv("supabaseUrl"),
      requireEnv("supabaseSecretKey"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return client;
}
