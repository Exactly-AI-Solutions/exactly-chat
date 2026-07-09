import "server-only";
import { db } from "./supabase";
import { hashesEqual, parseKeyPrefix, sha256Hex } from "./api-key";

/**
 * Request authentication and the domain whitelist (ADR-0002).
 *
 * `resolveClientFromApiKey` is deliberately cross-client — it *resolves* the
 * tenant from a key — so it lives here, not in the tenant-scoped data seam.
 * Once it returns a clientId, everything downstream flows through the seam.
 */

/** Extract the Bearer API key from a request, or null. */
export function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : null;
}

/**
 * Resolve which client an API key belongs to, or null if invalid/revoked.
 * Fast indexed prefix lookup + constant-time SHA-256 compare (ADR-0002).
 */
export async function resolveClientFromApiKey(
  key: string,
): Promise<string | null> {
  const prefix = parseKeyPrefix(key);
  if (!prefix) return null;

  const { data, error } = await db()
    .from("api_keys")
    .select("client_id, key_hash, revoked_at")
    .eq("key_prefix", prefix)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at) return null;
  if (!hashesEqual(sha256Hex(key), data.key_hash)) return null;

  return data.client_id as string;
}

/**
 * Domain whitelist check (ADR-0002 Layer A). A browser always sends a truthful
 * `Origin`; absence means a non-browser caller (curl / server), where Layer A
 * cannot meaningfully apply and Origin is forgeable anyway — so we don't block.
 */
export function checkOrigin(
  req: Request,
  allowedOrigins: string[],
): { ok: boolean; origin: string | null } {
  const origin = req.headers.get("origin");
  if (!origin) return { ok: true, origin: null };
  return { ok: allowedOrigins.includes(origin), origin };
}

/**
 * CORS headers. Pass the origin to grant it access; pass null to withhold the
 * `Access-Control-Allow-Origin` header entirely (used to reject a disallowed
 * origin — the browser then blocks the response, which is the intent).
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Expose-Headers": "x-conversation-id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
