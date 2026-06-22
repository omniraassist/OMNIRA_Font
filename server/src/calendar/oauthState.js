/**
 * Signed CSRF state token for the OAuth round-trip.
 *
 * We bind the state to the customerId so a stolen state can't be replayed
 * against a different user's account, and we set a short TTL so a leaked
 * state expires fast. The HMAC uses the existing CUSTOMER_JWT_SECRET so
 * there's no new secret to manage.
 *
 * Token shape (base64url-encoded JSON + signature):
 *   "<payload-b64>.<sig-b64>"
 * Payload: { c: <customerId>, p: <provider>, n: <nonce>, e: <expiry-ms> }
 */
import crypto from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getSecret() {
  const s = String(process.env.CUSTOMER_JWT_SECRET || "").trim();
  if (!s && (process.env.VERCEL || process.env.NODE_ENV === "production")) {
    console.error("[FATAL] CUSTOMER_JWT_SECRET missing — OAuth state tokens are insecure.");
  }
  return s || "omnira-dev-insecure-oauth-state-secret";
}

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlDecode(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function createOAuthState({ customerId, provider }) {
  const payload = {
    c: String(customerId),
    p: String(provider),
    n: crypto.randomBytes(12).toString("hex"),
    e: Date.now() + STATE_TTL_MS,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(crypto.createHmac("sha256", getSecret()).update(payloadB64).digest());
  return `${payloadB64}.${sig}`;
}

export function verifyOAuthState(token, { provider } = {}) {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "bad-format" };
  }
  const [payloadB64, sig] = token.split(".");
  const expectedSig = b64url(crypto.createHmac("sha256", getSecret()).update(payloadB64).digest());
  const sigBuf = Buffer.from(sig ?? "");
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: "bad-signature" };
  }
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "bad-payload" };
  }
  if (!payload || typeof payload !== "object") return { ok: false, reason: "bad-payload" };
  if (typeof payload.e !== "number" || payload.e < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (provider && payload.p !== provider) {
    return { ok: false, reason: "provider-mismatch" };
  }
  return { ok: true, customerId: payload.c, provider: payload.p };
}
