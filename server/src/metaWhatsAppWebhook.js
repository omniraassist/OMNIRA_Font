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

/**
 * The agent's system prompt and lead-extraction prompt live in Supabase
 * (public.bot_configs, scope='platform') so admins can edit them from /bot-config
 * without redeploying. These are the bare-minimum fallbacks used only if the DB
 * row is missing — in production the seed migration creates it on first apply.
 */
const FALLBACK_SYSTEM_PROMPT =
  "You are Omnira's WhatsApp sales assistant. Reply in the user's language, concise and warm. Qualify softly: ask one natural question per turn to learn name, business, email, and intent. Plans from 49€/month; packs 3/6/12 months at 129€/229€/399€. Activation requires registration on the website + payment. Support: omniraassist@gmail.com. Never invent features.";

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

async function resolveOpenAiKey() {
  const dbKey = String(await getPlatformSetting("OPENAI_API_KEY", "")).trim();
  if (dbKey) return dbKey;
  const names = ["OPENAI_API_KEY", "OPENAI_KEY", "OPEN_AI_API_KEY", "OPENAI_SECRET_KEY", "CHAT_OPENAI_API_KEY"];
  for (const n of names) {
    const v = String(process.env[n] || "").trim();
    if (v) return v;
  }
  return "";
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
    const q = supabaseAdmin
      .from("wa_messages")
      .select("direction, body, created_at")
      .eq("wa_from", waFrom)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (phoneNumberId) q.eq("phone_number_id", phoneNumberId);
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
  const apiKey = await resolveOpenAiKey();
  if (!apiKey || !String(userMessage || "").trim()) return null;
  const cfg = await loadPlatformBotConfig();
  // ENV override exists for break-glass scenarios (set in Vercel without DB edit)
  const systemFromDb = String(process.env.META_WABA_OPENAI_SYSTEM || cfg.systemPrompt).slice(0, 16000);
  const knowledgeBlock = cfg.knowledgeBase
    ? `\n\n# Knowledge base (admin-curated). Use as the source of truth for facts. If a user question is not answered by this, say you'll check and offer omniraassist@gmail.com.\n${cfg.knowledgeBase}`
    : "";
  const system = `${systemFromDb}${knowledgeBlock}`.slice(0, 24000);
  const model = String(await getPlatformSetting("OPENAI_CHAT_MODEL", "gpt-4o-mini")).trim() || "gpt-4o-mini";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 45000);
  try {
    const trimmedHistory = Array.isArray(history)
      ? history.slice(-10).filter((m) => m && typeof m.content === "string" && m.content.trim())
      : [];
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
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
    });
    const rawText = await upstream.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      return null;
    }
    if (!upstream.ok) {
      console.warn("[meta whatsapp] OpenAI error", upstream.status, String(data?.error?.message || "").slice(0, 200));
      return null;
    }
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply || typeof reply !== "string") return null;
    return reply.trim().slice(0, 4090);
  } catch (e) {
    console.warn("[meta whatsapp] OpenAI request failed", e?.name || e?.message || e);
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
  const apiKey = await resolveOpenAiKey();
  if (!apiKey) return null;
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
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
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
    });
    const rawText = await upstream.text();
    if (!upstream.ok) {
      console.warn("[meta whatsapp] lead extraction error", upstream.status, rawText.slice(0, 200));
      return null;
    }
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      return null;
    }
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
async function upsertWaLead({ phoneNumberId, waFrom, extracted, inboundBody }) {
  if (!isSupabaseConfigured() || !waFrom) return;
  try {
    const { data: existing } = await supabaseAdmin
      .from("wa_leads")
      .select("id,name,email,phone,intent,language,confidence,notes,message_count,first_seen_at")
      .eq("phone_number_id", phoneNumberId || "")
      .eq("wa_from", waFrom)
      .maybeSingle();

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
          last_message_at: now,
          message_count: (existing.message_count || 0) + 1,
          updated_at: now
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("wa_leads").insert({
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

async function sendReplyForInbound(inbound) {
  const staticReply = String(await getPlatformSetting("META_WABA_MARKETING_AUTO_REPLY", "")).trim();
  if (staticReply) {
    return await sendMarketingWhatsAppReply(inbound.from, staticReply);
  }
  const history = await loadRecentConversation(inbound.phoneNumberId, inbound.from);
  const ai = await openAiReplyToInbound(inbound.body, history);
  const fallback =
    String(process.env.META_WABA_OPENAI_FALLBACK_REPLY || "").trim() ||
    "¡Hola! Gracias por escribir a Omnira. Ahora mismo no puedo generar la respuesta automática; prueba en unos minutos o escribe a omniraassist@gmail.com. Planes desde 49€/mes y packs en omnira.";
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

      // Lead extraction runs after the reply so it never delays the user response.
      // Errors are swallowed inside extractLeadFromConversation / upsertWaLead.
      if (out?.conversationForExtraction?.length) {
        const extracted = await extractLeadFromConversation(out.conversationForExtraction);
        await upsertWaLead({
          phoneNumberId: inbound.phoneNumberId,
          waFrom: inbound.from,
          extracted,
          inboundBody: inbound.body
        });
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
    const appSecret = String(await getPlatformSetting("META_WABA_APP_SECRET", "")).trim();
    const insecureLocal =
      process.env.NODE_ENV !== "production" &&
      String(process.env.META_WABA_WEBHOOK_INSECURE_LOCAL || "").trim().toLowerCase() === "true" &&
      !appSecret;
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

    if (skipSignature) {
      console.warn(
        "[meta whatsapp] META_WABA_WEBHOOK_SKIP_SIGNATURE=true - NOT verifying X-Hub-Signature-256 (set META_WABA_APP_SECRET and remove this flag when possible)"
      );
    } else if (!insecureLocal) {
      const sig = req.headers["x-hub-signature-256"];
      if (!appSecret || !verifyMetaAppSecretSignature(raw, sig, appSecret)) {
        console.warn(
          "[meta whatsapp] POST /webhook 403 - signature missing or invalid. Set META_WABA_APP_SECRET to Meta App Secret, or temporarily META_WABA_WEBHOOK_SKIP_SIGNATURE=true on Vercel."
        );
        return res.sendStatus(403);
      }
    } else {
      console.warn("[meta whatsapp] META_WABA_WEBHOOK_INSECURE_LOCAL: signature not verified (dev only)");
    }

    await processMetaWebhookInboundBody(req.body);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[meta whatsapp] webhook error", e?.message || e);
    return res.status(500).json({ ok: false });
  }
}
