/**
 * AES-256-GCM at-rest encryption for the calendar connection credentials.
 *
 * We never store raw OAuth tokens or Apple app-specific passwords in the
 * database — they are encrypted with a 32-byte key sourced from the
 * `CALENDAR_TOKEN_ENC_KEY` env var (base64). To rotate the key, you would
 * re-encrypt every row with a migration script (out of scope here).
 *
 * Ciphertext envelope (single column):
 *   "v1.{iv-b64}.{tag-b64}.{ciphertext-b64}"
 *
 * v1 lets us evolve the format later without losing existing rows.
 */
import crypto from "node:crypto";

const VERSION = "v1";

function getKey() {
  const raw = String(process.env.CALENDAR_TOKEN_ENC_KEY || "").trim();
  if (!raw) {
    throw new Error(
      "CALENDAR_TOKEN_ENC_KEY env is not configured. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("CALENDAR_TOKEN_ENC_KEY must decode to exactly 32 bytes (256 bits) of base64.");
  }
  return buf;
}

export function isCalendarCryptoConfigured() {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt an arbitrary JSON-serialisable object. Returns the storage envelope.
 */
export function encryptCredentials(obj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(obj), "utf8");
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

/**
 * Decrypt a storage envelope back to the original object. Throws on tampering
 * or wrong key.
 */
export function decryptCredentials(envelope) {
  if (typeof envelope !== "string" || !envelope.startsWith(`${VERSION}.`)) {
    throw new Error("Invalid credential envelope (unknown version).");
  }
  const [, ivB64, tagB64, ctB64] = envelope.split(".");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("Invalid credential envelope (bad shape).");
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}
