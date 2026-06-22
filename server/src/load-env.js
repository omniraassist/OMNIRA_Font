/**
 * Must load before any module reads process.env from server/.env (local only).
 * On Vercel, env vars are injected — never read .env from disk.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const isVercelRuntime = Boolean(process.env.VERCEL);

if (!isVercelRuntime) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.join(dir, "..", ".env") });
  dotenv.config();
}

// Validate critical secrets at startup. On Vercel / production, abort if
// CUSTOMER_JWT_SECRET is missing — it would allow forging tokens for any user.
const isProduction = isVercelRuntime || process.env.NODE_ENV === "production";
if (isProduction) {
  const missing = ["CUSTOMER_JWT_SECRET"].filter(
    (k) => !String(process.env[k] || "").trim()
  );
  if (missing.length) {
    console.error(`[FATAL] Missing required env vars in production: ${missing.join(", ")}. Shutting down.`);
    process.exit(1);
  }
}
