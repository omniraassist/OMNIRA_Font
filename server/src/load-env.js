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
