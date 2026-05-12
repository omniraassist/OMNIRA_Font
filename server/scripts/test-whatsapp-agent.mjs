/**
 * CLI: verify Meta WhatsApp marketing agent (OpenAI + Graph) and HTTP webhook.
 *
 * From server/:
 *   node scripts/test-whatsapp-agent.mjs
 *   node scripts/test-whatsapp-agent.mjs "¿Cuánto cuesta el plan mensual?"
 *
 * Env:
 *   OMNIRA_WA_TEST_TO_E164 — recipient in digits only (for real outbound + webhook simulation; optional).
 *   OMNIRA_WA_TEST_BASE — default http://127.0.0.1:$PORT
 *   POST /webhook adds X-Hub-Signature-256 when META_WABA_APP_SECRET is set (required for production URL).
 * Always runs a Graph GET on phone_number_id (no send) to validate META_WABA_ACCESS_TOKEN + META_WABA_PHONE_NUMBER_ID.
 */

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const question =
  process.argv.slice(2).join(" ").trim() ||
  process.env.OMNIRA_WA_TEST_QUESTION ||
  "¿Cuánto cuesta Omnira al mes y qué incluye el plan básico?";

const port = Number(process.env.PORT || 5000);
const base = String(process.env.OMNIRA_WA_TEST_BASE || `http://127.0.0.1:${port}`).replace(/\/$/, "");
const testTo = String(process.env.OMNIRA_WA_TEST_TO_E164 || "").replace(/\D/g, "");

function isRemoteBackend(url) {
  try {
    const h = new URL(url).hostname;
    return h !== "127.0.0.1" && h !== "localhost";
  } catch {
    return false;
  }
}

/** Same algorithm as server `verifyMetaAppSecretSignature` — body bytes must match POST exactly. */
function hubSignature256FromRawUtf8(rawUtf8, appSecret) {
  const secret = String(appSecret || "").trim();
  if (!secret) return null;
  const buf = Buffer.from(rawUtf8, "utf8");
  return "sha256=" + crypto.createHmac("sha256", secret).update(buf).digest("hex");
}

function buildMetaWebhookBody(fromDigits, text) {
  const phoneNumberId = String(process.env.META_WABA_PHONE_NUMBER_ID || "").trim();
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: String(process.env.META_WABA_BUSINESS_ACCOUNT_ID || "test_waba"),
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550000000",
                phone_number_id: phoneNumberId
              },
              contacts: [{ profile: { name: "CLI Test" }, wa_id: fromDigits }],
              messages: [
                {
                  from: fromDigits,
                  id: `wamid.cli.${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

async function runStep(title, fn) {
  process.stdout.write(`\n── ${title} ──\n`);
  try {
    const result = await fn();
    if (result !== undefined) {
      console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    }
    return { ok: true, result };
  } catch (e) {
    console.error("FAIL:", e?.message || e);
    if (e?.cause?.code === "ECONNREFUSED" || /fetch failed|ECONNREFUSED/i.test(String(e?.message || ""))) {
      console.error("Hint: start the API in another terminal:  cd server && node server.js");
    }
    return { ok: false, error: e };
  }
}

async function main() {
  console.log("Omnira WhatsApp agent CLI test");
  console.log("Question:", question);
  console.log("HTTP base:", base);
  console.log("OMNIRA_WA_TEST_TO_E164:", testTo || "(empty — set to your WhatsApp number for full send test)");

  let exit = 0;

  const { runMarketingAgentReplyForTest, openAiReplyToInbound } = await import("../src/metaWhatsAppWebhook.js");

  function resolveOpenAiKey() {
    const names = ["OPENAI_API_KEY", "OPENAI_KEY", "OPEN_AI_API_KEY", "OPENAI_SECRET_KEY", "CHAT_OPENAI_API_KEY"];
    for (const n of names) {
      const v = String(process.env[n] || "").trim();
      if (v) return v;
    }
    return "";
  }

  const graphVersion = (() => {
    const gv = String(process.env.META_WABA_GRAPH_VERSION || "v21.0").trim();
    return gv.startsWith("v") ? gv : `v${gv}`;
  })();

  const graphPhoneNode = await runStep("Meta Graph: phone_number_id (token + ID smoke, no outbound send)", async () => {
    const token = String(process.env.META_WABA_ACCESS_TOKEN || "").trim();
    const phoneNumberId = String(process.env.META_WABA_PHONE_NUMBER_ID || "").trim();
    if (!token || !phoneNumberId) {
      return "FAIL: META_WABA_ACCESS_TOKEN or META_WABA_PHONE_NUMBER_ID missing in .env";
    }
    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=display_phone_number,verified_name`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000)
    });
    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { parse_error: true, raw: raw.slice(0, 300) };
    }
    if (!res.ok) {
      if (res.status === 401) {
        console.error(
          "\nMeta Graph API 401: token invalid/expired — generate a new long-lived token with whatsapp_business_messaging.\n"
        );
      }
      return { http: res.status, body: data, FAIL: true };
    }
    return { http: res.status, display_phone_number: data.display_phone_number, verified_name: data.verified_name };
  });
  if (!graphPhoneNode.ok || (graphPhoneNode.result && graphPhoneNode.result.FAIL)) exit = 1;
  if (graphPhoneNode.ok && isRemoteBackend(base)) {
    console.warn(
      "[cli] Graph smoke used local server/.env. If GET /health on this base shows meta_whatsapp_graph_send_configured=false, copy META_WABA_* and OPENAI_API_KEY into Vercel and redeploy."
    );
  }

  const aiOnly = await runStep("OpenAI only (marketing system prompt)", async () => {
    const key = resolveOpenAiKey();
    if (!key) {
      return "FAIL: no OpenAI API key (set OPENAI_API_KEY or CHAT_OPENAI_API_KEY in .env)";
    }
    const reply = await openAiReplyToInbound(question);
    if (!reply) {
      return "FAIL: OpenAI returned empty (check key / quota / model)";
    }
    return { preview: reply.slice(0, 400) + (reply.length > 400 ? "…" : "") };
  });
  if (!aiOnly.ok || (typeof aiOnly.result === "string" && aiOnly.result.startsWith("FAIL"))) exit = 1;

  const direct = await runStep("Direct pipeline: OpenAI → Graph (same as webhook handler)", async () => {
    if (!testTo) {
      return "SKIP: set OMNIRA_WA_TEST_TO_E164 (digits, e.g. 34612345678) to verify Graph API delivery.";
    }
    const out = await runMarketingAgentReplyForTest({ from: testTo, body: question });
    if (!out.ok) {
      if (out.status === 401) {
        console.error(
          "\nMeta Graph API 401: META_WABA_ACCESS_TOKEN is expired or revoked.\n" +
            "Fix: Meta Business Suite → WhatsApp → API setup (or developers.facebook.com) → generate a new token\n" +
            "with whatsapp_business_messaging, then update META_WABA_ACCESS_TOKEN in server/.env and redeploy.\n"
        );
      }
      if (out.status === 400 && /Invalid parameter/i.test(String(out.snippet || ""))) {
        console.error(
          "\nMeta returned 400 Invalid parameter for outbound `to`. Common causes:\n" +
            "  • OMNIRA_WA_TEST_TO_E164 is the same as your WhatsApp Business number — use a different phone (your personal WA in digits, country code without +).\n" +
            "  • No open customer care / 24h session with that user — they must message you first or you use an approved template.\n"
        );
      }
      return { ...out, FAIL: true };
    }
    return out;
  });
  if (!direct.ok || (direct.result && direct.result.FAIL)) exit = 1;

  const health = await runStep("GET /health (meta flags)", async () => {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15000) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { http: res.status, body: j, FAIL: true };
    }
    return j;
  });
  if (!health.ok || (health.result && health.result.FAIL)) exit = 1;
  if (health.ok && isRemoteBackend(base)) {
    const hr = health.result || {};
    const issues = hr.meta_whatsapp_deploy_issues;
    if (Array.isArray(issues) && issues.length) {
      console.error(
        "\n[health] This **deployed** host reports WhatsApp is not fully configured. Add these in Vercel → backend project → Environment Variables → Production, then redeploy:\n\n" +
          issues.map((s) => `  • ${s}`).join("\n") +
          `\n\nmeta_whatsapp_replies_ready=${hr.meta_whatsapp_replies_ready}\n`
      );
      exit = 1;
    } else if (
      hr.meta_whatsapp_replies_ready !== true &&
      (hr.meta_whatsapp_graph_send_configured === false || hr.meta_whatsapp_webhook_verify_token_set === false)
    ) {
      console.error(
        "\n[health] Remote backend is missing WhatsApp env (graph_send and/or verify_token false). Copy from local server/.env into Vercel: META_WABA_ACCESS_TOKEN, META_WABA_PHONE_NUMBER_ID, META_WABA_VERIFY_TOKEN, OPENAI_API_KEY, plus META_WABA_APP_SECRET or META_WABA_WEBHOOK_SKIP_SIGNATURE=true. Redeploy, set Meta webhook to https://<backend>/api/meta/whatsapp/webhook. See server/env.vercel.production.template\n"
      );
      exit = 1;
    }
  }

  const webhook = await runStep("POST /api/meta/whatsapp/webhook (simulated Meta JSON)", async () => {
    if (!testTo) {
      return "SKIP webhook HTTP test (needs OMNIRA_WA_TEST_TO_E164 so the handler has a valid `from`).";
    }
    const bodyObj = buildMetaWebhookBody(testTo, question);
    const raw = JSON.stringify(bodyObj);
    const headers = { "Content-Type": "application/json" };
    const appSecret = String(process.env.META_WABA_APP_SECRET || "").trim();
    const sig = hubSignature256FromRawUtf8(raw, appSecret);
    if (sig) {
      headers["X-Hub-Signature-256"] = sig;
    } else if (isRemoteBackend(base)) {
      console.warn(
        "[cli] META_WABA_APP_SECRET missing — remote POST will get 403 (Meta always sends X-Hub-Signature-256)."
      );
    }
    const res = await fetch(`${base}/api/meta/whatsapp/webhook`, {
      method: "POST",
      headers,
      body: raw,
      signal: AbortSignal.timeout(120000)
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 400);
    }
    if (!res.ok) return { status: res.status, body: parsed, FAIL: true };
    return { status: res.status, body: parsed };
  });
  if (!webhook.ok || (webhook.result && webhook.result.FAIL)) exit = 1;

  const verify = await runStep("GET webhook verify (Meta subscription check)", async () => {
    const tok = String(process.env.META_WABA_VERIFY_TOKEN || "").trim();
    if (!tok) {
      return "SKIP: META_WABA_VERIFY_TOKEN empty";
    }
    const u = new URL(`${base}/api/meta/whatsapp/webhook`);
    u.searchParams.set("hub.mode", "subscribe");
    u.searchParams.set("hub.verify_token", tok);
    u.searchParams.set("hub.challenge", "test_challenge_ok");
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(15000) });
    const body = await res.text();
    if (res.status !== 200 || body !== "test_challenge_ok") {
      return { status: res.status, body: body.slice(0, 200), FAIL: true };
    }
    return { status: res.status, challengeEcho: body };
  });
  if (!verify.ok || (verify.result && verify.result.FAIL)) exit = 1;
  if (
    verify.result &&
    verify.result.FAIL &&
    verify.result.status === 403 &&
    isRemoteBackend(base)
  ) {
    console.error(
      "\n[verify] GET /webhook returned 403 — Vercel’s META_WABA_VERIFY_TOKEN is missing or does not match the token you used in this CLI (local .env). Copy the same verify token string into the backend project on Vercel and redeploy, then re-save the webhook in Meta if needed.\n"
    );
  }

  process.exitCode = exit;
  console.log(exit === 0 ? "\nDone: all executed steps passed (or were skipped)." : "\nDone: some steps failed — see above.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
