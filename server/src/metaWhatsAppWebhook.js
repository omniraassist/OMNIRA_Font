import crypto from "crypto";
import { supabaseAdmin, isSupabaseConfigured } from "./config/supabase.js";
import { getPlatformSetting, snapshotPlatformSettings } from "./platformSettings.js";

async function graphVersion() {
  const gv = String(await getPlatformSetting("META_WABA_GRAPH_VERSION", "v21.0")).trim();
  return gv.startsWith("v") ? gv : `v${gv}`;
}

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), "utf8");
    const bb = Buffer.from(String(b), "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function verifyMetaAppSecretSignature(rawBodyBuffer, signatureHeader, appSecret) {
  const secret = String(appSecret || "").trim();
  if (!secret || !rawBodyBuffer || !Buffer.isBuffer(rawBodyBuffer)) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBodyBuffer).digest("hex");
  const got = String(signatureHeader || "").trim();
  return got.length > 0 && timingSafeEqualHex(expected, got);
}

function inboundBodyFromMessage(m) {
  if (!m || typeof m !== "object") return null;
  if (m.type === "text" && m.text?.body) {
    return String(m.text.body || "").trim().slice(0, 4000);
  }
  const ir = m.interactive;
  if (m.type === "interactive" && ir && typeof ir === "object") {
    if (ir.type === "button_reply" && ir.button_reply?.title) {
      return String(ir.button_reply.title || "").trim().slice(0, 4000);
    }
    if (ir.type === "list_reply" && ir.list_reply?.title) {
      return String(ir.list_reply.title || "").trim().slice(0, 4000);
    }
  }
  if (m.type === "button" && m.button?.text) {
    return String(m.button.text || "").trim().slice(0, 4000);
  }
  return null;
}

export function extractInboundText(body) {
  try {
    const entries = body?.entry;
    if (!Array.isArray(entries)) return null;
    for (const ent of entries) {
      const changes = ent?.changes;
      if (!Array.isArray(changes)) continue;
      for (const ch of changes) {
        const msgs = ch?.value?.messages;
        if (!Array.isArray(msgs)) continue;
        const phoneNumberId = String(ch?.value?.metadata?.phone_number_id || "");
        for (const m of msgs) {
          const textBody = inboundBodyFromMessage(m);
          if (textBody) {
            return {
              from: String(m.from || ""),
              body: textBody,
              phoneNumberId,
              messageId: String(m.id || ""),
              messageType: String(m.type || "text")
            };
          }
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function sendMarketingWhatsAppReply(toE164Digits, text) {
  const token = String(await getPlatformSetting("META_WABA_ACCESS_TOKEN", "")).trim();
  const phoneNumberId = String(await getPlatformSetting("META_WABA_PHONE_NUMBER_ID", "")).trim();
  if (!token || !phoneNumberId || !toE164Digits || !text) {
    return {
      ok: false,
      status: 0,
      snippet: "missing META_WABA_ACCESS_TOKEN, META_WABA_PHONE_NUMBER_ID, or recipient `to`"
    };
  }

  const gv = await graphVersion();
  const url = `https://graph.facebook.com/${gv}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164Digits,
      type: "text",
      text: { preview_url: false, body: text.slice(0, 4096) }
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[meta whatsapp] outbound send failed", res.status, t.slice(0, 500));
    return { ok: false, status: res.status, snippet: t.slice(0, 500) };
  }
  return { ok: true, status: res.status, snippet: "" };
}

// ---------------------------------------------------------------------------
// Multi-tenant helpers — used by the webhook to route each inbound message to
// the right customer's bot using their phone_number_id, their access token,
// their bot prompt + knowledge base, and their business info. Falls back to
// the platform agent when no customer matches.
// ---------------------------------------------------------------------------

export async function findCustomerConfigByPhoneNumberId(phoneNumberId) {
  if (!isSupabaseConfigured() || !phoneNumberId) return null;
  try {
    const { data } = await supabaseAdmin
      .from("customer_whatsapp_configs")
      .select(
        "customer_user_id, meta_access_token, meta_app_secret, meta_verify_token, meta_phone_number_id, meta_business_account_id, meta_display_phone_number, meta_verified_name, meta_graph_version, is_active"
      )
      .eq("meta_phone_number_id", String(phoneNumberId))
      .maybeSingle();
    return data || null;
  } catch (e) {
    console.warn("[meta whatsapp] customer lookup failed:", e?.message || e);
    return null;
  }
}

export async function isCustomerSubscriptionActive(customerId) {
  if (!customerId || !isSupabaseConfigured()) return false;
  try {
    const { data } = await supabaseAdmin
      .from("customer_users")
      .select("subscription_ends_at")
      .eq("id", customerId)
      .maybeSingle();
    return Boolean(data?.subscription_ends_at && new Date(data.subscription_ends_at) > new Date());
  } catch {
    return false;
  }
}

/**
 * Send a WhatsApp message using a *customer's* credentials (their access token
 * + their phone_number_id). Used both for replies the customer's agent
 * generates and for the platform-issued "your plan expired" renewal nudge.
 */
async function sendCustomerWhatsAppMessage(customerConfig, toE164Digits, text) {
  const token = String(customerConfig?.meta_access_token || "").trim();
  const phoneNumberId = String(customerConfig?.meta_phone_number_id || "").trim();
  if (!token || !phoneNumberId || !toE164Digits || !text) {
    return { ok: false, status: 0, snippet: "missing customer credentials or recipient" };
  }
  const gv =
    String(customerConfig?.meta_graph_version || "").trim() ||
    (await graphVersion());
  const versionTag = gv.startsWith("v") ? gv : `v${gv}`;
  const url = `https://graph.facebook.com/${versionTag}/${phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164Digits,
        type: "text",
        text: { preview_url: false, body: text.slice(0, 4096) }
      })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[meta whatsapp] customer outbound failed", res.status, t.slice(0, 300));
      return { ok: false, status: res.status, snippet: t.slice(0, 300) };
    }
    return { ok: true, status: res.status, snippet: "" };
  } catch (e) {
    return { ok: false, status: 0, snippet: e?.message || "network" };
  }
}

/**
 * Load a customer's bot config row (system prompt + knowledge base + greeting).
 * Falls back to the platform row if the customer never edited theirs, so the
 * agent always has something coherent to say.
 */
async function loadCustomerBotConfig(customerId) {
  const platform = await loadPlatformBotConfig();
  if (!customerId || !isSupabaseConfigured()) return platform;
  try {
    const { data } = await supabaseAdmin
      .from("bot_configs")
      .select("system_prompt, knowledge_base, greeting")
      .eq("scope", "customer")
      .eq("customer_user_id", customerId)
      .maybeSingle();
    if (!data) return platform;
    return {
      systemPrompt: String(data.system_prompt || platform.systemPrompt || "").slice(0, 16000),
      knowledgeBase: String(data.knowledge_base || "").slice(0, 32000),
      leadExtractionPrompt: platform.leadExtractionPrompt,
      greeting: String(data.greeting || "").slice(0, 1000)
    };
  } catch {
    return platform;
  }
}

async function loadCustomerBusiness(customerId) {
  if (!customerId || !isSupabaseConfigured()) return null;
  try {
    const { data } = await supabaseAdmin
      .from("customer_business_info")
      .select("name, type, phone, email, address, hours, services")
      .eq("customer_user_id", customerId)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

const DEFAULT_CUSTOMER_SYSTEM_PROMPT = `You are the official assistant for the business in BUSINESS CONTEXT below. You speak as a human staff member of this business. Detect the user's language and ALWAYS reply in it.

STYLE — non-negotiable:
- BRIEF: max 2-3 lines per reply. No bullet points, no long paragraphs. WhatsApp-friendly.
- One clear question or action per message — never dump multiple questions at once.
- Warm and direct. Move the conversation forward.

RULES:
- Use BUSINESS CONTEXT and KNOWLEDGE BASE as sole source of truth. Never invent details.
- If something isn't covered, say you'll check and offer to connect with the team.
- Use the GREETING verbatim (or slightly adapted) at the start of a fresh conversation.
- Never say you are an AI or mention Omnira unless directly asked.
- SCHEDULING: When the user wants a call, meeting or appointment — collect name (if unknown), preferred date+time, and reason. Confirm back. Then say the appointment is noted and someone will confirm shortly.`;

/**
 * Builds the full system prompt sent to OpenAI for a customer's inbound. Every
 * field the customer filled in the dashboard (chatbot greeting, custom system
 * prompt / instructions, knowledge base, business info) is included verbatim
 * so the bot adopts ALL of it. The order is:
 *   1. System prompt / instructions the customer wrote ("Instrucciones especiales")
 *      — or the strict default above if they left it empty.
 *   2. Business context block (name, type, phone, email, address, hours, services).
 *   3. Greeting (separate block so the bot uses it on the first turn).
 *   4. Knowledge base (the long-form text the customer pasted in /knowledge).
 */
function buildCustomerSystemPrompt(customerBot, business) {
  let prompt = String(customerBot?.systemPrompt || DEFAULT_CUSTOMER_SYSTEM_PROMPT);

  // Business context
  if (business && Object.values(business).some(Boolean)) {
    prompt += `\n\n# BUSINESS CONTEXT (this is who you work for — speak as them)\n`;
    if (business.name) prompt += `Business name: ${business.name}\n`;
    if (business.type) prompt += `Type / industry: ${business.type}\n`;
    if (business.phone) prompt += `Phone: ${business.phone}\n`;
    if (business.email) prompt += `Email: ${business.email}\n`;
    if (business.address) prompt += `Address: ${business.address}\n`;
    if (business.hours) prompt += `Opening hours:\n${business.hours}\n`;
    if (business.services) prompt += `Services & prices:\n${business.services}\n`;
  }

  // Greeting (verbatim — used at the start of a fresh conversation)
  if (customerBot?.greeting && customerBot.greeting.trim()) {
    prompt += `\n\n# GREETING (use this — verbatim or slightly adapted — when opening a fresh conversation)\n${customerBot.greeting.trim()}`;
  }

  // Long-form knowledge base
  if (customerBot?.knowledgeBase && customerBot.knowledgeBase.trim()) {
    prompt += `\n\n# KNOWLEDGE BASE (treat as source of truth — quote facts from here)\n${customerBot.knowledgeBase.trim()}`;
  }

  return prompt.slice(0, 24000);
}

/**
 * Used by the verify endpoint to send the welcome WhatsApp message to the
 * customer's own personal number after their credentials check out.
 */
export async function sendWelcomeWhatsAppMessage(customerConfig, customerPersonalDigits) {
  const phone = String(customerPersonalDigits || "").replace(/\D/g, "");
  if (!phone) return { ok: false, snippet: "no recipient" };
  const body =
    "🎉 ¡Bienvenido a Omnira! Tu agente de WhatsApp está ACTIVO 24/7. " +
    "Tus credenciales de Meta están verificadas y todo está listo. " +
    "Cuando un cliente te escriba, Omnira responderá automáticamente con tu prompt y base de conocimiento. " +
    "Si necesitas ayuda: ayuda@omnira.chat.";
  return await sendCustomerWhatsAppMessage(customerConfig, phone, body);
}

/**
 * The agent's system prompt and lead-extraction prompt live in Supabase
 * (public.bot_configs, scope='platform') so admins can edit them from /bot-config
 * without redeploying. These are the bare-minimum fallbacks used only if the DB
 * row is missing — in production the seed migration creates it on first apply.
 */
const FALLBACK_SYSTEM_PROMPT =
  "You are Omnira's WhatsApp sales closer. Your ONLY goals: qualify the lead and get them to book a call or visit the website to sign up. Reply in the user's language. Keep replies SHORT — max 2-3 lines, no lists, no long explanations. One punchy question or CTA per message. Hook with the value (AI agent that responds 24/7 on WhatsApp, captures leads automatically, books appointments). Pricing: from 49€/month. Sign up: omnira. Support: ayuda@omnira.chat. If they ask to schedule a call or demo, ask for their name, preferred date+time, and what they want to discuss — then confirm and say the team will reach out. Never invent features. Never write more than 3 lines.";

const FALLBACK_LEAD_EXTRACTION_PROMPT =
  'You are an information extractor for a WhatsApp sales conversation. Output ONE JSON object with keys: name, email, phone, business_name, intent ("pricing"|"booking"|"support"|"demo"|"integration"|"info"|"other"), language (ISO 639-1), confidence (0..1), notes (≤200 chars). Use null for missing fields. Output ONLY JSON.';

const BOT_CONFIG_CACHE_TTL_MS = 30_000;
let _botConfigCache = null;
let _botConfigCacheAt = 0;

export function invalidateBotConfigCache() {
  _botConfigCache = null;
  _botConfigCacheAt = 0;
}

/**
 * Returns { systemPrompt, knowledgeBase, leadExtractionPrompt, greeting } for
 * the platform agent. customer-scope rows ship to Phase 3 routing (where each
 * customer_user_id maps to its own row); Phase 1 always uses platform.
 */
async function loadPlatformBotConfig() {
  if (_botConfigCache && Date.now() - _botConfigCacheAt < BOT_CONFIG_CACHE_TTL_MS) {
    return _botConfigCache;
  }
  if (!isSupabaseConfigured()) {
    _botConfigCache = {
      systemPrompt: FALLBACK_SYSTEM_PROMPT,
      knowledgeBase: "",
      leadExtractionPrompt: FALLBACK_LEAD_EXTRACTION_PROMPT,
      greeting: ""
    };
    _botConfigCacheAt = Date.now();
    return _botConfigCache;
  }
  try {
    const { data } = await supabaseAdmin
      .from("bot_configs")
      .select("system_prompt, knowledge_base, lead_extraction_prompt, greeting, is_active")
      .eq("scope", "platform")
      .maybeSingle();
    const row = data || {};
    _botConfigCache = {
      systemPrompt: String(row.system_prompt || FALLBACK_SYSTEM_PROMPT).slice(0, 16000),
      knowledgeBase: String(row.knowledge_base || "").slice(0, 32000),
      leadExtractionPrompt: String(row.lead_extraction_prompt || FALLBACK_LEAD_EXTRACTION_PROMPT).slice(0, 8000),
      greeting: String(row.greeting || "").slice(0, 1000),
      isActive: row.is_active !== false
    };
    _botConfigCacheAt = Date.now();
    return _botConfigCache;
  } catch (e) {
    console.warn("[meta whatsapp] loadPlatformBotConfig fell back:", e?.message || e);
    return {
      systemPrompt: FALLBACK_SYSTEM_PROMPT,
      knowledgeBase: "",
      leadExtractionPrompt: FALLBACK_LEAD_EXTRACTION_PROMPT,
      greeting: ""
    };
  }
}

/**
 * Build the OpenAI key candidate chain in priority order:
 *   1) process.env.OPENAI_API_KEY (Vercel primary)
 *   2) platform_settings.OPENAI_API_KEY (admin override)
 *   3) public.openai_api_keys rows where is_active=true, by sort_order, created_at
 *
 * The webhook tries each in order on auth / quota failure (see callOpenAiWithRetry).
 * Returned objects include { source, id, key } so we can attribute success/fail
 * back to a specific row for the admin's "last failed" tracking.
 */
async function listOpenAiKeys() {
  const seen = new Set();
  const out = [];

  const envNames = ["OPENAI_API_KEY", "OPENAI_KEY", "OPEN_AI_API_KEY", "OPENAI_SECRET_KEY", "CHAT_OPENAI_API_KEY"];
  for (const n of envNames) {
    const v = String(process.env[n] || "").trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push({ source: "env", envName: n, id: null, label: `Vercel env: ${n}`, key: v });
    }
  }

  const dbPrimary = String(await getPlatformSetting("OPENAI_API_KEY", "")).trim();
  if (dbPrimary && !seen.has(dbPrimary)) {
    seen.add(dbPrimary);
    out.push({ source: "platform_settings", envName: null, id: null, label: "Platform settings (DB)", key: dbPrimary });
  }

  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabaseAdmin
        .from("openai_api_keys")
        .select("id, label, api_key, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      for (const row of data || []) {
        const k = String(row.api_key || "").trim();
        if (k && !seen.has(k)) {
          seen.add(k);
          out.push({
            source: "fallback_table",
            envName: null,
            id: row.id,
            label: row.label || "Fallback key",
            key: k
          });
        }
      }
    } catch (e) {
      console.warn("[openai] fallback list load failed:", e?.message || e);
    }
  }

  return out;
}

/**
 * Decide whether an OpenAI HTTP error is one we should rotate keys for. 401 =
 * invalid key, 429 = rate / quota limit. Other errors (5xx, timeout) we let the
 * caller handle without rotation, since they're transient and not key-specific.
 */
function isKeyRotatableOpenAiError(status, bodyText) {
  if (status === 401) return true;
  if (status === 429) return true;
  if (status === 402) return true;
  if (status === 403 && /quota|billing|insufficient/i.test(String(bodyText || ""))) return true;
  return false;
}

async function recordOpenAiSuccess(candidate) {
  if (!candidate?.id || !isSupabaseConfigured()) return;
  try {
    const { data: row } = await supabaseAdmin
      .from("openai_api_keys")
      .select("success_count")
      .eq("id", candidate.id)
      .maybeSingle();
    await supabaseAdmin
      .from("openai_api_keys")
      .update({
        last_used_at: new Date().toISOString(),
        success_count: Number(row?.success_count || 0) + 1
      })
      .eq("id", candidate.id);
  } catch (e) {
    console.warn("[openai] success record failed:", e?.message || e);
  }
}

async function recordOpenAiFailure(candidate, status, snippet) {
  if (!candidate?.id || !isSupabaseConfigured()) return;
  try {
    const { data: row } = await supabaseAdmin
      .from("openai_api_keys")
      .select("fail_count")
      .eq("id", candidate.id)
      .maybeSingle();
    await supabaseAdmin
      .from("openai_api_keys")
      .update({
        last_failed_at: new Date().toISOString(),
        last_fail_reason: `${status}: ${String(snippet || "").slice(0, 240)}`,
        fail_count: Number(row?.fail_count || 0) + 1
      })
      .eq("id", candidate.id);
  } catch (e) {
    console.warn("[openai] failure record failed:", e?.message || e);
  }
}

/**
 * One-shot OpenAI POST that walks the key chain. `fetchOptionsBuilder(apiKey)`
 * must return the full RequestInit for the fetch (so the body / model / system
 * stays the same across retries). Returns the parsed JSON on first success or
 * null after every key fails.
 */
async function callOpenAiWithRetry(url, fetchOptionsBuilder, label = "openai") {
  const candidates = await listOpenAiKeys();
  if (candidates.length === 0) {
    console.warn(`[${label}] no OpenAI keys configured (env + platform_settings + openai_api_keys all empty)`);
    return null;
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const cand = candidates[i];
    let upstream;
    try {
      upstream = await fetch(url, fetchOptionsBuilder(cand.key));
    } catch (e) {
      console.warn(`[${label}] network error on key #${i + 1} (${cand.label}):`, e?.message || e);
      await recordOpenAiFailure(cand, 0, e?.message || "network");
      continue;
    }
    const rawText = await upstream.text();
    if (upstream.ok) {
      let data = {};
      try { data = rawText ? JSON.parse(rawText) : {}; } catch { /* tolerate */ }
      await recordOpenAiSuccess(cand);
      return data;
    }
    const shouldRotate = isKeyRotatableOpenAiError(upstream.status, rawText);
    console.warn(
      `[${label}] key #${i + 1} (${cand.label}) failed: HTTP ${upstream.status}.` +
        (shouldRotate ? " rotating to next key…" : " not rotating (non-auth/quota error).")
    );
    await recordOpenAiFailure(cand, upstream.status, rawText.slice(0, 200));
    if (!shouldRotate) return null;
  }
  console.warn(`[${label}] all ${candidates.length} OpenAI keys failed (rotatable errors). Giving up.`);
  return null;
}

/**
 * Non-secret flags for GET /health (Vercel vs local misconfiguration is the #1 reason webhooks "don't reply").
 * Now async because settings may live in the platform_settings DB row (admin-editable).
 */
export async function getMetaWhatsAppDeployDiagnostics() {
  const snap = await snapshotPlatformSettings([
    "META_WABA_VERIFY_TOKEN",
    "META_WABA_APP_SECRET",
    "META_WABA_ACCESS_TOKEN",
    "META_WABA_PHONE_NUMBER_ID",
    "META_WABA_WEBHOOK_SKIP_SIGNATURE",
    "META_WABA_MARKETING_AUTO_REPLY",
    "OPENAI_API_KEY"
  ]);
  const verifyTok = Boolean(String(snap.META_WABA_VERIFY_TOKEN || "").trim());
  const appSecret = Boolean(String(snap.META_WABA_APP_SECRET || "").trim());
  const token = String(snap.META_WABA_ACCESS_TOKEN || "").trim();
  const phoneNumberId = String(snap.META_WABA_PHONE_NUMBER_ID || "").trim();
  const graphSend = Boolean(token && phoneNumberId);
  const skipSignature =
    String(snap.META_WABA_WEBHOOK_SKIP_SIGNATURE || "").trim().toLowerCase() === "true";
  const insecureLocal =
    process.env.NODE_ENV !== "production" &&
    String(process.env.META_WABA_WEBHOOK_INSECURE_LOCAL || "").trim().toLowerCase() === "true" &&
    !appSecret;
  const productionLike = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const staticReply = Boolean(String(snap.META_WABA_MARKETING_AUTO_REPLY || "").trim());
  const openai = Boolean(String(snap.OPENAI_API_KEY || "").trim());

  const signatureMode = skipSignature
    ? "skip"
    : insecureLocal
      ? "insecure_local_dev"
      : appSecret
        ? "hmac_verify"
        : "missing_app_secret";

  const postWillRejectSignature = !skipSignature && !insecureLocal && !appSecret;

  const issues = [];
  if (!verifyTok) {
    issues.push(
      "Set META_WABA_VERIFY_TOKEN in Vercel (same string as Meta → WhatsApp → Configuration → Verify token). Until then GET /api/meta/whatsapp/webhook returns 403 and Meta cannot subscribe."
    );
  }
  if (!graphSend) {
    issues.push(
      "Set META_WABA_ACCESS_TOKEN and META_WABA_PHONE_NUMBER_ID in Vercel (same values as local .env). Without them the server cannot send WhatsApp messages."
    );
  }
  if (postWillRejectSignature && productionLike) {
    issues.push(
      "Vercel/production: set META_WABA_APP_SECRET (Meta → App → Settings → Basic → App secret) so X-Hub-Signature-256 is verified, OR temporarily set META_WABA_WEBHOOK_SKIP_SIGNATURE=true. Otherwise Meta POSTs get 403 and no reply is sent."
    );
  }
  if (!staticReply && !openai) {
    issues.push(
      "Set OPENAI_API_KEY in Vercel (or META_WABA_MARKETING_AUTO_REPLY for a fixed text) so inbound messages get a composed reply."
    );
  }
  if (productionLike && process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    issues.push(
      `VERCEL_ENV is "${process.env.VERCEL_ENV}" (not "production"). Variables must be enabled for this environment in Vercel, or open the production deployment URL so Meta hits Production-scoped env.`
    );
  }

  const replies_ready = verifyTok && graphSend && !postWillRejectSignature && (staticReply || openai);

  return {
    meta_whatsapp_webhook_verify_token_set: verifyTok,
    meta_whatsapp_app_secret_set: appSecret,
    meta_whatsapp_graph_send_configured: graphSend,
    meta_whatsapp_skip_signature_env: skipSignature,
    meta_whatsapp_signature_mode: signatureMode,
    meta_whatsapp_openai_configured: openai,
    meta_whatsapp_marketing_auto_reply_set: staticReply,
    meta_whatsapp_replies_ready: replies_ready,
    meta_whatsapp_deploy_issues: issues
  };
}

/**
 * Load the recent (inbound+outbound) message history for a given WhatsApp conversation
 * so the assistant has context for multi-turn lead-qualification. Returns []
 * if Supabase is not configured (does not throw).
 */
async function loadRecentConversation(phoneNumberId, waFrom, limit = 12) {
  if (!isSupabaseConfigured() || !waFrom) return [];
  try {
    let q = supabaseAdmin
      .from("wa_messages")
      .select("direction, body, created_at")
      .eq("wa_from", waFrom)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (phoneNumberId) q = q.eq("phone_number_id", phoneNumberId);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];
    return data
      .slice()
      .reverse()
      .map((r) => ({
        role: r.direction === "outbound" ? "assistant" : "user",
        content: String(r.body || "").slice(0, 2000)
      }))
      .filter((m) => m.content.length > 0);
  } catch (e) {
    console.warn("[meta whatsapp] loadRecentConversation failed", e?.message || e);
    return [];
  }
}

export async function openAiReplyToInbound(userMessage, history = []) {
  if (!String(userMessage || "").trim()) return null;
  const cfg = await loadPlatformBotConfig();
  const systemFromDb = String(process.env.META_WABA_OPENAI_SYSTEM || cfg.systemPrompt).slice(0, 16000);
  const knowledgeBlock = cfg.knowledgeBase
    ? `\n\n# Knowledge base (admin-curated). Use as the source of truth for facts. If a user question is not answered by this, say you'll check and offer ayuda@omnira.chat.\n${cfg.knowledgeBase}`
    : "";
  const system = `${systemFromDb}${knowledgeBlock}`.slice(0, 24000);
  const model = String(await getPlatformSetting("OPENAI_CHAT_MODEL", "gpt-4o-mini")).trim() || "gpt-4o-mini";
  const trimmedHistory = Array.isArray(history)
    ? history.slice(-10).filter((m) => m && typeof m.content === "string" && m.content.trim())
    : [];
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 45000);
  try {
    const data = await callOpenAiWithRetry(
      "https://api.openai.com/v1/chat/completions",
      (apiKey) => ({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            ...trimmedHistory,
            { role: "user", content: String(userMessage).trim().slice(0, 8000) }
          ],
          temperature: 0.55,
          max_tokens: 700
        }),
        signal: controller.signal
      }),
      "openai reply"
    );
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply || typeof reply !== "string") return null;
    return reply.trim().slice(0, 4090);
  } catch (e) {
    console.warn("[meta whatsapp] OpenAI reply error", e?.name || e?.message || e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Second OpenAI pass: extract a structured lead JSON from the recent conversation
 * (system prompt is `LEAD_EXTRACTION_SYSTEM`, response_format json_object). Cheap
 * (~1¢/100 msgs on gpt-4o-mini) and runs asynchronously so it never blocks the reply.
 */
async function extractLeadFromConversation(conversationMessages) {
  const trimmed = Array.isArray(conversationMessages)
    ? conversationMessages.slice(-14).filter((m) => m?.content && m.content.trim())
    : [];
  if (trimmed.length === 0) return null;
  const cfg = await loadPlatformBotConfig();
  const model = String(
    process.env.OPENAI_EXTRACT_MODEL ||
    (await getPlatformSetting("OPENAI_CHAT_MODEL", "gpt-4o-mini"))
  ).trim();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);
  try {
    const data = await callOpenAiWithRetry(
      "https://api.openai.com/v1/chat/completions",
      (apiKey) => ({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: cfg.leadExtractionPrompt },
            ...trimmed
          ],
          temperature: 0,
          max_tokens: 400,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      }),
      "openai extract"
    );
    if (!data) return null;
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 200) : null,
      email: typeof parsed.email === "string" ? parsed.email.toLowerCase().slice(0, 200) : null,
      phone: typeof parsed.phone === "string" ? parsed.phone.slice(0, 40) : null,
      business_name: typeof parsed.business_name === "string" ? parsed.business_name.slice(0, 200) : null,
      intent: typeof parsed.intent === "string" ? parsed.intent.slice(0, 40) : "other",
      language: typeof parsed.language === "string" ? parsed.language.slice(0, 8) : "es",
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 400) : null
    };
  } catch (e) {
    console.warn("[meta whatsapp] lead extraction failed", e?.name || e?.message || e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function logWaMessage(row) {
  if (!isSupabaseConfigured()) return;
  try {
    await supabaseAdmin.from("wa_messages").insert({
      customer_user_id: row.customer_user_id || null,
      phone_number_id: row.phone_number_id || null,
      wa_from: row.wa_from,
      wa_message_id: row.wa_message_id || null,
      direction: row.direction,
      message_type: row.message_type || null,
      body: row.body || null,
      meta_payload: row.meta_payload || null,
      language: row.language || null
    });
  } catch (e) {
    console.warn("[meta whatsapp] logWaMessage failed", e?.message || e);
  }
}

/**
 * Upsert a lead row keyed by (phone_number_id, wa_from). New non-null fields
 * overwrite existing values; nulls don't clobber prior known data. Increments
 * message_count and updates last_message_at + updated_at on every call.
 */
async function upsertWaLead({ phoneNumberId, waFrom, extracted, inboundBody, customerId }) {
  if (!isSupabaseConfigured() || !waFrom) return;
  try {
    let q = supabaseAdmin
      .from("wa_leads")
      .select("id,name,email,phone,intent,language,confidence,notes,message_count,first_seen_at")
      .eq("phone_number_id", phoneNumberId || "")
      .eq("wa_from", waFrom);
    // Scope lookup to the right customer so two customers never share a lead row.
    if (customerId) {
      q = q.eq("customer_user_id", customerId);
    } else {
      q = q.is("customer_user_id", null);
    }
    const { data: existing } = await q.maybeSingle();

    const now = new Date().toISOString();
    const fields = extracted || {};
    const merged = {
      name: fields.name || existing?.name || null,
      email: fields.email || existing?.email || null,
      phone: fields.phone || existing?.phone || null,
      intent: fields.intent || existing?.intent || "other",
      language: fields.language || existing?.language || null,
      confidence:
        typeof fields.confidence === "number"
          ? Math.max(fields.confidence, existing?.confidence || 0)
          : existing?.confidence || 0,
      notes: fields.notes || existing?.notes || (inboundBody ? inboundBody.slice(0, 200) : null)
    };

    if (existing) {
      await supabaseAdmin
        .from("wa_leads")
        .update({
          ...merged,
          customer_user_id: customerId || existing.customer_user_id || null,
          last_message_at: now,
          message_count: (existing.message_count || 0) + 1,
          updated_at: now
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("wa_leads").insert({
        customer_user_id: customerId || null,
        phone_number_id: phoneNumberId || null,
        wa_from: waFrom,
        ...merged,
        first_seen_at: now,
        last_message_at: now,
        message_count: 1
      });
    }
  } catch (e) {
    console.warn("[meta whatsapp] upsertWaLead failed", e?.message || e);
  }
}

/**
 * Third OpenAI pass: detect if the conversation contains a confirmed call/meeting
 * booking request and extract the details. Returns null if no booking detected.
 * Cheap model, runs async after reply — never blocks the user.
 */
async function extractBookingFromConversation(conversationMessages) {
  const trimmed = Array.isArray(conversationMessages)
    ? conversationMessages.slice(-16).filter((m) => m?.content && m.content.trim())
    : [];
  if (trimmed.length === 0) return null;

  const model = String(
    process.env.OPENAI_EXTRACT_MODEL ||
    (await getPlatformSetting("OPENAI_CHAT_MODEL", "gpt-4o-mini"))
  ).trim() || "gpt-4o-mini";

  const systemPrompt = `You are a booking-intent extractor for a WhatsApp conversation. Decide if the user has CLEARLY requested to schedule a call, meeting, appointment or demo — and if so, extract the details.

Output ONE JSON object with these keys:
- has_booking: boolean — true ONLY if the user clearly expressed intent to schedule a call/meeting/appointment/demo (keywords: "llamada", "cita", "reunión", "agendar", "reservar", "call", "meeting", "book", "schedule", "appointment", "demo"). False if it is just a casual question or no scheduling was discussed.
- name: string or null — the person's name if mentioned, else null
- phone: string or null — their phone number if mentioned, else null
- service: string or null — what they want (e.g. "demo", "consulta", "llamada de ventas"), infer from context
- datetime_iso: string or null — ISO 8601 datetime if the user specified a date/time. If they said e.g. "mañana a las 10" compute it relative to today (${new Date().toISOString().slice(0, 10)}). If no date was given, null.
- notes: string — brief summary of what they want (max 120 chars)

Output ONLY valid JSON. No markdown, no explanation.`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);
  try {
    const data = await callOpenAiWithRetry(
      "https://api.openai.com/v1/chat/completions",
      (apiKey) => ({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, ...trimmed],
          temperature: 0,
          max_tokens: 300,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      }),
      "openai booking extract"
    );
    if (!data) return null;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    let parsed;
    try { parsed = JSON.parse(content); } catch { return null; }
    if (!parsed?.has_booking) return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 200) : null,
      phone: typeof parsed.phone === "string" ? parsed.phone.slice(0, 40) : null,
      service: typeof parsed.service === "string" ? parsed.service.slice(0, 200) : null,
      datetime_iso: typeof parsed.datetime_iso === "string" ? parsed.datetime_iso : null,
      notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 300) : null
    };
  } catch (e) {
    console.warn("[meta whatsapp] booking extraction failed:", e?.message || e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

const BOOKING_RE = /llamad|cita|reuni[oó]n|agendar|reservar|book|meeting|call|schedule|appointment|demo|hablar con|contactar con|quiero hablar/;

/**
 * Checks the ENTIRE conversation (not just the current message) for booking
 * keywords. This catches the second message ("Xavi mañana a las 9") that
 * completes a booking started in a prior turn ("Quiero agendar una llamada").
 */
function conversationHasBookingKeywords(messages) {
  return (Array.isArray(messages) ? messages : []).some(
    (m) => BOOKING_RE.test(String(m?.content || "").toLowerCase())
  );
}

/**
 * Insert a pending event into customer_events from bot-detected booking.
 * customer_user_id may be null for the platform (Omnira's own) agent.
 * Deduplicates: skips if a pending bot event from the same waFrom already exists
 * with the same datetime (within 30 min) or was created in the last 5 minutes.
 */
async function resolvePlatformCustomerId() {
  // For the platform agent (Omnira's own WA), bot bookings are stored under the
  // first active customer_users row that matches the platform admin email,
  // or the oldest customer_users row as a fallback sentinel.
  try {
    const { data } = await supabaseAdmin
      .from("customer_users")
      .select("id, email")
      .order("created_at", { ascending: true })
      .limit(5);
    if (!data || data.length === 0) return null;
    const admin = data.find((r) => /omnira/i.test(r.email || "")) || data[0];
    return admin.id;
  } catch {
    return null;
  }
}

async function saveBotBooking({ customerId, waFrom, booking }) {
  if (!isSupabaseConfigured() || !booking) return;
  try {
    // If no customerId (platform agent), resolve a sentinel customer to satisfy the FK
    const resolvedCustomerId = customerId || (await resolvePlatformCustomerId());
    if (!resolvedCustomerId) {
      console.info("[meta whatsapp] saveBotBooking: no customer_user_id resolvable, skipping");
      return;
    }

    const fiveMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();

    // Dedup: don't create a second event if we already saved one from this number in the last 5 min
    const { data: existing } = await supabaseAdmin
      .from("customer_events")
      .select("id")
      .eq("source", "bot")
      .eq("phone", waFrom)
      .eq("customer_user_id", resolvedCustomerId)
      .gte("created_at", fiveMinAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      console.info("[meta whatsapp] booking dedup — skipping duplicate event for", waFrom);
      return;
    }

    const datetime = booking.datetime_iso || new Date(Date.now() + 24 * 3600_000).toISOString();

    const { error } = await supabaseAdmin.from("customer_events").insert({
      customer_user_id: resolvedCustomerId,
      datetime,
      name: booking.name || waFrom,
      phone: waFrom,
      service: booking.service || null,
      notes: booking.notes || null,
      source: "bot",
      status: "pending"
    });

    if (error) {
      console.warn("[meta whatsapp] saveBotBooking insert failed:", error.message);
    } else {
      console.info("[meta whatsapp] bot booking saved for", waFrom, "datetime=", datetime);
    }
  } catch (e) {
    console.warn("[meta whatsapp] saveBotBooking error:", e?.message || e);
  }
}

async function sendReplyForInbound(inbound) {
  const staticReply = String(await getPlatformSetting("META_WABA_MARKETING_AUTO_REPLY", "")).trim();
  if (staticReply) {
    return await sendMarketingWhatsAppReply(inbound.from, staticReply);
  }
  const history = await loadRecentConversation(inbound.phoneNumberId, inbound.from);
  const ai = await openAiReplyToInbound(inbound.body, history);
  const fallback =
    String(process.env.META_WABA_OPENAI_FALLBACK_REPLY || "").trim() ||
    "¡Hola! Gracias por escribir a Omnira. Ahora mismo no puedo generar la respuesta automática; prueba en unos minutos o escribe a ayuda@omnira.chat. Planes desde 49€/mes y packs en omnira.";
  const textToSend = ai || fallback;
  if (!ai) {
    console.warn("[meta whatsapp] OpenAI returned empty - sending fallback WhatsApp message");
  }
  const sendResult = await sendMarketingWhatsAppReply(inbound.from, textToSend);
  // Build the conversation slice we'll feed to the lead extractor: prior history +
  // the current turn (user message and the just-sent assistant reply).
  const conversationForExtraction = [
    ...history,
    { role: "user", content: inbound.body },
    { role: "assistant", content: textToSend }
  ];
  return { sendResult, replyText: textToSend, conversationForExtraction };
}

/**
 * CLI / integration tests: same path as the Meta webhook after parsing inbound text.
 * Returns the underlying Graph `/messages` send result.
 * @param {{ from: string, body: string }} inbound
 */
export async function runMarketingAgentReplyForTest(inbound) {
  const from = String(inbound?.from || "").trim();
  const body = String(inbound?.body || "").trim();
  if (!from || !body) {
    throw new Error("runMarketingAgentReplyForTest: requires { from, body } (E.164 digits and user text)");
  }
  const out = await sendReplyForInbound({ from, body, phoneNumberId: "" });
  return out?.sendResult || { ok: false, status: 0, snippet: "no send result" };
}

export async function handleMetaWhatsAppGet(req, res) {
  const mode = String(req.query["hub.mode"] ?? "").trim();
  const token = String(req.query["hub.verify_token"] ?? "").trim();
  const challengeRaw = req.query["hub.challenge"];
  const ch = challengeRaw != null && challengeRaw !== "" ? String(challengeRaw) : "";
  const expected = String(await getPlatformSetting("META_WABA_VERIFY_TOKEN", "")).trim();

  if (mode === "subscribe" && expected && token === expected && ch) {
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(ch);
  }

  // Multi-tenant: if the platform verify token didn't match, try each
  // customer's verify token. Whichever matches owns this Meta app.
  if (mode === "subscribe" && token && ch && isSupabaseConfigured()) {
    try {
      const { data } = await supabaseAdmin
        .from("customer_whatsapp_configs")
        .select("customer_user_id, meta_verify_token")
        .not("meta_verify_token", "is", null);
      for (const row of data || []) {
        if (row.meta_verify_token && token === row.meta_verify_token) {
          console.info("[meta whatsapp] GET verify matched customer", row.customer_user_id);
          res.status(200);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          return res.send(ch);
        }
      }
    } catch (e) {
      console.warn("[meta whatsapp] customer verify lookup failed:", e?.message || e);
    }
  }

  if (mode !== "subscribe") {
    console.warn("[meta whatsapp] GET verify 403: hub.mode is not subscribe (got:", mode, ")");
  } else if (!expected) {
    console.warn("[meta whatsapp] GET verify 403: META_WABA_VERIFY_TOKEN is empty in Vercel env");
  } else if (token !== expected) {
    console.warn(
      "[meta whatsapp] GET verify 403: hub.verify_token does not match META_WABA_VERIFY_TOKEN (copy the same string into Meta and Vercel Production)"
    );
  } else if (!ch) {
    console.warn("[meta whatsapp] GET verify 403: hub.challenge missing");
  } else {
    console.warn("[meta whatsapp] GET verify 403: check hub.mode, token, challenge");
  }
  return res.sendStatus(403);
}

/**
 * After HMAC verification: extract inbound user text and send OpenAI/Graph reply.
 * Runs synchronously before 200 OK so Meta + Vercel Express reliably complete the send.
 * (waitUntil from @vercel/functions is unreliable in this Express default-export setup.)
 */
async function processMetaWebhookInboundBody(body) {
  const inbound = extractInboundText(body);
  const expectedPnId = String(await getPlatformSetting("META_WABA_PHONE_NUMBER_ID", "")).trim();
  if (inbound?.from && expectedPnId && inbound.phoneNumberId && inbound.phoneNumberId !== expectedPnId) {
    console.warn(
      "[meta whatsapp] inbound phone_number_id does not match META_WABA_PHONE_NUMBER_ID - check Meta app / WABA vs env (still attempting reply)"
    );
  }
  if (inbound?.from) {
    console.info("[meta whatsapp] inbound text from", inbound.from, "len=", inbound.body?.length ?? 0);

    await logWaMessage({
      phone_number_id: inbound.phoneNumberId,
      wa_from: inbound.from,
      wa_message_id: inbound.messageId || null,
      direction: "inbound",
      message_type: inbound.messageType || "text",
      body: inbound.body
    });

    try {
      const out = await sendReplyForInbound(inbound);
      const sendResult = out?.sendResult;
      if (sendResult && !sendResult.ok) {
        console.warn("[meta whatsapp] reply pipeline incomplete", sendResult.status, sendResult.snippet?.slice(0, 200));
      } else if (sendResult?.ok) {
        console.info("[meta whatsapp] outbound reply sent ok");
        await logWaMessage({
          phone_number_id: inbound.phoneNumberId,
          wa_from: inbound.from,
          direction: "outbound",
          message_type: "text",
          body: out?.replyText || ""
        });
      }

      // Lead extraction + booking detection run after the reply so they never delay the user response.
      if (out?.conversationForExtraction?.length) {
        const extracted = await extractLeadFromConversation(out.conversationForExtraction);
        await upsertWaLead({
          phoneNumberId: inbound.phoneNumberId,
          waFrom: inbound.from,
          extracted,
          inboundBody: inbound.body
        });

        // Booking detection: check the whole conversation so we catch follow-up
        // messages that provide the date/name after booking intent was expressed
        if (conversationHasBookingKeywords(out.conversationForExtraction)) {
          const booking = await extractBookingFromConversation(out.conversationForExtraction);
          if (booking) {
            await saveBotBooking({ customerId: null, waFrom: inbound.from, booking });
          }
        }
      }
    } catch (e) {
      console.error("[meta whatsapp] reply error", e?.message || e);
    }
  } else if (body?.object === "whatsapp_business_account") {
    const hint = summarizeMetaWebhookPayload(body);
    console.warn(
      "[meta whatsapp] WABA payload received but no user text/button extracted (send plain text, or subscribe to messages in Meta).",
      hint
    );
  }
}

function summarizeMetaWebhookPayload(body) {
  try {
    const entries = body?.entry;
    if (!Array.isArray(entries)) return { shape: "no_entry_array" };
    let changeFields = [];
    let messageTypes = [];
    for (const ent of entries) {
      const changes = ent?.changes;
      if (!Array.isArray(changes)) continue;
      for (const ch of changes) {
        if (ch?.field) changeFields.push(String(ch.field));
        const msgs = ch?.value?.messages;
        if (Array.isArray(msgs)) {
          for (const m of msgs) {
            if (m?.type) messageTypes.push(String(m.type));
          }
        }
      }
    }
    return { changeFields: [...new Set(changeFields)], messageTypes: [...new Set(messageTypes)] };
  } catch {
    return { shape: "parse_error" };
  }
}

export async function handleMetaWhatsAppPost(req, res) {
  try {
    const raw = req.rawBody;
    const platformAppSecret = String(await getPlatformSetting("META_WABA_APP_SECRET", "")).trim();
    const insecureLocal =
      process.env.NODE_ENV !== "production" &&
      String(await getPlatformSetting("META_WABA_WEBHOOK_INSECURE_LOCAL", "")).trim().toLowerCase() === "true" &&
      !platformAppSecret;
    const skipSignature =
      String(await getPlatformSetting("META_WABA_WEBHOOK_SKIP_SIGNATURE", "")).trim().toLowerCase() === "true";

    if (!Buffer.isBuffer(raw)) {
      return res.status(500).json({ ok: false, message: "Server misconfiguration: raw body missing for webhook." });
    }

    console.info("[meta whatsapp] POST webhook", {
      rawLen: raw.length,
      hasSig256: Boolean(req.headers["x-hub-signature-256"]),
      contentType: String(req.headers["content-type"] || "").slice(0, 80)
    });

    // Look up which (if any) customer owns the phone_number_id in this payload.
    // Doing it before signature verification lets us validate against THAT
    // customer's app secret if the platform secret doesn't match.
    const inbound = extractInboundText(req.body);
    const customerCfg = inbound?.phoneNumberId
      ? await findCustomerConfigByPhoneNumberId(inbound.phoneNumberId)
      : null;

    if (skipSignature) {
      console.warn("[meta whatsapp] SKIP_SIGNATURE on — accepting POST without HMAC check");
    } else if (!insecureLocal) {
      const sig = req.headers["x-hub-signature-256"];
      // Try platform secret first, then the customer's own app secret if any.
      let signatureValid = false;
      if (platformAppSecret && verifyMetaAppSecretSignature(raw, sig, platformAppSecret)) {
        signatureValid = true;
      } else if (customerCfg?.meta_app_secret && verifyMetaAppSecretSignature(raw, sig, customerCfg.meta_app_secret)) {
        signatureValid = true;
      }
      if (!signatureValid) {
        console.warn(
          "[meta whatsapp] POST /webhook 403 - signature missing or invalid (neither platform nor customer secret matched)."
        );
        return res.sendStatus(403);
      }
    } else {
      console.warn("[meta whatsapp] META_WABA_WEBHOOK_INSECURE_LOCAL: signature not verified (dev only)");
    }

    // Route the inbound message: customer-owned phone_number_id → customer's
    // agent (with subscription check); otherwise the platform agent.
    if (inbound?.from && customerCfg && customerCfg.is_active) {
      await processCustomerWebhookInbound(inbound, customerCfg);
    } else {
      await processMetaWebhookInboundBody(req.body);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[meta whatsapp] webhook error", e?.message || e);
    return res.status(500).json({ ok: false });
  }
}

/**
 * Inbound handler for a paying customer's own WhatsApp number. Enforces
 * subscription_ends_at — when expired the agent stays silent on real replies
 * and instead sends one short renewal nudge so the user knows the agent will
 * resume after they pay.
 */
async function processCustomerWebhookInbound(inbound, customerCfg) {
  const customerId = customerCfg.customer_user_id;
  console.info("[meta whatsapp] inbound for customer", customerId, "from", inbound.from);

  // Always log the inbound first, scoped to this customer.
  await logWaMessage({
    customer_user_id: customerId,
    phone_number_id: inbound.phoneNumberId,
    wa_from: inbound.from,
    wa_message_id: inbound.messageId || null,
    direction: "inbound",
    message_type: inbound.messageType || "text",
    body: inbound.body
  });

  const active = await isCustomerSubscriptionActive(customerId);
  if (!active) {
    // Subscription expired — send the renewal nudge once per inbound, in the
    // user's language as best-effort (Spanish default since most Omnira
    // customers are ES; the message is short and clear in either case).
    const renewMsg =
      "Hola 👋 Tu plan de Omnira ha expirado, por eso este asistente no puede responder ahora mismo. " +
      "Renueva tu plan en https://www.omnira.chat/ para reactivar las respuestas automáticas. ¡Gracias!";
    const out = await sendCustomerWhatsAppMessage(customerCfg, inbound.from, renewMsg);
    if (out?.ok) {
      await logWaMessage({
        customer_user_id: customerId,
        phone_number_id: inbound.phoneNumberId,
        wa_from: inbound.from,
        direction: "outbound",
        message_type: "text",
        body: renewMsg
      });
    }
    return;
  }

  // Active subscription — generate a reply with the customer's bot + business
  // context, send it via the customer's access token, then save outbound +
  // extract lead.
  try {
    const customerBot = await loadCustomerBotConfig(customerId);
    const business = await loadCustomerBusiness(customerId);
    const system = buildCustomerSystemPrompt(customerBot, business);
    const history = await loadRecentConversation(inbound.phoneNumberId, inbound.from);
    const trimmedHistory = history.slice(-10);

    const model = String(await getPlatformSetting("OPENAI_CHAT_MODEL", "gpt-4o-mini")).trim() || "gpt-4o-mini";
    const apiKeyData = await callOpenAiWithRetry(
      "https://api.openai.com/v1/chat/completions",
      (apiKey) => ({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            ...trimmedHistory,
            { role: "user", content: String(inbound.body).trim().slice(0, 8000) }
          ],
          temperature: 0.55,
          max_tokens: 700
        })
      }),
      `openai reply customer/${customerId}`
    );
    const reply = apiKeyData?.choices?.[0]?.message?.content;
    const fallback =
      customerBot?.greeting && customerBot.greeting.trim()
        ? customerBot.greeting.trim()
        : "¡Hola! Gracias por escribir. En unos minutos te responderé.";
    const textToSend = (typeof reply === "string" && reply.trim()) ? reply.trim().slice(0, 4090) : fallback;

    const sendResult = await sendCustomerWhatsAppMessage(customerCfg, inbound.from, textToSend);
    if (sendResult?.ok) {
      await logWaMessage({
        customer_user_id: customerId,
        phone_number_id: inbound.phoneNumberId,
        wa_from: inbound.from,
        direction: "outbound",
        message_type: "text",
        body: textToSend
      });
    } else {
      console.warn("[meta whatsapp] customer reply failed", sendResult?.status, sendResult?.snippet);
    }

    // Lead extraction + booking detection (best-effort, same flow as platform)
    const conversation = [
      ...trimmedHistory,
      { role: "user", content: inbound.body },
      { role: "assistant", content: textToSend }
    ];
    const extracted = await extractLeadFromConversation(conversation);
    await upsertWaLead({
      phoneNumberId: inbound.phoneNumberId,
      waFrom: inbound.from,
      extracted,
      inboundBody: inbound.body,
      customerId
    });

    // Booking detection: check the whole conversation for keywords
    if (conversationHasBookingKeywords(conversation)) {
      const booking = await extractBookingFromConversation(conversation);
      if (booking) {
        await saveBotBooking({ customerId, waFrom: inbound.from, booking });
      }
    }
  } catch (e) {
    console.error("[meta whatsapp] customer reply error", customerId, e?.message || e);
  }
}

// Shared helpers re-exported for the Twilio webhook handler (index.js).
export {
  callOpenAiWithRetry,
  extractLeadFromConversation,
  upsertWaLead,
  extractBookingFromConversation,
  saveBotBooking,
  conversationHasBookingKeywords,
  loadCustomerBotConfig,
  loadCustomerBusiness,
  buildCustomerSystemPrompt
};
