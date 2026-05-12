#!/usr/bin/env node
/**
 * Prints X-Hub-Signature-256 for Meta WhatsApp Cloud API webhook POST body.
 * Must match the exact raw JSON string Postman sends (save Body → raw to a file).
 *
 * Usage (from server/):
 *   npm run sign:meta-webhook -- ./wa-body.json
 *   type wa-body.json | node scripts/sign-meta-webhook-signature.mjs
 *
 * Then in Postman: Header X-Hub-Signature-256 = <printed value>
 * Remove Bearer/auth — Meta webhooks do not use Authorization.
 */

import crypto from "crypto";
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const secret = String(process.env.META_WABA_APP_SECRET || "").trim();
if (!secret) {
  console.error("META_WABA_APP_SECRET is missing in server/.env");
  process.exit(1);
}

let raw;
const arg = process.argv[2];
if (arg) {
  raw = fs.readFileSync(path.resolve(process.cwd(), arg), "utf8");
} else {
  raw = fs.readFileSync(0, "utf8");
}

const sig = "sha256=" + crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
console.log(sig);
console.error("\nPostman → Headers → X-Hub-Signature-256 = (value above)\nBody raw must be byte-identical to the signed file.\n");
