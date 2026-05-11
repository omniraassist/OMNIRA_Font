#!/usr/bin/env node
/**
 * Omnira DB schema control (PostgreSQL / Supabase).
 *
 * Uses ONE file only: server/sql/schema.sql
 *
 * Requires a direct Postgres URI (DDL is unreliable through the Supabase pooler on 6543):
 *   Supabase → Project Settings → Database → Connection string → URI → port 5432 (direct).
 *
 * .env (server folder):
 *   DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@db.[ref].supabase.co:5432/postgres
 *
 * Usage:
 *   node schema.js up          — apply server/sql/schema.sql
 *   node schema.js down --yes — DROP all Omnira public tables (destructive)
 *   node schema.js reset --yes — down then up
 *
 * Safety: `down` / `reset` require CLI flag --yes OR env SCHEMA_CONFIRM=yes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config();

/** Strip full-line and end-of-line -- comments (schema has no semicolons inside strings). */
function stripSqlComments(sql) {
  return sql
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (t.startsWith("--")) return "";
      const idx = line.indexOf("--");
      if (idx === -1) return line;
      return line.slice(0, idx).trimEnd();
    })
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function splitStatements(sql) {
  const cleaned = stripSqlComments(sql);
  return cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function getConnectionString() {
  const u =
    String(process.env.DATABASE_URL || "").trim() ||
    String(process.env.DIRECT_URL || "").trim() ||
    String(process.env.SUPABASE_DATABASE_URL || "").trim();
  return u;
}

function getSsl() {
  if (process.env.DATABASE_SSL === "0" || process.env.PGSSLMODE === "disable") {
    return false;
  }
  return { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "0" };
}

async function withClient(fn) {
  const connectionString = getConnectionString();
  if (!connectionString) {
    console.error(
      "Missing DATABASE_URL (or DIRECT_URL / SUPABASE_DATABASE_URL).\n" +
        "Use the Supabase direct Postgres URI (port 5432), not the pooler, for DDL."
    );
    process.exit(1);
  }
  const client = new pg.Client({ connectionString, ssl: getSsl() });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

async function runSchemaSql(client) {
  const full = path.join(__dirname, "sql", "schema.sql");
  if (!fs.existsSync(full)) {
    throw new Error(`Missing ${full}`);
  }
  const sql = fs.readFileSync(full, "utf8");
  const statements = splitStatements(sql);
  for (const st of statements) {
    await client.query(st);
  }
  console.log(`OK: schema.sql (${statements.length} statement(s))`);
}

async function cmdUp() {
  await withClient(runSchemaSql);
  console.log("\nSchema applied (up).");
}

const DROP_ORDER = [
  "public.customer_payments",
  "public.customer_password_resets",
  "public.customer_users",
  "public.admin_password_resets",
  "public.admin_users",
  "public.user_notifications",
  "public.whatsapp_message_templates"
];

async function cmdDown(argv) {
  const ok = argv.includes("--yes") || String(process.env.SCHEMA_CONFIRM || "").toLowerCase() === "yes";
  if (!ok) {
    console.error('Refusing to drop tables without confirmation. Run: node schema.js down --yes\nOr set SCHEMA_CONFIRM=yes');
    process.exit(1);
  }
  await withClient(async (client) => {
    for (const tbl of DROP_ORDER) {
      await client.query(`DROP TABLE IF EXISTS ${tbl} CASCADE;`);
      console.log(`Dropped (if existed): ${tbl}`);
    }
  });
  console.log("\nAll Omnira tables in DROP_ORDER were dropped.");
}

async function cmdReset(argv) {
  await cmdDown(argv);
  await cmdUp();
}

function printHelp() {
  console.log(`
Omnira schema.js — single source: server/sql/schema.sql

  node schema.js up              Apply schema.sql
  node schema.js down --yes      Drop all Omnira tables (destructive)
  node schema.js reset --yes     down --yes, then up

Env: DATABASE_URL (postgres URI, direct :5432 recommended)
`);
}

const cmd = process.argv[2] || "help";
const argv = process.argv.slice(2);

try {
  if (cmd === "up") {
    await cmdUp();
  } else if (cmd === "down") {
    await cmdDown(argv);
  } else if (cmd === "reset") {
    await cmdReset(argv);
  } else {
    printHelp();
    process.exit(cmd === "help" ? 0 : 1);
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
