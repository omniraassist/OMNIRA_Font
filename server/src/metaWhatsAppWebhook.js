import crypto from "crypto";

const _gv = String(process.env.META_WABA_GRAPH_VERSION || "v21.0").trim();
const GRAPH_VERSION = _gv.startsWith("v") ? _gv : `v${_gv}`;

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

function extractInboundText(body) {
  try {
    const entries = body?.entry;
    if (!Array.isArray(entries)) return null;
    for (const ent of entries) {
      const changes = ent?.changes;
      if (!Array.isArray(changes)) continue;
      for (const ch of changes) {
        const msgs = ch?.value?.messages;
        if (!Array.isArray(msgs)) continue;
        for (const m of msgs) {
          if (m?.type === "text" && m?.text?.body) {
            return {
              from: String(m.from || ""),
              body: String(m.text.body || "").slice(0, 4000),
              phoneNumberId: String(ch?.value?.metadata?.phone_number_id || "")
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
  const token = String(process.env.META_WABA_ACCESS_TOKEN || "").trim();
  const phoneNumberId = String(process.env.META_WABA_PHONE_NUMBER_ID || "").trim();
  if (!token || !phoneNumberId || !toE164Digits || !text) {
    return {
      ok: false,
      status: 0,
      snippet: "missing META_WABA_ACCESS_TOKEN, META_WABA_PHONE_NUMBER_ID, or recipient `to`"
    };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
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

const DEFAULT_WA_AI_SYSTEM = `Eres el asistente comercial de Omnira (producto de automatización con IA para WhatsApp Business: reservas, recordatorios, calendario).
Responde siempre en español, breve y cordial (máximo ~600 caracteres). Incluye cuando encaje: planes desde 49€/mes; packs 3 meses 129€, 6 meses 229€, 12 meses 399€.
Invita a registrarse en la web para activar el agente en su propio número con WhatsApp Business verificado (Meta). No inventes integraciones que no existan.`;

function resolveOpenAiKey() {
  const names = ["OPENAI_API_KEY", "OPENAI_KEY", "OPEN_AI_API_KEY", "OPENAI_SECRET_KEY", "CHAT_OPENAI_API_KEY"];
  for (const n of names) {
    const v = String(process.env[n] || "").trim();
    if (v) return v;
  }
  return "";
}

export async function openAiReplyToInbound(userMessage) {
  const apiKey = resolveOpenAiKey();
  if (!apiKey || !String(userMessage || "").trim()) return null;
  const system = String(process.env.META_WABA_OPENAI_SYSTEM || DEFAULT_WA_AI_SYSTEM).slice(0, 8000);
  const model = String(process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 45000);
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
          { role: "system", content: system },
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

async function sendReplyForInbound(inbound) {
  const staticReply = String(process.env.META_WABA_MARKETING_AUTO_REPLY || "").trim();
  if (staticReply) {
    return await sendMarketingWhatsAppReply(inbound.from, staticReply);
  }
  const ai = await openAiReplyToInbound(inbound.body);
  const fallback =
    String(process.env.META_WABA_OPENAI_FALLBACK_REPLY || "").trim() ||
    "¡Hola! Gracias por escribir a Omnira. Ahora mismo no puedo generar la respuesta automática; prueba en unos minutos o escribe a omniraassist@gmail.com. Planes desde 49€/mes y packs en omnira.";
  const textToSend = ai || fallback;
  if (!ai) {
    console.warn("[meta whatsapp] OpenAI returned empty — sending fallback WhatsApp message");
  }
  return await sendMarketingWhatsAppReply(inbound.from, textToSend);
}

/**
 * CLI / integration tests: same path as the Meta webhook after parsing inbound text.
 * @param {{ from: string, body: string }} inbound
 */
export async function runMarketingAgentReplyForTest(inbound) {
  const from = String(inbound?.from || "").trim();
  const body = String(inbound?.body || "").trim();
  if (!from || !body) {
    throw new Error("runMarketingAgentReplyForTest: requires { from, body } (E.164 digits and user text)");
  }
  return await sendReplyForInbound({ from, body, phoneNumberId: "" });
}

export function handleMetaWhatsAppGet(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expected = String(process.env.META_WABA_VERIFY_TOKEN || "").trim();
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return res.status(200).send(String(challenge));
  }
  return res.sendStatus(403);
}

export async function handleMetaWhatsAppPost(req, res) {
  try {
    const appSecret = String(process.env.META_WABA_APP_SECRET || "").trim();
    const insecureLocal =
      process.env.NODE_ENV !== "production" &&
      String(process.env.META_WABA_WEBHOOK_INSECURE_LOCAL || "").trim().toLowerCase() === "true" &&
      !appSecret;
    const skipSignature =
      String(process.env.META_WABA_WEBHOOK_SKIP_SIGNATURE || "").trim().toLowerCase() === "true";

    const raw = req.rawBody;
    if (!Buffer.isBuffer(raw)) {
      return res.status(500).json({ ok: false, message: "Server misconfiguration: raw body missing for webhook." });
    }

    if (skipSignature) {
      console.warn(
        "[meta whatsapp] META_WABA_WEBHOOK_SKIP_SIGNATURE=true — NOT verifying X-Hub-Signature-256 (set META_WABA_APP_SECRET and remove this flag when possible)"
      );
    } else if (!insecureLocal) {
      const sig = req.headers["x-hub-signature-256"];
      if (!appSecret || !verifyMetaAppSecretSignature(raw, sig, appSecret)) {
        return res.sendStatus(403);
      }
    } else {
      console.warn("[meta whatsapp] META_WABA_WEBHOOK_INSECURE_LOCAL: signature not verified (dev only)");
    }

    const inbound = extractInboundText(req.body);
    if (inbound?.from) {
      console.info("[meta whatsapp] inbound text from", inbound.from, "len=", inbound.body?.length ?? 0);
      try {
        const out = await sendReplyForInbound(inbound);
        if (out && !out.ok) {
          console.warn("[meta whatsapp] reply pipeline incomplete", out.status, out.snippet?.slice(0, 200));
        }
      } catch (e) {
        console.error("[meta whatsapp] reply error", e?.message || e);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[meta whatsapp] webhook error", e?.message || e);
    return res.status(500).json({ ok: false });
  }
}
