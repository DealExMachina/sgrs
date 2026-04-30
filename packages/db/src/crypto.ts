/**
 * SGRS cryptographic helpers — AES-256-GCM API key encryption.
 *
 * Wire format (stored in `api_key_enc` column):
 *   base64(iv) ":" base64(authTag) ":" base64(ciphertext)
 *
 * Key material comes from ENCRYPTION_KEY environment variable, which must be
 * a base64-encoded 32-byte (256-bit) secret.
 *
 * Call `validateEncryptionKey()` at server startup to fail fast if the key is
 * absent or malformed — before accepting any traffic.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
/** 96-bit nonce is the recommended IV size for GCM. */
const IV_BYTES = 12;

// ─── Key loading ──────────────────────────────────────────────────────────────

/** Module-level cache — resolved once, reused for all subsequent calls. */
let _cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "[SGRS][crypto] ENCRYPTION_KEY environment variable is not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `[SGRS][crypto] ENCRYPTION_KEY must decode to exactly 32 bytes (got ${buf.length}). ` +
        "Ensure it is a base64-encoded 256-bit key."
    );
  }
  _cachedKey = buf;
  return buf;
}

/**
 * Explicit startup validator — call once in server `main()` to surface key
 * problems before any requests are served.
 *
 * @throws If ENCRYPTION_KEY is absent or malformed.
 */
export function validateEncryptionKey(): void {
  resolveKey(); // throws on error, caches on success
}

// ─── Encryption / Decryption ──────────────────────────────────────────────────

/**
 * Encrypt an API key for storage.
 *
 * @param plaintext - The raw API key string (e.g. "sk-…").
 * @returns Wire-format ciphertext: `base64(iv):base64(authTag):base64(ciphertext)`
 * @throws If ENCRYPTION_KEY is missing or invalid.
 */
export function encryptApiKey(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a stored API key ciphertext.
 *
 * @param ciphertext - Wire-format string from the `api_key_enc` column.
 * @returns The original plaintext API key.
 * @throws If ENCRYPTION_KEY is wrong, or the ciphertext is tampered/malformed.
 */
export function decryptApiKey(ciphertext: string): string {
  const key = resolveKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "[SGRS][crypto] Malformed api_key_enc — expected 'iv:authTag:ciphertext' format."
    );
  }

  const [ivB64, tagB64, encB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
