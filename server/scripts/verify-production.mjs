/**
 * Omnira production smoke test (CLI).
 *
 * Checks the **deployed** API (default: omnira-backend.vercel.app): health, Stripe public
 * endpoint, Meta WhatsApp webhook verify. Uses local server/.env only for comparing
 * META_WABA_VERIFY_TOKEN to the server (optional).
 *
 * Usage (from server/):
 *   node scripts/verify-production.mjs
 *   OMNIRA_VERIFY_BASE=https://your-api.vercel.app node scripts/verify-production.mjs
 *
 * Exit 1 if payment or WhatsApp readiness checks fail (see printed summary).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const base = String(process.env.OMNIRA_VERIFY_BASE || "https://omnira-backend.vercel.app").replace(/\/$/, "");
const timeoutMs = Number(process.env.OMNIRA_VERIFY_TIMEOUT_MS || 30000);

function section(title) {
  console.log(`\n${"═".repeat(72)}\n ${title}\n${"═".repeat(72)}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json", ...(opts.headers || {}) }
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text.slice(0, 500) };
  }
  return { res, json };
}

function walkthroughText() {
  return `
PROJECT LAYOUT (monorepo)
  server/     → Express API (deploy this folder to Vercel: Root Directory = "server")
  frontend/   → Marketing site (Vite); VITE_API_BASE → backend URL
  admin/      → Admin panel; VITE_API_BASE → backend URL

PAYMENT (production)
  • Vercel backend env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY),
    STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET (for automatic DB updates),
    CUSTOMER_JWT_SECRET, PUBLIC_APP_URL (Stripe success/cancel redirects).
  • Stripe Dashboard → Webhook URL: https://<BACKEND>/api/stripe/webhook
  • Customer flow: POST /api/customer/login → JWT → POST /api/customer/stripe/checkout
    or payment-intent; confirm via webhook or POST .../confirm / .../payment-intent/sync.

WHATSAPP AGENT (production)
  • Same backend Vercel project must have: META_WABA_VERIFY_TOKEN, META_WABA_ACCESS_TOKEN,
    META_WABA_PHONE_NUMBER_ID, OPENAI_API_KEY (or META_WABA_MARKETING_AUTO_REPLY),
    and META_WABA_APP_SECRET OR META_WABA_WEBHOOK_SKIP_SIGNATURE=true.
  • Meta → WhatsApp → Webhook: https://<BACKEND>/api/meta/whatsapp/webhook
  • After changing env: Redeploy. Open GET /health → meta_whatsapp_replies_ready must be true.

THIS SCRIPT
  • Hits: GET /, GET /health, GET /api/public/stripe-publishable-key,
    GET /api/meta/whatsapp/webhook?hub.mode=subscribe&... (token from local .env if set).
`;
}

function inferWhatsAppReady(hr) {
  if (hr.meta_whatsapp_replies_ready === true) return { ok: true, detail: "meta_whatsapp_replies_ready" };
  if (hr.meta_whatsapp_replies_ready === false) return { ok: false, detail: "meta_whatsapp_replies_ready_false" };
  const issues = hr.meta_whatsapp_deploy_issues;
  if (Array.isArray(issues) && issues.length) return { ok: false, detail: "deploy_issues" };
  if (
    hr.meta_whatsapp_webhook_verify_token_set === true &&
    hr.meta_whatsapp_graph_send_configured === true
  ) {
    return { ok: true, detail: "legacy_health_ok" };
  }
  return { ok: false, detail: "incomplete" };
}

function isLocalBase(url) {
  try {
    const h = new URL(url).hostname;
    return h === "127.0.0.1" || h === "localhost";
  } catch {
    return false;
  }
}

async function main() {
  console.log("Omnira — production verification CLI");
  console.log("Target base:", base);
  console.log(walkthroughText());

  let exit = 0;
  const problems = [];

  section("1) Root GET /");
  try {
    const { res, json } = await fetchJson(`${base}/`);
    console.log("HTTP", res.status);
    console.log(JSON.stringify(json, null, 2));
    if (!res.ok) {
      problems.push("GET / not OK");
      exit = 1;
    }
  } catch (e) {
    console.error("FAIL:", e?.message || e);
    problems.push("GET / unreachable");
    exit = 1;
  }

  section("2) GET /health (Supabase + Stripe + Meta + JWT)");
  let health = {};
  try {
    const { res, json } = await fetchJson(`${base}/health`);
    health = json;
    console.log("HTTP", res.status);
    console.log(JSON.stringify(json, null, 2));
    if (!res.ok) {
      problems.push("GET /health not OK");
      exit = 1;
    }
  } catch (e) {
    console.error("FAIL:", e?.message || e);
    problems.push("GET /health unreachable");
    exit = 1;
    health = {};
  }

  const payOk =
    health.supabase_live === true &&
    health.stripe_secret_configured === true &&
    health.stripe_publishable_configured === true;
  if (!payOk) {
    problems.push(
      "PAYMENT READINESS: need supabase_live=true, stripe_secret_configured=true, stripe_publishable_configured=true on this deployment."
    );
    exit = 1;
  }
  if (health.stripe_webhook_secret_configured === false) {
    console.warn(
      "\n⚠️  stripe_webhook_secret_configured=false — paid Checkout/PaymentIntent may not auto-update DB until you set STRIPE_WEBHOOK_SECRET and point Stripe webhooks to this API.\n"
    );
  }
  if (health.customer_jwt_configured === false) {
    problems.push("CUSTOMER_JWT_SECRET missing — customer login / paid routes return 503.");
    exit = 1;
  }

  section("3) GET /api/public/stripe-publishable-key");
  try {
    const { res, json } = await fetchJson(`${base}/api/public/stripe-publishable-key`);
    console.log("HTTP", res.status);
    if (res.ok && json.ok && String(json.publishableKey || "").startsWith("pk_")) {
      console.log("PASS: publishable key returned (prefix only):", String(json.publishableKey).slice(0, 8) + "…");
    } else {
      console.log(JSON.stringify(json, null, 2));
      problems.push("Stripe publishable key endpoint failed or empty.");
      exit = 1;
    }
  } catch (e) {
    console.error("FAIL:", e?.message || e);
    problems.push("stripe-publishable-key unreachable");
    exit = 1;
  }

  section("4) Meta WhatsApp GET /api/meta/whatsapp/webhook (verify challenge)");
  const verifyTok = String(process.env.META_WABA_VERIFY_TOKEN || "").trim();
  if (!verifyTok) {
    console.warn("SKIP: META_WABA_VERIFY_TOKEN not set in local server/.env — cannot compare to server.");
    if (health.meta_whatsapp_webhook_verify_token_set === false) {
      problems.push("Server has no META_WABA_VERIFY_TOKEN (Meta webhook verify will 403).");
      exit = 1;
    }
  } else {
    try {
      const u = new URL(`${base}/api/meta/whatsapp/webhook`);
      u.searchParams.set("hub.mode", "subscribe");
      u.searchParams.set("hub.verify_token", verifyTok);
      u.searchParams.set("hub.challenge", "omnira_cli_challenge");
      const res = await fetch(u.toString(), { signal: AbortSignal.timeout(timeoutMs) });
      const text = (await res.text()).trim();
      if (res.status === 200 && text === "omnira_cli_challenge") {
        console.log("PASS: server echoed hub.challenge (verify token matches this host).");
      } else {
        console.log("HTTP", res.status, text.slice(0, 200));
        problems.push(
          "WhatsApp webhook GET verify failed — Vercel META_WABA_VERIFY_TOKEN must match local .env and Meta dashboard."
        );
        exit = 1;
      }
    } catch (e) {
      console.error("FAIL:", e?.message || e);
      problems.push("WhatsApp verify request failed");
      exit = 1;
    }
  }

  const wa = inferWhatsAppReady(health);
  if (!wa.ok) {
    problems.push(`WHATSAPP: readiness failed (${wa.detail}) — see /health or env.`);
    exit = 1;
    const issues = health.meta_whatsapp_deploy_issues;
    if (Array.isArray(issues) && issues.length) {
      section("WhatsApp deploy_issues (from last /health)");
      for (const line of issues) {
        console.log(" •", line);
      }
    }
  } else {
    console.log("\nPASS: WhatsApp readiness OK (" + wa.detail + ")");
  }

  section("Summary");
  if (problems.length) {
    console.log("\nIssues:");
    for (const p of problems) {
      console.log(" •", p);
    }
    console.log(
      isLocalBase(base)
        ? "\nLocal: restart `node server.js` from server/ after pulling latest code; confirm server/.env matches.\n"
        : "\nProduction: Vercel → backend → Environment Variables (Production) → Redeploy.\n"
    );
  } else {
    console.log("All automated checks passed for:", base);
  }

  process.exitCode = exit;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
