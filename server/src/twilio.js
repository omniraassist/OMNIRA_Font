/**
 * Twilio WhatsApp virtual number service.
 *
 * Omnira owns a pool of Twilio WhatsApp-enabled numbers stored in
 * `twilio_number_pool`. When a customer pays, one available number is
 * automatically assigned to them. Inbound messages from Twilio hit
 * POST /api/twilio/whatsapp/webhook, are routed to the right customer's
 * bot config, processed with OpenAI, and replied via Twilio.
 */

import twilio from "twilio";
import { supabaseAdmin } from "./config/supabase.js";

// ---------------------------------------------------------------------------
// Twilio client (lazy init)
// ---------------------------------------------------------------------------

let _twilioClient = null;

export function getTwilioClient() {
  if (_twilioClient) return _twilioClient;
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken  = String(process.env.TWILIO_AUTH_TOKEN  || "").trim();
  if (!accountSid || !authToken) return null;
  _twilioClient = twilio(accountSid, authToken);
  return _twilioClient;
}

export function isTwilioConfigured() {
  return (
    Boolean(process.env.TWILIO_ACCOUNT_SID) &&
    Boolean(process.env.TWILIO_AUTH_TOKEN)
  );
}

// ---------------------------------------------------------------------------
// Number pool — assign / release
// ---------------------------------------------------------------------------

/**
 * Assigns the first available number in the pool to a customer.
 * Idempotent: if the customer already has a number, returns it.
 */
export async function assignNumberToCustomer(customerId) {
  if (!customerId) return { ok: false, reason: "missing_customer_id" };

  // Already assigned?
  const { data: existing } = await supabaseAdmin
    .from("twilio_number_pool")
    .select("id, phone_number, twilio_sid")
    .eq("customer_user_id", customerId)
    .eq("status", "assigned")
    .maybeSingle();

  if (existing) {
    return { ok: true, duplicate: true, number: existing };
  }

  // Pick first available number.
  const { data: available, error } = await supabaseAdmin
    .from("twilio_number_pool")
    .select("id, phone_number, twilio_sid")
    .eq("status", "available")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };
  if (!available) return { ok: false, reason: "no_numbers_available" };

  const now = new Date().toISOString();
  const { error: upErr } = await supabaseAdmin
    .from("twilio_number_pool")
    .update({
      status: "assigned",
      customer_user_id: customerId,
      assigned_at: now,
      released_at: null,
      updated_at: now
    })
    .eq("id", available.id)
    .eq("status", "available"); // optimistic lock — prevents double-assign on concurrent requests

  if (upErr) return { ok: false, reason: upErr.message };

  console.log(`[twilio] assigned ${available.phone_number} to customer ${customerId}`);
  return { ok: true, number: available };
}

/**
 * Releases a customer's number back to the pool (e.g. on subscription expiry).
 */
export async function releaseCustomerNumber(customerId) {
  if (!customerId) return { ok: false, reason: "missing_customer_id" };

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("twilio_number_pool")
    .update({
      status: "available",
      customer_user_id: null,
      released_at: now,
      updated_at: now
    })
    .eq("customer_user_id", customerId)
    .eq("status", "assigned");

  if (error) return { ok: false, reason: error.message };
  console.log(`[twilio] released number for customer ${customerId}`);
  return { ok: true };
}

/**
 * Returns the number currently assigned to a customer, or null.
 */
export async function getCustomerNumber(customerId) {
  if (!customerId) return null;
  const { data } = await supabaseAdmin
    .from("twilio_number_pool")
    .select("phone_number, twilio_sid, assigned_at, friendly_name")
    .eq("customer_user_id", customerId)
    .eq("status", "assigned")
    .maybeSingle();
  return data || null;
}

// ---------------------------------------------------------------------------
// Outbound — send a WhatsApp message via Twilio
// ---------------------------------------------------------------------------

/**
 * Sends a WhatsApp message from a Twilio number to an end-user.
 * `from` must be E.164, e.g. +34911234567 (the Omnira-owned Twilio number).
 * `to`   must be E.164, e.g. +34666123456 (the end-user's phone).
 */
export async function sendTwilioWhatsAppMessage(from, to, body) {
  const client = getTwilioClient();
  if (!client) {
    console.warn("[twilio] sendTwilioWhatsAppMessage: client not configured");
    return { ok: false, snippet: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set" };
  }
  try {
    const msg = await client.messages.create({
      from: `whatsapp:${from}`,
      to:   `whatsapp:${to}`,
      body: String(body || "").slice(0, 4096)
    });
    return { ok: true, sid: msg.sid };
  } catch (e) {
    console.error("[twilio] send failed:", e?.message || e);
    return { ok: false, snippet: String(e?.message || e).slice(0, 300) };
  }
}

// ---------------------------------------------------------------------------
// Inbound webhook — route message to the right customer's bot
// ---------------------------------------------------------------------------

/**
 * Finds the customer assigned to the Twilio `To` number (e.g. whatsapp:+34911234567).
 */
export async function findCustomerByTwilioNumber(toRaw) {
  // Twilio sends "whatsapp:+34911234567" — strip the prefix.
  const phoneNumber = String(toRaw || "").replace(/^whatsapp:/i, "").trim();
  if (!phoneNumber) return null;

  const { data } = await supabaseAdmin
    .from("twilio_number_pool")
    .select("customer_user_id, phone_number")
    .eq("phone_number", phoneNumber)
    .eq("status", "assigned")
    .maybeSingle();

  return data || null;
}

// ---------------------------------------------------------------------------
// Conversation rate limits (Plan A — OMNIRA absorbs Twilio cost)
// ---------------------------------------------------------------------------

// Max unique contacts/month per plan tier.
export const PLAN_CONVERSATION_LIMITS = {
  monthly:    300,
  quarterly:  500,
  semiannual: 1000,
  annual:     2000,
};

const DEFAULT_LIMIT = 300; // fallback when plan is unknown

function monthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Checks whether a customer can receive a message from `fromPhone` this month.
 * If the contact is new this month and the customer is under their limit,
 * records the new conversation and returns { allowed: true }.
 * If the limit is reached, returns { allowed: false, used, limit }.
 */
export async function checkAndIncrementConversation(customerId, fromPhone, planId) {
  const limit = PLAN_CONVERSATION_LIMITS[planId] ?? DEFAULT_LIMIT;
  const mk = monthKey();

  // Is this contact already active for this customer this month?
  const { data: existing } = await supabaseAdmin
    .from("twilio_conversation_windows")
    .select("id")
    .eq("customer_user_id", customerId)
    .eq("wa_from", fromPhone)
    .eq("month_key", mk)
    .maybeSingle();

  if (existing) {
    // Existing conversation — always allowed, no need to recount.
    return { allowed: true, existing: true };
  }

  // New contact this month — check current count first.
  const { count } = await supabaseAdmin
    .from("twilio_conversation_windows")
    .select("id", { count: "exact", head: true })
    .eq("customer_user_id", customerId)
    .eq("month_key", mk);

  const used = count ?? 0;
  if (used >= limit) {
    return { allowed: false, used, limit };
  }

  // Under limit — record this new conversation.
  await supabaseAdmin
    .from("twilio_conversation_windows")
    .insert({ customer_user_id: customerId, wa_from: fromPhone, month_key: mk })
    .onConflict("customer_user_id, wa_from, month_key")   // safety: concurrent request
    .ignore();

  return { allowed: true, existing: false, used: used + 1, limit };
}

/**
 * Returns how many unique conversations a customer has used this month.
 */
export async function getConversationUsage(customerId) {
  const mk = monthKey();
  const { count } = await supabaseAdmin
    .from("twilio_conversation_windows")
    .select("id", { count: "exact", head: true })
    .eq("customer_user_id", customerId)
    .eq("month_key", mk);
  return count ?? 0;
}

// ---------------------------------------------------------------------------

/**
 * Validates that a Twilio inbound request is authentic by checking the
 * X-Twilio-Signature header against the TWILIO_AUTH_TOKEN.
 * Pass `skip=true` in local dev when TWILIO_WEBHOOK_INSECURE_LOCAL=true.
 */
export function shouldSkipTwilioSignature() {
  return (
    process.env.NODE_ENV !== "production" &&
    String(process.env.TWILIO_WEBHOOK_INSECURE_LOCAL || "").trim() === "true"
  );
}

export function verifyTwilioSignature(req) {
  if (shouldSkipTwilioSignature()) return true;
  try {
    const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
    if (!authToken) return false;
    const url = String(process.env.PUBLIC_API_URL || `https://${req.headers.host}`).replace(/\/$/, "")
      + req.originalUrl;
    const signature = req.headers["x-twilio-signature"] || "";
    return twilio.validateRequest(authToken, signature, url, req.body || {});
  } catch {
    return false;
  }
}
