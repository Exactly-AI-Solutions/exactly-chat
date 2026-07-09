import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Publishable API key format + hashing (ADR-0002). Pure (no DB, no server-only)
 * so both the app's auth module and the offline mint script can use it.
 *
 * Key shape: `eck_<prefixHex>_<secret>`
 *   - `eck_<prefixHex>` is the public, indexed lookup id (stored as key_prefix).
 *   - the full key is hashed with SHA-256 and stored as key_hash.
 * The key is public by nature, so the hash is fast (not bcrypt) — it only avoids
 * storing usable plaintext at rest, and enables an O(1) prefix lookup.
 */

const KEY_LABEL = "eck";

export function generateApiKey(): {
  key: string;
  keyPrefix: string;
  keyHash: string;
} {
  const prefixHex = randomBytes(8).toString("hex"); // 16 chars
  const secret = randomBytes(24).toString("base64url"); // ~32 chars
  const key = `${KEY_LABEL}_${prefixHex}_${secret}`;
  return { key, keyPrefix: `${KEY_LABEL}_${prefixHex}`, keyHash: sha256Hex(key) };
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** The indexed lookup id embedded in a key, or null if the shape is wrong. */
export function parseKeyPrefix(key: string): string | null {
  const parts = key.split("_");
  if (parts.length < 3 || parts[0] !== KEY_LABEL) return null;
  return `${KEY_LABEL}_${parts[1]}`;
}

/** Constant-time compare of two hex SHA-256 digests. */
export function hashesEqual(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
