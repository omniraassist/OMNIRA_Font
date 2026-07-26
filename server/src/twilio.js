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
// Messaging Service — create once, reuse for all pool numbers
// ---------------------------------------------------------------------------

/**
 * Returns the TWILIO_MESSAGING_SERVICE_SID from env or platform_settings,
 * or creates a new Messaging Service and persists the SID.
 */
export async function getOrCreateMessagingService(webhookUrl) {
  // 1. Env var takes priority
  const envSid = String(process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  if (envSid) return { ok: true, sid: envSid, created: false };

  // 2. Check platform_settings (DB)
  const { data: row } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "TWILIO_MESSAGING_SERVICE_SID")
    .maybeSingle();
  if (row?.value) return { ok: true, sid: row.value, created: false };

  // 3. Create one
  const client = getTwilioClient();
  if (!client) return { ok: false, reason: "twilio_not_configured" };
  try {
    const service = await client.messaging.v1.services.create({
      friendlyName: "Omnira WhatsApp Pool",
      inboundRequestUrl: webhookUrl,
      inboundMethod: "POST",
      useInboundWebhookOnNumber: false,
    });
    // Persist in platform_settings so future calls find it
    await supabaseAdmin.from("platform_settings").upsert(
      { key: "TWILIO_MESSAGING_SERVICE_SID", value: service.sid, updated_by: "system" },
      { onConflict: "key" }
    );
    console.log("[twilio] created Messaging Service:", service.sid);
    return { ok: true, sid: service.sid, created: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/**
 * Adds a phone number (by SID) to the Omnira Messaging Service.
 */
export async function addNumberToMessagingService(phoneSid, messagingServiceSid) {
  const client = getTwilioClient();
  if (!client) return { ok: false, reason: "twilio_not_configured" };
  try {
    await client.messaging.v1.services(messagingServiceSid).phoneNumbers.create({
      phoneNumberSid: phoneSid,
    });
    return { ok: true };
  } catch (e) {
    // Duplicate = already added, treat as success
    if (String(e.message).includes("already exists") || e.code === 21710) {
      return { ok: true, duplicate: true };
    }
    return { ok: false, reason: e.message };
  }
}

// ---------------------------------------------------------------------------
// WhatsApp activation — attempt programmatic registration
// ---------------------------------------------------------------------------

/**
 * Attempts to register a phone number as a WhatsApp sender via Twilio's REST API.
 * Works automatically if the Twilio account already has a WhatsApp Business profile
 * connected. Updates whatsapp_status in DB.
 *
 * Returns { ok, status: 'active'|'pending'|'failed', reason? }
 */
export async function activateWhatsAppSender(poolId, phoneSid, phoneNumber) {
  const client = getTwilioClient();
  if (!client) return { ok: false, status: "failed", reason: "twilio_not_configured" };

  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken  = String(process.env.TWILIO_AUTH_TOKEN  || "").trim();

  // Attempt via Twilio's Channels REST API (requires WABA connected in Twilio)
  try {
    const url = `https://messaging.twilio.com/v1/Services`;
    // Resolve messaging service SID
    const webhookBase = String(process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
    const svcResult = await getOrCreateMessagingService(`${webhookBase}/api/twilio/whatsapp/webhook`);
    const serviceSid = svcResult.ok ? svcResult.sid : null;

    if (serviceSid) {
      // Try to create a WhatsApp channel/sender on the messaging service
      const res = await fetch(
        `https://messaging.twilio.com/v1/Services/${serviceSid}/Channels`,
        {
          method: "POST",
          headers: {
            Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            Type: "whatsapp",
            Configuration: JSON.stringify({ phoneNumberSid: phoneSid }),
          }).toString(),
        }
      );
      if (res.ok) {
        await supabaseAdmin
          .from("twilio_number_pool")
          .update({ whatsapp_status: "active", messaging_service_sid: serviceSid, updated_at: new Date().toISOString() })
          .eq("id", poolId);
        console.log(`[twilio] WhatsApp activated for ${phoneNumber} via Channels API`);
        return { ok: true, status: "active" };
      }
      const err = await res.json().catch(() => ({}));
      console.warn(`[twilio] Channels API failed for ${phoneNumber}:`, err?.message || res.status);
    }
  } catch (e) {
    console.warn(`[twilio] WhatsApp Channels API error for ${phoneNumber}:`, e.message);
  }

  // Fallback: mark pending, admin must complete via Twilio console
  await supabaseAdmin
    .from("twilio_number_pool")
    .update({ whatsapp_status: "pending", updated_at: new Date().toISOString() })
    .eq("id", poolId);
  return { ok: false, status: "pending", reason: "waba_not_connected" };
}

/**
 * Checks WhatsApp status by attempting a dry-run via Twilio API.
 * Updates pool row and returns current status.
 */
export async function verifyWhatsAppStatus(poolId, phoneSid, phoneNumber) {
  const client = getTwilioClient();
  if (!client) return { ok: false, status: "failed" };

  try {
    // Fetch the IncomingPhoneNumber and check smsUrl is set (proxy for webhook configured)
    const num = await client.incomingPhoneNumbers(phoneSid).fetch();
    const webhookOk = Boolean(num.smsUrl);

    // Check if it's in a messaging service (implies WhatsApp routing)
    const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
    const authToken  = String(process.env.TWILIO_AUTH_TOKEN  || "").trim();

    // Try sending a zero-cost status check via Twilio's number-capabilities lookup
    const lookupRes = await fetch(
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}?Fields=line_type_intelligence`,
      { headers: { Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64") } }
    );
    const lookupData = await lookupRes.json().catch(() => ({}));
    const isVoip = lookupData?.line_type_intelligence?.type === "voip";

    if (webhookOk) {
      // Webhook is set — number is correctly configured.
      // Mark active if it was pending (admin may have done console setup).
      await supabaseAdmin
        .from("twilio_number_pool")
        .update({ whatsapp_status: "active", updated_at: new Date().toISOString() })
        .eq("id", poolId)
        .eq("whatsapp_status", "pending");
      return { ok: true, status: "active", webhookOk, isVoip };
    }

    return { ok: false, status: "pending", webhookOk, isVoip };
  } catch (e) {
    return { ok: false, status: "failed", reason: e.message };
  }
}

/**
 * Full one-shot provisioning: buy number + set webhook + add to messaging service
 * + attempt WhatsApp activation. Returns poolId and final whatsapp_status.
 */
export async function provisionAndActivate({ phoneNumber, friendlyName, monthlyCostCents, webhookUrl }) {
  const client = getTwilioClient();
  if (!client) return { ok: false, reason: "twilio_not_configured" };

  // 1. Purchase the number
  let purchased;
  try {
    purchased = await client.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName: friendlyName || phoneNumber,
      smsUrl: webhookUrl,
      smsMethod: "POST",
    });
  } catch (e) {
    return { ok: false, reason: `Twilio rechazó la compra: ${e.message}` };
  }

  // 2. Add to DB pool (status pending while we try WhatsApp)
  const { data: poolRow, error: dbErr } = await supabaseAdmin
    .from("twilio_number_pool")
    .insert({
      phone_number:       purchased.phoneNumber,
      twilio_sid:         purchased.sid,
      friendly_name:      purchased.friendlyName || friendlyName || purchased.phoneNumber,
      monthly_cost_cents: monthlyCostCents || 100,
      status:             "available",
      whatsapp_status:    "pending",
    })
    .select("id, phone_number, twilio_sid, whatsapp_status")
    .single();

  if (dbErr) {
    console.error("[twilio] DB insert failed for", purchased.sid, dbErr.message);
    return {
      ok: false,
      reason: `Número comprado (SID ${purchased.sid}) pero error en BD: ${dbErr.message}`,
    };
  }

  // 3. Get/create messaging service and add number to it
  const svcResult = await getOrCreateMessagingService(webhookUrl);
  let messagingServiceSid = null;
  if (svcResult.ok) {
    messagingServiceSid = svcResult.sid;
    await addNumberToMessagingService(purchased.sid, messagingServiceSid);
    await supabaseAdmin
      .from("twilio_number_pool")
      .update({ messaging_service_sid: messagingServiceSid })
      .eq("id", poolRow.id);
  }

  // 4. Attempt WhatsApp activation
  const waResult = await activateWhatsAppSender(poolRow.id, purchased.sid, purchased.phoneNumber);

  return {
    ok: true,
    poolId:           poolRow.id,
    phoneNumber:      purchased.phoneNumber,
    twilioSid:        purchased.sid,
    whatsappStatus:   waResult.status,
    messagingService: messagingServiceSid,
    needsConsoleSetup: waResult.status !== "active",
  };
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

  // Pick first available number. Exclude numbers where WhatsApp activation
  // explicitly failed — null (manually-added) and 'pending'/'active' are fine.
  const { data: available, error } = await supabaseAdmin
    .from("twilio_number_pool")
    .select("id, phone_number, twilio_sid")
    .eq("status", "available")
    .neq("whatsapp_status", "failed")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };
  if (!available) return { ok: false, reason: "no_numbers_available" };

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await supabaseAdmin
    .from("twilio_number_pool")
    .update({
      status: "assigned",
      customer_user_id: customerId,
      assigned_at: now,
      released_at: null,
      updated_at: now
    })
    .eq("id", available.id)
    .eq("status", "available") // optimistic lock — prevents double-assign on concurrent requests
    .select("id, phone_number, twilio_sid")
    .maybeSingle();

  if (upErr) return { ok: false, reason: upErr.message };
  // If another concurrent request grabbed the row first, updated is null.
  if (!updated) return { ok: false, reason: "number_taken_by_concurrent_request" };

  console.log(`[twilio] assigned ${updated.phone_number} to customer ${customerId}`);
  return { ok: true, number: updated };
}

/**
 * Releases a customer's number back to the pool (e.g. on subscription expiry).
 */
export async function releaseCustomerNumber(customerId) {
  if (!customerId) return { ok: false, reason: "missing_customer_id" };

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("twilio_number_pool")
    .update({
      status: "available",
      customer_user_id: null,
      released_at: now,
      updated_at: now
    })
    .eq("customer_user_id", customerId)
    .eq("status", "assigned")
    .select("id");

  if (error) return { ok: false, reason: error.message };
  const released = (data || []).length > 0;
  if (released) console.log(`[twilio] released number for customer ${customerId}`);
  return { ok: true, released };
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
  monthly:    200,
  quarterly:  200,
  semiannual: 250,
  annual:     300,
};

const DEFAULT_LIMIT = 200; // fallback when plan is unknown

function monthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Checks whether a customer can receive a message from `fromPhone` this month.
 * If the contact is new this month and the customer is under their plan limit,
 * records the new conversation and returns { allowed: true }.
 * If the plan limit is reached but extra_conversations_balance > 0,
 * consumes one from the extra balance and allows the conversation.
 * If both limits are exhausted, returns { allowed: false, used, limit }.
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
    return { allowed: true, existing: true };
  }

  // New contact this month — check current count.
  const { count } = await supabaseAdmin
    .from("twilio_conversation_windows")
    .select("id", { count: "exact", head: true })
    .eq("customer_user_id", customerId)
    .eq("month_key", mk);

  const used = count ?? 0;

  if (used < limit) {
    // Under plan limit — record this new conversation.
    await supabaseAdmin
      .from("twilio_conversation_windows")
      .upsert(
        { customer_user_id: customerId, wa_from: fromPhone, month_key: mk },
        { onConflict: "customer_user_id,wa_from,month_key", ignoreDuplicates: true }
      );
    return { allowed: true, existing: false, used: used + 1, limit };
  }

  // Plan limit reached — try to consume from extra balance.
  const { data: userRow } = await supabaseAdmin
    .from("customer_users")
    .select("extra_conversations_balance")
    .eq("id", customerId)
    .maybeSingle();

  const extraBalance = Number(userRow?.extra_conversations_balance ?? 0);
  if (extraBalance > 0) {
    // Decrement extra balance and record the conversation.
    await supabaseAdmin
      .from("customer_users")
      .update({ extra_conversations_balance: extraBalance - 1, updated_at: new Date().toISOString() })
      .eq("id", customerId);
    await supabaseAdmin
      .from("twilio_conversation_windows")
      .upsert(
        { customer_user_id: customerId, wa_from: fromPhone, month_key: mk },
        { onConflict: "customer_user_id,wa_from,month_key", ignoreDuplicates: true }
      );
    return { allowed: true, existing: false, used: used + 1, limit, usedExtra: true, extraBalance: extraBalance - 1 };
  }

  return { allowed: false, used, limit, extraBalance: 0 };
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
