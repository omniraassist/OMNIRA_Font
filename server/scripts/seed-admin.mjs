/**
 * Omnira admin account seed — creates (or upserts) admin@gmail.com / admin@123! .
 *
 * Uses the same PBKDF2-sha512 salt:hash format that /api/admin/login validates
 * (server/src/index.js → hashPassword / verifyPassword), so the seeded user can
 * sign in immediately without a password reset.
 *
 *   cd server && node scripts/seed-admin.mjs
 *   ADMIN_SEED_EMAIL=other@x.com ADMIN_SEED_PASSWORD=othersecret node scripts/seed-admin.mjs
 *
 * Pre-req: wa_messages / wa_leads / admin_users tables must exist (Supabase →
 * SQL Editor → paste server/sql/schema.sql, OR set DATABASE_URL and run `npm run db:up`).
 */

import "../src/load-env.js";
import crypto from "node:crypto";
import { supabaseAdmin, isSupabaseConfigured } from "../src/config/supabase.js";

const email = String(process.env.ADMIN_SEED_EMAIL || "admin@gmail.com").trim().toLowerCase();
const password = String(process.env.ADMIN_SEED_PASSWORD || "admin@123!");
const fullName = String(process.env.ADMIN_SEED_NAME || "Omnira Admin").trim();

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(plain, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  if (!isSupabaseConfigured()) {
    console.error("Supabase env not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env");
    process.exit(1);
  }

  console.log(`Seeding admin: ${email}`);

  const password_hash = hashPassword(password);
  const now = new Date().toISOString();

  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("admin_users")
    .select("id, email, is_active")
    .eq("email", email)
    .maybeSingle();
  if (lookupErr) {
    console.error("Lookup failed:", lookupErr.message);
    process.exit(1);
  }

  if (existing) {
    const { error } = await supabaseAdmin
      .from("admin_users")
      .update({
        password_hash,
        full_name: fullName,
        is_active: true,
        updated_at: now
      })
      .eq("id", existing.id);
    if (error) {
      console.error("Update failed:", error.message);
      process.exit(1);
    }
    console.log(`✓ Admin password reset for existing row (id=${existing.id}).`);
  } else {
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .insert({ email, password_hash, full_name: fullName, is_active: true })
      .select("id")
      .single();
    if (error) {
      console.error("Insert failed:", error.message);
      if (/relation .* does not exist/i.test(error.message)) {
        console.error(
          "\nThe admin_users table does not exist yet. Apply the schema first:\n" +
            "  Supabase → SQL Editor → paste server/sql/schema.sql and run, or\n" +
            "  set DATABASE_URL in server/.env and run `npm run db:up`.\n"
        );
      }
      process.exit(1);
    }
    console.log(`✓ Admin created (id=${data.id}).`);
  }

  console.log("\nLogin:");
  console.log("  email:    ", email);
  console.log("  password: ", password);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
