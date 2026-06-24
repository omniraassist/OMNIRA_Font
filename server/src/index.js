import { isVercelRuntime } from "./load-env.js";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { testSupabaseConnection, isSupabaseConfigured } from "./config/supabase.js";
import { supabaseAdmin } from "./config/supabase.js";
import { signCustomerToken, requireCustomer, verifyCustomerToken, signAdminToken, requireAdmin } from "./customerJwt.js";
import { getCheckoutPlans, getCheckoutPlan, computeNewSubscriptionEnd, invalidatePricingCache } from "./billing.js";
import { getPlatformSetting, invalidatePlatformSettingsCache, maskSecret } from "./platformSettings.js";
import { getStripe, applyPaidCheckoutSession, applyPaidPaymentIntent, OMNIRA_PAYMENT_INTENT_FLOW, applySubscriptionInvoicePaid, applySubscriptionDeleted } from "./stripeSync.js";
import { invoiceNumberFor, getInvoiceById } from "./invoice.js";
import { verifyEmailTransport, isEmailConfigured, sendEmail, emailConfigDiagnostics } from "./email.js";
import {
  listFolders as imapListFolders,
  listMessages as imapListMessages,
  fetchMessage as imapFetchMessage,
  setFlags as imapSetFlags,
  moveMessage as imapMoveMessage,
  appendToSent as imapAppendToSent,
  isImapConfigured,
  imapConfigDiagnostics,
} from "./emailInbox.js";
import {
  handleMetaWhatsAppGet,
  handleMetaWhatsAppPost,
  getMetaWhatsAppDeployDiagnostics,
  invalidateBotConfigCache,
  sendWelcomeWhatsAppMessage,
  findCustomerConfigByPhoneNumberId,
  callOpenAiWithRetry,
  extractLeadFromConversation,
  upsertWaLead,
  extractBookingFromConversation,
  saveBotBooking,
  conversationHasBookingKeywords,
  loadCustomerBotConfig,
  loadCustomerBusiness,
  buildCustomerSystemPrompt
} from "./metaWhatsAppWebhook.js";
import { getAdapter, providerStatus } from "./calendar/registry.js";
import { createOAuthState, verifyOAuthState } from "./calendar/oauthState.js";
import { encryptCredentials, decryptCredentials, isCalendarCryptoConfigured } from "./calendar/crypto.js";
import { syncEventOutbound, runCalendarSyncJobs } from "./calendar/sync.js";
import {
  isTwilioConfigured,
  assignNumberToCustomer,
  releaseCustomerNumber,
  getCustomerNumber,
  findCustomerByTwilioNumber,
  sendTwilioWhatsAppMessage,
  verifyTwilioSignature,
  shouldSkipTwilioSignature,
  checkAndIncrementConversation,
  getConversationUsage,
  PLAN_CONVERSATION_LIMITS
} from "./twilio.js";

const app = express();
const port = Number(process.env.PORT || 5000);
const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * Answer CORS preflight first — avoids Express 5 / proxy edge cases where OPTIONS
 * would otherwise miss headers or hit a failing handler (browser shows CORS + 500).
 */
app.use((req, res, next) => {
  if (req.method !== "OPTIONS") return next();
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Credentials", "false");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  const requested = req.headers["access-control-request-headers"];
  res.setHeader(
    "Access-Control-Allow-Headers",
    requested ||
      "Content-Type, Authorization, Stripe-Signature, X-Hub-Signature-256, Accept, Origin, X-Requested-With, Cache-Control, Pragma"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  return res.status(204).end();
});

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders:
    "Content-Type, Authorization, Stripe-Signature, X-Hub-Signature-256, Accept, Origin, X-Requested-With, Cache-Control, Pragma",
  credentials: false
};

app.use(cors(corsOptions));

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const whSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const insecureLocal =
    !isVercelRuntime &&
    process.env.NODE_ENV !== "production" &&
    String(process.env.STRIPE_WEBHOOK_INSECURE_LOCAL || "").trim() === "true" &&
    !whSecret;

  let event;
  if (insecureLocal) {
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
      event = JSON.parse(buf.toString("utf8"));
      console.warn("[stripe webhook] STRIPE_WEBHOOK_INSECURE_LOCAL: no signature verification (local dev only)");
    } catch {
      return res.status(400).send("Invalid JSON body");
    }
  } else {
    const stripe = getStripe();
    if (!stripe || !whSecret) {
      return res.status(503).send("Webhook not configured (set STRIPE_WEBHOOK_SECRET or local dev flags — see .env.example)");
    }
    try {
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(req.body, sig, whSecret);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "payment") {
        await applyPaidCheckoutSession(session);
      }
      // Subscription checkout: invoice.payment_succeeded handles the actual grant
    }
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      if (String(pi.metadata?.omnira_flow || "").trim() === OMNIRA_PAYMENT_INTENT_FLOW) {
        await applyPaidPaymentIntent(pi);
      }
    }
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      if (invoice.subscription) {
        await applySubscriptionInvoicePaid(invoice);
      }
    }
    if (
      event.type === "customer.subscription.deleted" ||
      (event.type === "customer.subscription.updated" &&
        event.data.object.status === "canceled")
    ) {
      await applySubscriptionDeleted(event.data.object);
    }
    return res.json({ received: true });
  } catch (e) {
    console.error("stripe webhook", e);
    return res.status(500).json({ ok: false });
  }
});

/**
 * Meta requires verifying HMAC over the exact raw POST bytes. On some serverless hosts,
 * express.json({ verify }) does not populate rawBody reliably — use raw + manual parse.
 */
function metaWhatsappRawBody(req) {
  const ct = String(req.headers["content-type"] || "").toLowerCase();
  return ct.includes("application/json") || ct.includes("json");
}

const metaWhatsappRaw = express.raw({
  type: metaWhatsappRawBody,
  limit: "1024kb"
});

function metaWhatsappParseJson(req, res, next) {
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
  req.rawBody = buf;
  try {
    req.body = buf.length ? JSON.parse(buf.toString("utf8")) : {};
  } catch {
    req.body = {};
  }
  next();
}

app.get("/api/meta/whatsapp/webhook", handleMetaWhatsAppGet);
app.post("/api/meta/whatsapp/webhook", metaWhatsappRaw, metaWhatsappParseJson, handleMetaWhatsAppPost);

app.use(express.json());

app.get("/", async (_req, res) => {
  const meta = await getMetaWhatsAppDeployDiagnostics();
  res.status(200).json({
    ok: true,
    service: "omnira-api",
    health: "/health",
    runtime: isVercelRuntime ? "vercel" : "node",
    /** Vercel-injected: should be "production" on your live API URL (if "preview", env may be wrong scope). */
    vercel_env: isVercelRuntime ? String(process.env.VERCEL_ENV || "").trim() || undefined : undefined,
    vercel_url: isVercelRuntime ? String(process.env.VERCEL_URL || "").trim() || undefined : undefined,
    supabase_env_configured: isSupabaseConfigured(),
    meta_whatsapp_replies_ready: meta.meta_whatsapp_replies_ready,
    meta_whatsapp_graph_send_configured: meta.meta_whatsapp_graph_send_configured,
    meta_whatsapp_webhook_verify_token_set: meta.meta_whatsapp_webhook_verify_token_set,
    meta_whatsapp_openai_configured: meta.meta_whatsapp_openai_configured,
    meta_whatsapp_skip_signature_env: meta.meta_whatsapp_skip_signature_env
  });
});

function publicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(
    /\/$/,
    ""
  );
}

/**
 * Public origin of THIS Express server. OAuth redirect URIs and provider
 * webhooks need to be absolute, and Vercel never knows its own URL from
 * inside the runtime — so we read `PUBLIC_API_URL` first and fall back to
 * Vercel's auto-set VERCEL_URL before defaulting to localhost for dev.
 */
function publicApiUrl() {
  const explicit = String(process.env.PUBLIC_API_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercelHost = String(process.env.VERCEL_URL || "").trim();
  if (vercelHost) return `https://${vercelHost}`.replace(/\/$/, "");
  return `http://localhost:${port}`;
}

function buildCustomerUserPayload(row) {
  const ends = row?.subscription_ends_at;
  const subscriptionActive = Boolean(ends && new Date(ends) > new Date());
  const biz =
    `${row?.first_name || ""} ${row?.last_name || ""}`.trim() || row?.email?.split("@")[0] || "Cliente";
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    businessName: biz,
    subscription_plan_id: row.subscription_plan_id,
    subscription_ends_at: row.subscription_ends_at,
    stripe_subscription_id: row.stripe_subscription_id || null,
    subscriptionActive
  };
}

app.get("/api/customer/me", requireCustomer, async (req, res) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from("customer_users")
      .select("id, email, first_name, last_name, phone, subscription_plan_id, subscription_ends_at, stripe_subscription_id")
      .eq("id", req.customerId)
      .maybeSingle();
    if (error || !user) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }
    return res.status(200).json({ ok: true, user: buildCustomerUserPayload(user) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post("/api/customer/stripe/checkout", requireCustomer, async (req, res) => {
  try {
    const planId = String(req.body?.plan_id || "").trim();
    const plan = await getCheckoutPlan(planId);
    if (!plan) {
      return res.status(400).json({ ok: false, message: "Invalid plan_id." });
    }
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ ok: false, message: "STRIPE_SECRET_KEY not configured on server." });
    }
    const base = publicAppUrl();
    const metadata = { customer_user_id: String(req.customerId), plan_id: planId };

    // If plan has a Stripe Price ID, use subscription mode for auto-renewal
    const stripePriceId = plan.stripePriceId || null;
    let session;
    if (stripePriceId) {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: req.customerEmail || undefined,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/?checkout=canceled`,
        metadata,
        subscription_data: { metadata },
        client_reference_id: String(req.customerId)
      });
    } else {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: req.customerEmail || undefined,
        line_items: [
          {
            price_data: {
              currency: plan.currency || "eur",
              unit_amount: plan.amountCents,
              product_data: {
                name: `Omnira — ${plan.label}`,
                description: `Acceso al panel (${plan.label}).`
              }
            },
            quantity: 1
          }
        ],
        success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/?checkout=canceled`,
        metadata,
        client_reference_id: String(req.customerId)
      });
    }
    return res.status(200).json({ ok: true, url: session.url, mode: session.mode });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Checkout error." });
  }
});

app.post("/api/customer/stripe/confirm", requireCustomer, async (req, res) => {
  try {
    const sessionId = String(req.body?.session_id || "").trim();
    if (!sessionId) {
      return res.status(400).json({ ok: false, message: "session_id is required." });
    }
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ ok: false, message: "STRIPE_SECRET_KEY not configured." });
    }
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"]
    });
    if (String(session.metadata?.customer_user_id || "").trim() !== String(req.customerId).trim()) {
      return res.status(403).json({ ok: false, message: "Invalid session for this user." });
    }
    if (session.payment_status !== "paid") {
      return res.status(202).json({ ok: false, pending: true, message: "Payment not completed yet." });
    }
    const applied = await applyPaidCheckoutSession(session);
    if (!applied.ok) {
      return res.status(400).json({ ok: false, message: applied.reason || "Confirm failed." });
    }
    const { data: user } = await supabaseAdmin
      .from("customer_users")
      .select("id, email, first_name, last_name, phone, subscription_plan_id, subscription_ends_at, stripe_subscription_id")
      .eq("id", req.customerId)
      .maybeSingle();
    return res.status(200).json({
      ok: true,
      user: user ? buildCustomerUserPayload(user) : null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Publishable Stripe key for embedded Elements (safe to expose; rate-limit in production if needed). */
app.get("/api/public/stripe-publishable-key", (_req, res) => {
  const key = String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
  if (!key) {
    return res.status(503).json({ ok: false, message: "STRIPE_PUBLISHABLE_KEY not configured." });
  }
  return res.status(200).json({ ok: true, publishableKey: key });
});

/**
 * Public pricing (active plans only) — landing page, customer panel, and any
 * widget read this so they always show what the admin set in /api/admin/pricing.
 */
app.get("/api/public/pricing", async (_req, res) => {
  try {
    const map = await getCheckoutPlans();
    const plans = Object.entries(map)
      .map(([id, p]) => ({
        id,
        label: p.label,
        period_text: p.periodText || "",
        amount_cents: p.amountCents,
        duration_days: p.durationDays,
        currency: p.currency || "eur",
        sort_order: p.sortOrder || 0
      }))
      .sort((a, b) => a.sort_order - b.sort_order);
    return res.status(200).json({ ok: true, plans });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Pricing failed: ${error.message}` });
  }
});

/**
 * Public site-wide widget settings — read by the landing page on every load to
 * decide whether to render the floating WhatsApp button. Admin toggles the
 * underlying platform_settings row from /admin/whatsapp; the 30 s in-process
 * cache in getPlatformSetting() makes the flip near-instant. Fails open (shows
 * the widget) if the read crashes, so a Supabase blip never hides the CTA.
 */
app.get("/api/public/widget-settings", async (_req, res) => {
  try {
    const raw = await getPlatformSetting("OMNIRA_WIDGET_WHATSAPP_ENABLED", "true");
    const enabled = String(raw || "").trim().toLowerCase() !== "false";
    res.set("Cache-Control", "public, max-age=30, s-maxage=30");
    return res.status(200).json({ ok: true, whatsapp_widget_enabled: enabled });
  } catch (error) {
    return res.status(200).json({ ok: false, whatsapp_widget_enabled: true, message: error.message });
  }
});

/** Create PaymentIntent for embedded card pay (same plans as Checkout redirect). */
app.post("/api/customer/stripe/payment-intent", requireCustomer, async (req, res) => {
  try {
    const planId = String(req.body?.plan_id || "").trim();
    const plan = await getCheckoutPlan(planId);
    if (!plan) {
      return res.status(400).json({ ok: false, message: "Invalid plan_id." });
    }
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ ok: false, message: "STRIPE_SECRET_KEY not configured." });
    }
    const pi = await stripe.paymentIntents.create({
      amount: plan.amountCents,
      currency: plan.currency || "eur",
      automatic_payment_methods: { enabled: true },
      receipt_email: req.customerEmail || undefined,
      description: `Omnira — ${plan.label}`,
      metadata: {
        omnira_flow: OMNIRA_PAYMENT_INTENT_FLOW,
        customer_user_id: String(req.customerId),
        plan_id: planId
      }
    });
    return res.status(200).json({
      ok: true,
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "PaymentIntent error." });
  }
});

/** After client confirms card, sync subscription (idempotent; webhook may already have applied). */
app.post("/api/customer/stripe/payment-intent/sync", requireCustomer, async (req, res) => {
  try {
    const piId = String(req.body?.payment_intent_id || "").trim();
    if (!piId) {
      return res.status(400).json({ ok: false, message: "payment_intent_id is required." });
    }
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ ok: false, message: "STRIPE_SECRET_KEY not configured." });
    }
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (String(pi.metadata?.customer_user_id || "").trim() !== String(req.customerId).trim()) {
      return res.status(403).json({ ok: false, message: "Invalid payment for this user." });
    }
    if (pi.status !== "succeeded") {
      return res.status(202).json({ ok: false, pending: true, message: "Payment not completed yet." });
    }
    const applied = await applyPaidPaymentIntent(pi);
    if (!applied.ok && applied.reason !== "duplicate") {
      return res.status(400).json({ ok: false, message: applied.reason || "Sync failed." });
    }
    const { data: user } = await supabaseAdmin
      .from("customer_users")
      .select("id, email, first_name, last_name, phone, subscription_plan_id, subscription_ends_at, stripe_subscription_id")
      .eq("id", req.customerId)
      .maybeSingle();
    return res.status(200).json({
      ok: true,
      user: user ? buildCustomerUserPayload(user) : null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Dev / QA only: grant subscription without Stripe when OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE=true */
app.post("/api/customer/subscription/simulate", requireCustomer, async (req, res) => {
  try {
    // DB-first (platform_settings) → env fallback. Lets us toggle the dev-mode
    // "Test · skip payment" button without a Vercel redeploy by just inserting
    // the row in Supabase.
    const allowRaw = await getPlatformSetting("OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE", "");
    const allow = String(allowRaw || "").trim().toLowerCase() === "true";
    if (!allow) {
      return res.status(403).json({
        ok: false,
        message:
          "Simulate disabled. Insert OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE='true' into platform_settings (or set the env var) to enable."
      });
    }
    const planId = String(req.body?.plan_id || "").trim();
    const plan = await getCheckoutPlan(planId);
    if (!plan) {
      return res.status(400).json({ ok: false, message: "Invalid plan_id." });
    }
    const { data: row } = await supabaseAdmin
      .from("customer_users")
      .select("subscription_ends_at")
      .eq("id", req.customerId)
      .maybeSingle();
    const newEnd = computeNewSubscriptionEnd(row?.subscription_ends_at, plan.durationDays);
    const { data: user, error } = await supabaseAdmin
      .from("customer_users")
      .update({
        subscription_plan_id: planId,
        subscription_ends_at: newEnd,
        updated_at: new Date().toISOString()
      })
      .eq("id", req.customerId)
      .select("id, email, first_name, last_name, phone, subscription_plan_id, subscription_ends_at, stripe_subscription_id")
      .maybeSingle();
    if (error || !user) {
      return res.status(500).json({ ok: false, message: error?.message || "Update failed." });
    }

    // System notification (best-effort, dedup'd by user+grant time)
    try {
      const dedup = `system:purchase:simulate:${req.customerId}:${newEnd}`;
      const { data: existing } = await supabaseAdmin
        .from("user_notifications")
        .select("id")
        .eq("created_by", dedup)
        .maybeSingle();
      if (!existing) {
        const dateStr = new Date(newEnd).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
        await supabaseAdmin.from("user_notifications").insert({
          target_email: user.email,
          title: "✅ ¡Plan activado! (test)",
          message: `Tu plan "${plan.label}" está activo hasta el ${dateStr}.`,
          created_by: dedup
        });
      }
    } catch { /* ignore */ }

    return res.status(200).json({ ok: true, user: buildCustomerUserPayload(user) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Cancel auto-renewal at period end — the customer keeps access until subscription_ends_at. */
app.post("/api/customer/stripe/subscription/cancel", requireCustomer, async (req, res) => {
  try {
    const { data: cu } = await supabaseAdmin
      .from("customer_users")
      .select("stripe_subscription_id")
      .eq("id", req.customerId)
      .maybeSingle();
    const subId = cu?.stripe_subscription_id;
    if (!subId) {
      return res.status(400).json({ ok: false, message: "No hay suscripción activa para cancelar." });
    }
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ ok: false, message: "Stripe no configurado." });
    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    return res.json({ ok: true, message: "Renovación automática cancelada. Tu plan sigue activo hasta la fecha de vencimiento." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Reactivate auto-renewal if the customer changes their mind before period end. */
app.post("/api/customer/stripe/subscription/reactivate", requireCustomer, async (req, res) => {
  try {
    const { data: cu } = await supabaseAdmin
      .from("customer_users")
      .select("stripe_subscription_id")
      .eq("id", req.customerId)
      .maybeSingle();
    const subId = cu?.stripe_subscription_id;
    if (!subId) {
      return res.status(400).json({ ok: false, message: "No hay suscripción para reactivar." });
    }
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ ok: false, message: "Stripe no configurado." });
    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
    return res.json({ ok: true, message: "Renovación automática reactivada." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const value = String(storedHash || "");
  if (!value) return false;

  if (!value.includes(":")) {
    // Legacy plain-text password — use timing-safe comparison to prevent timing attacks.
    const a = Buffer.from(String(password || ""));
    const b = Buffer.from(value);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  const parts = value.split(":");
  const salt = parts[0];
  const originalHash = parts[1];
  if (!salt || !originalHash) return false;
  const hashToCompare = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(hashToCompare, "hex"));
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getTokenExpiryIso() {
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  return expiresAt.toISOString();
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function asIsoDate(value) {
  try {
    return new Date(value).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// Protect all admin routes. These three paths are public (no token needed).
const ADMIN_PUBLIC_PATHS = new Set([
  "/api/admin/login",
  "/api/admin/reset/request",
  "/api/admin/reset/confirm",
]);
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/admin")) return next();
  if (ADMIN_PUBLIC_PATHS.has(req.path)) return next();
  return requireAdmin(req, res, next);
});

async function ensureAuxTables() {
  try {
    await supabaseAdmin.rpc("exec_sql", {
      sql: `
        create table if not exists public.user_notifications (
          id uuid primary key default gen_random_uuid(),
          target_email text,
          title text not null,
          message text not null,
          created_by text,
          is_active boolean not null default true,
          created_at timestamptz not null default now()
        );
      `
    });
  } catch {
    /* no-op: table creation is also provided via schema.sql */
  }
}

app.get("/api/admin/users", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase();
    const status = String(req.query.status || "all").trim().toLowerCase();

    const { data, error } = await supabaseAdmin
      .from("customer_users")
      .select(
        "id, email, first_name, last_name, phone, is_active, subscription_plan_id, subscription_ends_at, created_at, updated_at"
      )
      .order("created_at", { ascending: false });
    if (error) throw error;

    let users = (data || []).map((u) => {
      const subscriptionActive = Boolean(
        u.subscription_ends_at && new Date(u.subscription_ends_at) > new Date()
      );
      return {
        id: u.id,
        email: u.email,
        first_name: u.first_name || "",
        last_name: u.last_name || "",
        phone: u.phone || "",
        is_active: !!u.is_active,
        plan: u.subscription_plan_id || null,
        subscription_ends_at: u.subscription_ends_at,
        subscription_active: subscriptionActive,
        created_at: u.created_at
      };
    });

    if (search) {
      users = users.filter(
        (u) =>
          u.email.toLowerCase().includes(search) ||
          `${u.first_name} ${u.last_name}`.toLowerCase().includes(search) ||
          u.phone.toLowerCase().includes(search)
      );
    }

    if (status === "active") users = users.filter((u) => u.is_active);
    if (status === "blocked") users = users.filter((u) => !u.is_active);

    return res.status(200).json({ ok: true, users });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin users failed: ${error.message}` });
  }
});

app.put("/api/admin/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const payload = {
      first_name: String(req.body?.first_name || "").trim() || null,
      last_name: String(req.body?.last_name || "").trim() || null,
      phone: String(req.body?.phone || "").trim() || null,
      email: normalizeEmail(req.body?.email),
      updated_at: new Date().toISOString()
    };
    if (!payload.email) return res.status(400).json({ ok: false, message: "Email is required." });

    const { data, error } = await supabaseAdmin
      .from("customer_users")
      .update(payload)
      .eq("id", id)
      .select("id, email, first_name, last_name, phone, is_active")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "User not found." });
    return res.status(200).json({ ok: true, user: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Update user failed: ${error.message}` });
  }
});

app.patch("/api/admin/users/:id/block", async (req, res) => {
  try {
    const { id } = req.params;
    const blocked = !!req.body?.blocked;
    const { data, error } = await supabaseAdmin
      .from("customer_users")
      .update({ is_active: !blocked, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, email, is_active")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "User not found." });
    return res.status(200).json({ ok: true, user: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Block user failed: ${error.message}` });
  }
});

app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from("customer_users").delete().eq("id", id);
    if (error) throw error;
    return res.status(200).json({ ok: true, message: "User deleted." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Delete user failed: ${error.message}` });
  }
});

app.post("/api/admin/notifications", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const message = String(req.body?.message || "").trim();
    const targetEmail = normalizeEmail(req.body?.target_email || "");
    const createdBy = normalizeEmail(req.body?.created_by || "admin");
    if (!title || !message) {
      return res.status(400).json({ ok: false, message: "Title and message are required." });
    }
    const { data, error } = await supabaseAdmin
      .from("user_notifications")
      .insert({
        target_email: targetEmail || null,
        title,
        message,
        created_by: createdBy
      })
      .select("id, target_email, title, message, created_at")
      .single();
    if (error) throw error;
    return res.status(201).json({ ok: true, notification: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Create notification failed: ${error.message}` });
  }
});

app.get("/api/admin/notifications", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("user_notifications")
      .select("id, target_email, title, message, created_by, created_at, is_active")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return res.status(200).json({ ok: true, notifications: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `List notifications failed: ${error.message}` });
  }
});

app.patch("/api/admin/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const patch = {};
    if (typeof req.body?.is_active === "boolean") patch.is_active = req.body.is_active;
    if (typeof req.body?.title === "string") patch.title = req.body.title.slice(0, 200);
    if (typeof req.body?.message === "string") patch.message = req.body.message.slice(0, 4000);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, message: "No editable fields supplied." });
    }
    const { data, error } = await supabaseAdmin
      .from("user_notifications")
      .update(patch)
      .eq("id", id)
      .select("id, title, message, target_email, created_by, created_at, is_active")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Notification not found." });
    return res.status(200).json({ ok: true, notification: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Update notification failed: ${error.message}` });
  }
});

app.delete("/api/admin/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from("user_notifications").delete().eq("id", id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Delete notification failed: ${error.message}` });
  }
});

/**
 * Admin self-profile (used by the /profile page). PATCH lets the admin update
 * their full_name and/or change their password. Password change requires
 * current_password to be verified.
 */
app.get("/api/admin/admins/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, full_name, avatar_data_url, is_active, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Admin not found." });
    return res.status(200).json({ ok: true, admin: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Get admin failed: ${error.message}` });
  }
});

/**
 * Validate an `image/(png|jpeg|webp|gif)` data URL and enforce a 256 KB byte
 * cap on the underlying image. The /profile page already resizes to 256×256
 * JPEG-0.82 client-side (≈30–80 KB encoded) so this cap is a server-side
 * safety net, not the primary constraint.
 */
function validateAvatarDataUrl(value) {
  if (value == null || value === "") return { ok: true, normalized: null };
  if (typeof value !== "string") return { ok: false, message: "avatar must be a string" };
  const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i.exec(value);
  if (!m) return { ok: false, message: "avatar must be a base64 data URL (png/jpeg/webp/gif)" };
  // Approximate decoded byte length: base64 has ~4/3 expansion.
  const approxBytes = Math.floor((m[2].length * 3) / 4);
  if (approxBytes > 256 * 1024) {
    return { ok: false, message: "avatar too large (max 256 KB after base64)" };
  }
  return { ok: true, normalized: value };
}

app.patch("/api/admin/admins/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const newName = typeof req.body?.full_name === "string" ? req.body.full_name.trim().slice(0, 200) : null;
    const newPassword = typeof req.body?.new_password === "string" ? req.body.new_password : null;
    const currentPassword = typeof req.body?.current_password === "string" ? req.body.current_password : null;
    const wantsAvatarChange = Object.prototype.hasOwnProperty.call(req.body || {}, "avatar_data_url");
    let avatarToWrite = null;
    if (wantsAvatarChange) {
      const v = validateAvatarDataUrl(req.body.avatar_data_url);
      if (!v.ok) return res.status(400).json({ ok: false, message: v.message });
      avatarToWrite = v.normalized; // null = remove
    }

    if (newPassword) {
      if (!isValidPassword(newPassword)) {
        return res.status(400).json({ ok: false, message: "New password must be at least 8 characters." });
      }
      if (!currentPassword) {
        return res.status(400).json({ ok: false, message: "current_password is required to change password." });
      }
      const { data: row, error: rerr } = await supabaseAdmin
        .from("admin_users")
        .select("id, password_hash")
        .eq("id", id)
        .maybeSingle();
      if (rerr) throw rerr;
      if (!row) return res.status(404).json({ ok: false, message: "Admin not found." });
      if (!verifyPassword(currentPassword, row.password_hash)) {
        return res.status(401).json({ ok: false, message: "Current password is incorrect." });
      }
    }

    const patch = { updated_at: new Date().toISOString() };
    if (newName != null) patch.full_name = newName || null;
    if (newPassword) patch.password_hash = hashPassword(newPassword);
    if (wantsAvatarChange) patch.avatar_data_url = avatarToWrite;
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ ok: false, message: "Nothing to update." });
    }

    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .update(patch)
      .eq("id", id)
      .select("id, email, full_name, avatar_data_url, is_active, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Admin not found." });
    return res.status(200).json({ ok: true, admin: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Update admin failed: ${error.message}` });
  }
});

/**
 * Customer WhatsApp data (Phase 1 single-tenant: until per-customer Meta routing
 * lands in Phase 3, only rows that already have customer_user_id = req.customerId
 * are returned. New customers see empty lists with a guidance hint, which is the
 * intended behavior — they haven't connected their own WhatsApp yet).
 */
app.get("/api/customer/wa-conversations", requireCustomer, async (req, res) => {
  try {
    const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 100));
    const { data: rows, error } = await supabaseAdmin
      .from("wa_messages")
      .select("phone_number_id, wa_from, direction, body, created_at")
      .eq("customer_user_id", req.customerId)
      .order("created_at", { ascending: false })
      .limit(1500);
    if (error) throw error;

    const byKey = new Map();
    for (const r of rows || []) {
      const key = `${r.phone_number_id || ""}|${r.wa_from}`;
      const cur = byKey.get(key);
      if (!cur) {
        byKey.set(key, {
          phone_number_id: r.phone_number_id || null,
          wa_from: r.wa_from,
          last_direction: r.direction,
          last_body: r.body || "",
          last_at: r.created_at,
          message_count: 1,
          inbound_count: r.direction === "inbound" ? 1 : 0,
          outbound_count: r.direction === "outbound" ? 1 : 0
        });
      } else {
        cur.message_count += 1;
        if (r.direction === "inbound") cur.inbound_count += 1;
        else cur.outbound_count += 1;
      }
    }
    const conversations = Array.from(byKey.values())
      .sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)))
      .slice(0, limit);

    if (conversations.length) {
      const { data: leads } = await supabaseAdmin
        .from("wa_leads")
        .select("phone_number_id, wa_from, id, name, email, intent, status, confidence, language")
        .eq("customer_user_id", req.customerId);
      const leadIdx = new Map();
      for (const l of leads || []) {
        leadIdx.set(`${l.phone_number_id || ""}|${l.wa_from}`, l);
      }
      for (const c of conversations) {
        c.lead = leadIdx.get(`${c.phone_number_id || ""}|${c.wa_from}`) || null;
      }
    }

    return res.status(200).json({ ok: true, conversations });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer wa-conversations failed: ${error.message}` });
  }
});

app.get("/api/customer/wa-messages", requireCustomer, async (req, res) => {
  try {
    const from = String(req.query.from || "").trim();
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    let q = supabaseAdmin
      .from("wa_messages")
      .select("id, phone_number_id, wa_from, direction, message_type, body, language, created_at")
      .eq("customer_user_id", req.customerId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (from) q = q.eq("wa_from", from);
    const { data, error } = await q;
    if (error) throw error;
    return res.status(200).json({ ok: true, messages: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer wa-messages failed: ${error.message}` });
  }
});

app.get("/api/customer/leads", requireCustomer, async (req, res) => {
  try {
    const status = String(req.query.status || "").trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    let q = supabaseAdmin
      .from("wa_leads")
      .select(
        "id, phone_number_id, wa_from, name, email, phone, intent, language, confidence, notes, status, message_count, first_seen_at, last_message_at, created_at"
      )
      .eq("customer_user_id", req.customerId)
      .order("last_message_at", { ascending: false })
      .limit(limit);
    if (["new", "contacted", "qualified", "converted", "lost"].includes(status)) {
      q = q.eq("status", status);
    }
    const { data, error } = await q;
    if (error) throw error;
    return res.status(200).json({ ok: true, leads: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer leads failed: ${error.message}` });
  }
});

function escapeCsvField(val) {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

app.get("/api/customer/leads/export", requireCustomer, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("wa_leads")
      .select("name, email, phone, wa_from, intent, language, status, confidence, notes, message_count, first_seen_at, last_message_at")
      .eq("customer_user_id", req.customerId)
      .order("last_message_at", { ascending: false });
    if (error) throw error;

    const cols = ["name", "email", "phone", "wa_from", "intent", "language", "status", "confidence", "notes", "message_count", "first_seen_at", "last_message_at"];
    const header = cols.join(",");
    const rows = (data || []).map(r => cols.map(c => escapeCsvField(r[c])).join(","));
    const csv = [header, ...rows].join("\r\n");

    const date = new Date().toISOString().slice(0, 10);
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="omnira-leads-${date}.csv"`);
    return res.send("﻿" + csv); // BOM para que Excel abra bien en español
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Leads export failed: ${error.message}` });
  }
});

/**
 * Customer-side WhatsApp credentials: each paying customer provides their own
 * Meta Cloud API setup (access token, phone_number_id, app secret, verify token,
 * WABA id). Phase-3 multi-tenant routing reads this row when the inbound webhook
 * matches their phone_number_id and dispatches to their bot_configs.customer row.
 *
 * Secrets are masked on GET. PATCH lets the customer overwrite any field.
 */
/**
 * The webhook verify token is just a shared random string — there is no
 * reason to make the customer invent one. We generate it server-side so the
 * customer only has to copy it into Meta (never type it). Format is a long
 * unguessable token namespaced with `omnira_`.
 */
function generateVerifyToken() {
  return `omnira_${crypto.randomBytes(24).toString("hex")}`;
}

async function ensureCustomerWhatsAppConfig(customerId) {
  const { data } = await supabaseAdmin
    .from("customer_whatsapp_configs")
    .select("customer_user_id, meta_verify_token")
    .eq("customer_user_id", customerId)
    .maybeSingle();
  if (data) {
    // Backfill an auto-generated verify token for rows created before this
    // was server-managed, so every customer always has one ready.
    if (!data.meta_verify_token) {
      const token = generateVerifyToken();
      await supabaseAdmin
        .from("customer_whatsapp_configs")
        .update({ meta_verify_token: token })
        .eq("customer_user_id", customerId);
      return { ...data, meta_verify_token: token };
    }
    return data;
  }
  const { error } = await supabaseAdmin
    .from("customer_whatsapp_configs")
    .insert({ customer_user_id: customerId, meta_verify_token: generateVerifyToken() });
  if (error) throw error;
  return { customer_user_id: customerId };
}

/**
 * Ask the Meta Graph API for the phone numbers under a WABA. Lets us derive
 * the customer's `phone_number_id` automatically instead of making them copy
 * it by hand — they only give us the WABA id + access token.
 */
async function fetchWabaPhoneNumbers(accessToken, wabaId, versionTag) {
  const url = `https://graph.facebook.com/${versionTag}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20000)
  });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  return { ok: res.ok, status: res.status, data, raw };
}

app.get("/api/customer/whatsapp-config", requireCustomer, async (req, res) => {
  try {
    await ensureCustomerWhatsAppConfig(req.customerId);
    const { data, error } = await supabaseAdmin
      .from("customer_whatsapp_configs")
      .select(
        "meta_access_token, meta_phone_number_id, meta_business_account_id, meta_app_secret, meta_verify_token, meta_graph_version, meta_display_phone_number, meta_verified_name, is_active, setup_completed_at, updated_at"
      )
      .eq("customer_user_id", req.customerId)
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({
      ok: true,
      config: {
        meta_phone_number_id: data?.meta_phone_number_id || "",
        meta_business_account_id: data?.meta_business_account_id || "",
        meta_verify_token: data?.meta_verify_token || "",
        meta_graph_version: data?.meta_graph_version || "v21.0",
        meta_display_phone_number: data?.meta_display_phone_number || "",
        meta_verified_name: data?.meta_verified_name || "",
        is_active: !!data?.is_active,
        setup_completed_at: data?.setup_completed_at || null,
        updated_at: data?.updated_at || null,
        meta_access_token_masked: maskSecret(data?.meta_access_token || ""),
        meta_app_secret_masked: maskSecret(data?.meta_app_secret || ""),
        meta_access_token_set: Boolean(data?.meta_access_token),
        meta_app_secret_set: Boolean(data?.meta_app_secret)
      },
      webhook_url: canonicalWebhookUrl()
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer WhatsApp config load failed: ${error.message}` });
  }
});

app.patch("/api/customer/whatsapp-config", requireCustomer, async (req, res) => {
  try {
    await ensureCustomerWhatsAppConfig(req.customerId);
    const patch = { updated_at: new Date().toISOString() };
    // meta_verify_token is intentionally NOT customer-editable — it is
    // generated and owned server-side (see generateVerifyToken).
    const STRING_FIELDS = [
      "meta_access_token",
      "meta_phone_number_id",
      "meta_business_account_id",
      "meta_app_secret",
      "meta_graph_version",
      "meta_display_phone_number",
      "meta_verified_name"
    ];
    for (const k of STRING_FIELDS) {
      if (typeof req.body?.[k] === "string") {
        const trimmed = req.body[k].trim().slice(0, 2000);
        patch[k] = trimmed || null;
      }
    }
    if (typeof req.body?.is_active === "boolean") patch.is_active = req.body.is_active;
    if (req.body?.mark_complete === true) {
      patch.setup_completed_at = new Date().toISOString();
    }
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ ok: false, message: "No editable fields supplied." });
    }
    const { error } = await supabaseAdmin
      .from("customer_whatsapp_configs")
      .update(patch)
      .eq("customer_user_id", req.customerId);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer WhatsApp config update failed: ${error.message}` });
  }
});

/**
 * Verify the customer's just-saved Meta credentials by calling the Meta Graph
 * API. If the phone_number_id + access_token combination works, we mark
 * is_active=true, store the verified_name + display_phone_number Meta gave us,
 * and send a welcome WhatsApp message to the customer's personal phone (if we
 * have one). The customer can ONLY enter the dashboard after this check passes.
 */
app.post("/api/customer/whatsapp-config/verify", requireCustomer, async (req, res) => {
  try {
    const { data: cfg, error: cfgErr } = await supabaseAdmin
      .from("customer_whatsapp_configs")
      .select(
        "customer_user_id, meta_access_token, meta_app_secret, meta_phone_number_id, meta_business_account_id, meta_verify_token, meta_graph_version, is_active"
      )
      .eq("customer_user_id", req.customerId)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!cfg) {
      return res.status(400).json({
        ok: false,
        message: "Please save your Meta credentials first, then click Verify."
      });
    }

    // Minimum required fields the customer must supply. The verify token is
    // auto-generated server-side, and the phone_number_id is auto-fetched
    // from the WABA below — so the customer only provides these three.
    const missing = [];
    if (!cfg.meta_access_token) missing.push("Meta access token");
    if (!cfg.meta_app_secret) missing.push("App secret");
    if (!cfg.meta_business_account_id) missing.push("WABA business account ID");
    if (missing.length) {
      return res.status(400).json({
        ok: false,
        verified: false,
        message: `Missing required fields: ${missing.join(", ")}.`
      });
    }

    const gv = String(cfg.meta_graph_version || "v21.0").trim();
    const versionTag = gv.startsWith("v") ? gv : `v${gv}`;

    // Auto-resolve the phone_number_id from the WABA when the customer
    // hasn't provided one (the normal case — they only give the WABA id).
    let phoneNumberId = String(cfg.meta_phone_number_id || "").trim();
    if (!phoneNumberId) {
      let pn;
      try {
        pn = await fetchWabaPhoneNumbers(cfg.meta_access_token, cfg.meta_business_account_id, versionTag);
      } catch (e) {
        return res.status(502).json({
          ok: false,
          verified: false,
          message: `No se pudo contactar con Meta para leer los números del WABA (${e?.message || "network error"}).`
        });
      }
      if (!pn.ok) {
        let hint = "";
        if (pn.status === 401) hint = " El access token no es válido o ha caducado.";
        else if (pn.status === 400 || pn.status === 404) hint = " El WABA business account ID es incorrecto.";
        else if (pn.status === 403) hint = " El token no tiene permiso sobre este WABA. Asigna el usuario de sistema a la cuenta de WhatsApp.";
        return res.status(200).json({
          ok: false,
          verified: false,
          meta_status: pn.status,
          meta_error: pn.data?.error?.message || pn.raw.slice(0, 240),
          message: `No se pudieron leer los números del WABA (HTTP ${pn.status}).${hint}`
        });
      }
      const numbers = Array.isArray(pn.data?.data) ? pn.data.data : [];
      const first = numbers[0];
      if (!first?.id) {
        return res.status(200).json({
          ok: false,
          verified: false,
          message:
            "Este WABA no tiene ningún número de WhatsApp asociado. Añade un número en Meta y vuelve a verificar."
        });
      }
      phoneNumberId = String(first.id);
      await supabaseAdmin
        .from("customer_whatsapp_configs")
        .update({ meta_phone_number_id: phoneNumberId, updated_at: new Date().toISOString() })
        .eq("customer_user_id", req.customerId);
    }

    // Check that another customer hasn't claimed this phone_number_id already.
    const otherOwner = await findCustomerConfigByPhoneNumberId(phoneNumberId);
    if (otherOwner && otherOwner.customer_user_id !== req.customerId) {
      return res.status(409).json({
        ok: false,
        verified: false,
        message:
          "This phone_number_id is already linked to another Omnira account. If this is a mistake, contact support."
      });
    }

    const url = `https://graph.facebook.com/${versionTag}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`;

    let graphRes;
    try {
      graphRes = await fetch(url, {
        headers: { Authorization: `Bearer ${cfg.meta_access_token}` },
        signal: AbortSignal.timeout(20000)
      });
    } catch (e) {
      return res.status(502).json({
        ok: false,
        verified: false,
        message: `Could not reach Meta Graph API (${e?.message || "network error"}).`
      });
    }

    const raw = await graphRes.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

    if (!graphRes.ok) {
      let hint = "";
      if (graphRes.status === 401) {
        hint = " Your access token is invalid or expired. Generate a new long-lived system user token with `whatsapp_business_messaging`.";
      } else if (graphRes.status === 400) {
        hint = " The phone_number_id is likely wrong. Check Meta API Setup → Phone numbers.";
      } else if (graphRes.status === 403) {
        hint = " The token doesn't have permission for this phone. Make sure the system user is assigned to the WhatsApp Business Account.";
      }
      return res.status(200).json({
        ok: false,
        verified: false,
        meta_status: graphRes.status,
        meta_error: data?.error?.message || raw.slice(0, 240),
        message: `Verification failed (HTTP ${graphRes.status}).${hint}`
      });
    }

    // Success — persist the verified state.
    const now = new Date().toISOString();
    const display = String(data?.display_phone_number || "").trim() || null;
    const verifiedName = String(data?.verified_name || "").trim() || null;
    await supabaseAdmin
      .from("customer_whatsapp_configs")
      .update({
        is_active: true,
        meta_display_phone_number: display,
        meta_verified_name: verifiedName,
        setup_completed_at: now,
        updated_at: now
      })
      .eq("customer_user_id", req.customerId);

    // Fire-and-forget welcome message to the customer's personal phone.
    let welcome = { sent: false };
    try {
      const { data: u } = await supabaseAdmin
        .from("customer_users")
        .select("phone, first_name, email")
        .eq("id", req.customerId)
        .maybeSingle();
      const phoneDigits = String(u?.phone || "").replace(/\D/g, "");
      if (phoneDigits.length >= 8) {
        const sendRes = await sendWelcomeWhatsAppMessage(
          {
            meta_access_token: cfg.meta_access_token,
            meta_phone_number_id: phoneNumberId,
            meta_graph_version: cfg.meta_graph_version
          },
          phoneDigits
        );
        welcome = { sent: !!sendRes?.ok, to: phoneDigits, error: sendRes?.snippet || null };
      }
    } catch (e) {
      welcome = { sent: false, error: e?.message || "welcome send failed" };
    }

    return res.status(200).json({
      ok: true,
      verified: true,
      display_phone_number: display,
      verified_name: verifiedName,
      quality_rating: data?.quality_rating || null,
      platform_type: data?.platform_type || null,
      welcome
    });
  } catch (error) {
    return res.status(500).json({ ok: false, verified: false, message: `Verify failed: ${error.message}` });
  }
});

/**
 * Returns a copy-paste website widget snippet for the customer. The snippet is
 * a floating WhatsApp button (pure HTML/CSS/JS, no external deps) that opens
 * wa.me with the customer's verified display number. Also returns the wa.me
 * link by itself and the platform webhook URL for reference.
 */
app.get("/api/customer/widget-snippet", requireCustomer, async (req, res) => {
  try {
    const { data: cfg } = await supabaseAdmin
      .from("customer_whatsapp_configs")
      .select("meta_display_phone_number, meta_phone_number_id, meta_verified_name, is_active")
      .eq("customer_user_id", req.customerId)
      .maybeSingle();
    const { data: user } = await supabaseAdmin
      .from("customer_users")
      .select("phone, first_name, last_name")
      .eq("id", req.customerId)
      .maybeSingle();

    const displayRaw = cfg?.meta_display_phone_number || user?.phone || "";
    const digits = String(displayRaw).replace(/\D/g, "");
    const waMe = digits ? `https://wa.me/${digits}` : "";
    const businessName =
      cfg?.meta_verified_name ||
      `${user?.first_name || ""} ${user?.last_name || ""}`.trim() ||
      "your business";
    const greetingMsg = encodeURIComponent(`Hola, vengo desde tu sitio web — quiero información.`);
    const waMeWithMsg = digits ? `${waMe}?text=${greetingMsg}` : "";

    const snippet = digits
      ? `<!-- Omnira WhatsApp widget — paste before </body> -->
<a id="omnira-wa" href="${waMeWithMsg}" target="_blank" rel="noopener noreferrer"
   aria-label="Chat on WhatsApp with ${businessName}"
   style="position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,0.25);z-index:9999;text-decoration:none;transition:transform .15s ease;">
  <svg viewBox="0 0 24 24" width="32" height="32" fill="#fff" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
</a>
<script>(function(){var b=document.getElementById('omnira-wa');if(!b)return;b.addEventListener('mouseover',function(){b.style.transform='scale(1.08)';});b.addEventListener('mouseout',function(){b.style.transform='scale(1)';});})();</script>
<!-- /Omnira WhatsApp widget -->`
      : "";

    return res.status(200).json({
      ok: true,
      is_active: !!cfg?.is_active,
      display_phone_number: cfg?.meta_display_phone_number || null,
      digits,
      wa_me_url: waMe,
      wa_me_url_with_message: waMeWithMsg,
      business_name: businessName,
      webhook_url: canonicalWebhookUrl(),
      snippet
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Widget snippet failed: ${error.message}` });
  }
});

/**
 * Customer-side bot config: each paying customer can curate their own prompt +
 * knowledge base. Phase-3 multi-tenant routing will use these rows; until then,
 * the customer can prepare their content and admin can preview/approve.
 */
async function ensureCustomerBotConfig(customerId) {
  const { data } = await supabaseAdmin
    .from("bot_configs")
    .select("id")
    .eq("scope", "customer")
    .eq("customer_user_id", customerId)
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await supabaseAdmin
    .from("bot_configs")
    .insert({ scope: "customer", customer_user_id: customerId })
    .select("id")
    .single();
  if (error) throw error;
  return created;
}

app.get("/api/customer/bot-config", requireCustomer, async (req, res) => {
  try {
    await ensureCustomerBotConfig(req.customerId);
    const { data, error } = await supabaseAdmin
      .from("bot_configs")
      .select("id, system_prompt, knowledge_base, greeting, is_active, updated_at")
      .eq("scope", "customer")
      .eq("customer_user_id", req.customerId)
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({ ok: true, config: data || null });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer bot config load failed: ${error.message}` });
  }
});

app.patch("/api/customer/bot-config", requireCustomer, async (req, res) => {
  try {
    await ensureCustomerBotConfig(req.customerId);
    const patch = { updated_at: new Date().toISOString() };
    if (typeof req.body?.system_prompt === "string") patch.system_prompt = req.body.system_prompt.slice(0, 16000);
    if (typeof req.body?.knowledge_base === "string") patch.knowledge_base = req.body.knowledge_base.slice(0, 32000);
    if (typeof req.body?.greeting === "string") patch.greeting = req.body.greeting.slice(0, 2000);
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ ok: false, message: "No editable fields supplied." });
    }
    const { data, error } = await supabaseAdmin
      .from("bot_configs")
      .update(patch)
      .eq("scope", "customer")
      .eq("customer_user_id", req.customerId)
      .select("id, system_prompt, knowledge_base, greeting, is_active, updated_at")
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({ ok: true, config: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer bot config update failed: ${error.message}` });
  }
});

/**
 * Aggregated dashboard data for the customer's "Resumen" screen. Real numbers
 * only — pulled from wa_messages, wa_leads, customer_events and
 * customer_payments. Anything we don't have yet returns 0/empty, never a
 * fabricated value.
 */
app.get("/api/customer/dashboard", requireCustomer, async (req, res) => {
  try {
    const now = new Date();
    const dayMs = 86_400_000;
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const startOfWeek = new Date(now.getTime() - 6 * dayMs);
    startOfWeek.setUTCHours(0, 0, 0, 0);

    const [
      msgMonth,
      msgTotal,
      leadsTotal,
      leadsMonth,
      bookingsMonth,
      bookingsTotal,
      upcomingRes,
      latestPayment,
      activityRows
    ] = await Promise.all([
      supabaseAdmin
        .from("wa_messages")
        .select("*", { count: "exact", head: true })
        .eq("customer_user_id", req.customerId)
        .gte("created_at", startOfMonth),
      supabaseAdmin
        .from("wa_messages")
        .select("*", { count: "exact", head: true })
        .eq("customer_user_id", req.customerId),
      supabaseAdmin
        .from("wa_leads")
        .select("*", { count: "exact", head: true })
        .eq("customer_user_id", req.customerId),
      supabaseAdmin
        .from("wa_leads")
        .select("*", { count: "exact", head: true })
        .eq("customer_user_id", req.customerId)
        .gte("created_at", startOfMonth),
      supabaseAdmin
        .from("customer_events")
        .select("*", { count: "exact", head: true })
        .eq("customer_user_id", req.customerId)
        .gte("datetime", startOfMonth),
      supabaseAdmin
        .from("customer_events")
        .select("*", { count: "exact", head: true })
        .eq("customer_user_id", req.customerId),
      supabaseAdmin
        .from("customer_events")
        .select("id, name, datetime, service, status")
        .eq("customer_user_id", req.customerId)
        .gte("datetime", now.toISOString())
        .order("datetime", { ascending: true })
        .limit(5),
      supabaseAdmin
        .from("customer_payments")
        .select("amount_cents, currency, plan_id, created_at, subscription_end_after")
        .eq("customer_user_id", req.customerId)
        .order("created_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("wa_messages")
        .select("created_at")
        .eq("customer_user_id", req.customerId)
        .gte("created_at", startOfWeek.toISOString())
    ]);

    // 7-day messages series
    const series = [];
    const byDay = new Map();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startOfWeek.getTime() + i * dayMs);
      const iso = d.toISOString().slice(0, 10);
      byDay.set(iso, {
        date: iso,
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        messages: 0
      });
    }
    for (const r of activityRows.data || []) {
      const key = String(r.created_at || "").slice(0, 10);
      const b = byDay.get(key);
      if (b) b.messages += 1;
    }
    for (const v of byDay.values()) series.push(v);

    const lastPay = (latestPayment.data || [])[0] || null;

    return res.status(200).json({
      ok: true,
      stats: {
        messagesMonth: msgMonth.count || 0,
        messagesTotal: msgTotal.count || 0,
        leadsTotal: leadsTotal.count || 0,
        leadsMonth: leadsMonth.count || 0,
        bookingsMonth: bookingsMonth.count || 0,
        bookingsTotal: bookingsTotal.count || 0
      },
      messagesSeries: series,
      upcomingBookings: (upcomingRes.data || []).map((e) => ({
        id: e.id,
        name: e.name,
        datetime: e.datetime,
        service: e.service,
        status: e.status
      })),
      latestPayment: lastPay
        ? {
            amount_euro: Number((Number(lastPay.amount_cents || 0) / 100).toFixed(2)),
            currency: lastPay.currency || "eur",
            plan_id: lastPay.plan_id,
            created_at: lastPay.created_at,
            subscription_end_after: lastPay.subscription_end_after
          }
        : null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer dashboard failed: ${error.message}` });
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   EXTERNAL CALENDAR SYNC — Google Calendar OAuth (Phase 1: outbound push).
   Microsoft Graph and Apple CalDAV slot in here later behind the same
   adapter contract. See server/src/calendar/* for the per-provider logic.
   ───────────────────────────────────────────────────────────────────────── */

/** Health/diagnostics — never exposes secrets, just booleans. */
app.get("/api/customer/calendar/providers", requireCustomer, async (_req, res) => {
  try {
    return res.status(200).json({
      ok: true,
      cryptoConfigured: isCalendarCryptoConfigured(),
      providers: providerStatus(),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Start the OAuth flow: return the authorization URL for the chosen provider. */
app.post("/api/customer/calendar/:provider/connect", requireCustomer, async (req, res) => {
  try {
    const provider = String(req.params.provider || "").toLowerCase();
    if (provider !== "google") {
      return res.status(400).json({ ok: false, message: `Provider ${provider} aún no soportado.` });
    }
    const adapter = getAdapter(provider);
    if (!adapter.isConfigured()) {
      return res.status(503).json({
        ok: false,
        message: "El servidor no tiene credenciales OAuth de Google configuradas. Avisa al administrador.",
      });
    }
    if (!isCalendarCryptoConfigured()) {
      return res.status(503).json({
        ok: false,
        message: "CALENDAR_TOKEN_ENC_KEY no está configurado en el servidor.",
      });
    }
    const state = createOAuthState({ customerId: req.customerId, provider });
    const authUrl = adapter.getAuthUrl(state);
    return res.status(200).json({ ok: true, authUrl });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * OAuth callback. Google redirects the browser here after the user authorises;
 * we exchange the code for tokens, encrypt them, store the connection, and
 * 302 the user back to the customer panel with ?calendar=connected.
 */
app.get("/api/customer/calendar/:provider/callback", async (req, res) => {
  const provider = String(req.params.provider || "").toLowerCase();
  const appUrl = publicAppUrl();
  const back = (status, message) => {
    const params = new URLSearchParams({ calendar: status });
    if (message) params.set("calendar_message", message);
    return res.redirect(`${appUrl}/?panel=login&${params.toString()}`);
  };
  try {
    const { code, state, error: errParam } = req.query || {};
    if (errParam) return back("error", String(errParam));
    if (!code || !state) return back("error", "missing-code-or-state");
    const verified = verifyOAuthState(String(state), { provider });
    if (!verified.ok) return back("error", `state-${verified.reason}`);
    if (provider !== "google") return back("error", "unsupported-provider");

    const adapter = getAdapter(provider);
    const tokens = await adapter.exchangeCode(String(code));
    if (!tokens.access_token) return back("error", "no-access-token");

    const credsToStore = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry: tokens.expiry,
    };

    // Upsert the connection. If the same customer reconnects the same Google
    // account, we just overwrite — keeps target_calendar_id and sync cursors.
    const { data: existing } = await supabaseAdmin
      .from("customer_calendar_connections")
      .select("id")
      .eq("customer_user_id", verified.customerId)
      .eq("provider", provider)
      .eq("account_email", tokens.email || "")
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("customer_calendar_connections")
        .update({
          encrypted_credentials: encryptCredentials(credsToStore),
          token_expires_at: tokens.expiry ? new Date(tokens.expiry).toISOString() : null,
          status: "active",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("customer_calendar_connections").insert({
        customer_user_id: verified.customerId,
        provider,
        account_email: tokens.email || null,
        encrypted_credentials: encryptCredentials(credsToStore),
        token_expires_at: tokens.expiry ? new Date(tokens.expiry).toISOString() : null,
        target_calendar_id: "primary",
        target_calendar_name: "Calendario principal",
        status: "active",
      });
    }

    return back("connected");
  } catch (error) {
    return back("error", String(error?.message || error).slice(0, 200));
  }
});

/** List connections for the panel UI (NEVER returns the encrypted token blob). */
app.get("/api/customer/calendar/connections", requireCustomer, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("customer_calendar_connections")
      .select(
        "id, provider, account_email, target_calendar_id, target_calendar_name, status, last_sync_at, last_error, created_at, updated_at"
      )
      .eq("customer_user_id", req.customerId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.status(200).json({ ok: true, connections: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** List the user's calendars from the provider so they can choose the target one. */
app.get("/api/customer/calendar/connections/:id/calendars", requireCustomer, async (req, res) => {
  try {
    const { data: conn } = await supabaseAdmin
      .from("customer_calendar_connections")
      .select("id, provider, encrypted_credentials")
      .eq("id", req.params.id)
      .eq("customer_user_id", req.customerId)
      .maybeSingle();
    if (!conn) return res.status(404).json({ ok: false, message: "Conexión no encontrada" });
    const adapter = getAdapter(conn.provider);
    let creds = decryptCredentials(conn.encrypted_credentials);
    const { creds: fresh, changed } = await adapter.ensureFreshAccessToken(creds);
    creds = fresh;
    if (changed) {
      await supabaseAdmin
        .from("customer_calendar_connections")
        .update({
          encrypted_credentials: encryptCredentials(creds),
          token_expires_at: creds.expiry ? new Date(creds.expiry).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
    }
    const calendars = await adapter.listCalendars(creds);
    return res.status(200).json({ ok: true, calendars });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Update which calendar new bookings get pushed to. */
app.patch("/api/customer/calendar/connections/:id", requireCustomer, async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (typeof req.body?.target_calendar_id === "string") {
      patch.target_calendar_id = req.body.target_calendar_id.slice(0, 200);
    }
    if (typeof req.body?.target_calendar_name === "string") {
      patch.target_calendar_name = req.body.target_calendar_name.slice(0, 200);
    }
    const { data, error } = await supabaseAdmin
      .from("customer_calendar_connections")
      .update(patch)
      .eq("id", req.params.id)
      .eq("customer_user_id", req.customerId)
      .select(
        "id, provider, account_email, target_calendar_id, target_calendar_name, status, last_sync_at, last_error, created_at, updated_at"
      )
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Conexión no encontrada" });
    return res.status(200).json({ ok: true, connection: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Disconnect: revoke at the provider (best-effort) + delete the row. */
app.delete("/api/customer/calendar/connections/:id", requireCustomer, async (req, res) => {
  try {
    const { data: conn } = await supabaseAdmin
      .from("customer_calendar_connections")
      .select("id, provider, encrypted_credentials")
      .eq("id", req.params.id)
      .eq("customer_user_id", req.customerId)
      .maybeSingle();
    if (!conn) return res.status(404).json({ ok: false, message: "Conexión no encontrada" });

    // Best-effort token revoke — never block the deletion on it.
    try {
      const adapter = getAdapter(conn.provider);
      const creds = decryptCredentials(conn.encrypted_credentials);
      await adapter.revokeToken(creds);
    } catch (e) {
      console.warn("[calendar] revoke failed:", e?.message || e);
    }

    const { error } = await supabaseAdmin
      .from("customer_calendar_connections")
      .delete()
      .eq("id", conn.id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * Cron-safe drain endpoint. Guard with X-Cron-Token === CRON_SECRET so a
 * random visitor can't trigger the worker. Vercel cron will call this on a
 * 5-minute schedule (see vercel.json).
 */
function verifyCronSecret(req) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  if (!expected) return false;
  // Vercel cron sends: Authorization: Bearer <CRON_SECRET>
  const authHeader = String(req.headers["authorization"] || "").trim();
  if (authHeader === `Bearer ${expected}`) return true;
  // Manual / CI call: X-Cron-Token header or ?token= query param
  const given = String(req.headers["x-cron-token"] || req.query.token || "").trim();
  return given === expected;
}

// Vercel cron always sends GET — register both GET and POST so manual triggers work too.
async function handleCalendarDrain(req, res) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  try {
    const result = await runCalendarSyncJobs();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
}
app.get("/api/internal/calendar/drain", handleCalendarDrain);
app.post("/api/internal/calendar/drain", handleCalendarDrain);

/**
 * Customer bookings/calendar. Replaces the prior localStorage stub at /api/events.
 */
app.get("/api/customer/events", requireCustomer, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("customer_events")
      .select("id, name, datetime, end_at, service, phone, notes, source, status, created_at, updated_at")
      .eq("customer_user_id", req.customerId)
      .order("datetime", { ascending: true });
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Events load failed: ${error.message}` });
  }
});

app.post("/api/customer/events", requireCustomer, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.datetime) {
      return res.status(400).json({ ok: false, message: "datetime is required" });
    }
    const { data, error } = await supabaseAdmin
      .from("customer_events")
      .insert({
        customer_user_id: req.customerId,
        name: typeof body.name === "string" ? body.name.slice(0, 200) : null,
        datetime: body.datetime,
        end_at: body.end_at || null,
        service: typeof body.service === "string" ? body.service.slice(0, 200) : null,
        phone: typeof body.phone === "string" ? body.phone.slice(0, 40) : null,
        notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : null,
        source: body.source === "bot" ? "bot" : "manual",
        status: ["pending", "confirmed", "cancelled"].includes(body.status) ? body.status : "confirmed"
      })
      .select()
      .single();
    if (error) throw error;
    // Best-effort: fan out to any connected calendars. Never block the response.
    syncEventOutbound({ customerId: req.customerId, op: "create", event: data }).catch((e) => {
      console.warn("[calendar] post-create sync failed:", e?.message || e);
    });
    return res.status(201).json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Create event failed: ${error.message}` });
  }
});

app.put("/api/customer/events/:id", requireCustomer, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") patch.name = body.name.slice(0, 200) || null;
    if (body.datetime) patch.datetime = body.datetime;
    if ("end_at" in body) patch.end_at = body.end_at || null;
    if (typeof body.service === "string") patch.service = body.service.slice(0, 200) || null;
    if (typeof body.phone === "string") patch.phone = body.phone.slice(0, 40) || null;
    if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000) || null;
    if (["manual", "bot"].includes(body.source)) patch.source = body.source;
    if (["pending", "confirmed", "cancelled"].includes(body.status)) patch.status = body.status;
    const { data, error } = await supabaseAdmin
      .from("customer_events")
      .update(patch)
      .eq("id", id)
      .eq("customer_user_id", req.customerId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Event not found" });
    // Best-effort: push the change to connected calendars.
    syncEventOutbound({ customerId: req.customerId, op: "update", event: data }).catch((e) => {
      console.warn("[calendar] post-update sync failed:", e?.message || e);
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Update event failed: ${error.message}` });
  }
});

app.delete("/api/customer/events/:id", requireCustomer, async (req, res) => {
  try {
    const { id } = req.params;
    // Capture external refs BEFORE deleting so the sync worker knows what to
    // remove from each connected calendar.
    syncEventOutbound({ customerId: req.customerId, op: "delete", event: { id } }).catch((e) => {
      console.warn("[calendar] pre-delete sync enqueue failed:", e?.message || e);
    });
    const { error } = await supabaseAdmin
      .from("customer_events")
      .delete()
      .eq("id", id)
      .eq("customer_user_id", req.customerId);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Delete event failed: ${error.message}` });
  }
});

/**
 * Customer business info (used by the "Mi Negocio" screen). One row per
 * customer; created lazily on first read.
 */
async function ensureCustomerBusiness(customerId) {
  const { data } = await supabaseAdmin
    .from("customer_business_info")
    .select("customer_user_id")
    .eq("customer_user_id", customerId)
    .maybeSingle();
  if (data) return data;
  await supabaseAdmin.from("customer_business_info").insert({ customer_user_id: customerId });
  return { customer_user_id: customerId };
}

app.get("/api/customer/business", requireCustomer, async (req, res) => {
  try {
    await ensureCustomerBusiness(req.customerId);
    const { data, error } = await supabaseAdmin
      .from("customer_business_info")
      .select("name, type, phone, email, address, hours, services, updated_at")
      .eq("customer_user_id", req.customerId)
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json(data || {});
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Business load failed: ${error.message}` });
  }
});

app.put("/api/customer/business", requireCustomer, async (req, res) => {
  try {
    await ensureCustomerBusiness(req.customerId);
    const body = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    for (const k of ["name", "type", "phone", "email", "address", "hours", "services"]) {
      if (typeof body[k] === "string") patch[k] = body[k].slice(0, 4000) || null;
    }
    const { data, error } = await supabaseAdmin
      .from("customer_business_info")
      .update(patch)
      .eq("customer_user_id", req.customerId)
      .select("name, type, phone, email, address, hours, services, updated_at")
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({ ok: true, business: data || {} });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Business update failed: ${error.message}` });
  }
});

/**
 * Customer notifications — JWT required.
 * Looks up the customer's subscription_ends_at and auto-inserts a daily
 * "subscription expiring" reminder when ≤5 days remain (or "expired").
 * Dedup'd by created_by so we insert at most one per bucket per calendar day.
 */
app.get("/api/customer/notifications", requireCustomer, async (req, res) => {
  try {
    const customerId = req.customerId;

    const { data: u } = await supabaseAdmin
      .from("customer_users")
      .select("email, subscription_ends_at")
      .eq("id", customerId)
      .maybeSingle();

    const email = normalizeEmail(u?.email);
    if (!email) return res.status(400).json({ ok: false, message: "Customer email not found." });

    // Auto-generate subscription warnings (≤5 days) / expired notice.
    try {
      if (u?.subscription_ends_at) {
        const now = new Date();
        const ends = new Date(u.subscription_ends_at);
        const msLeft = ends.getTime() - now.getTime();
        const today = now.toISOString().slice(0, 10);
        const dateStr = ends.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
        if (msLeft <= 0) {
          const dedup = `system:expired:${today}:${customerId}`;
          const { data: existing } = await supabaseAdmin
            .from("user_notifications")
            .select("id")
            .eq("created_by", dedup)
            .maybeSingle();
          if (!existing) {
            await supabaseAdmin.from("user_notifications").insert({
              target_email: email,
              title: "⚠️ Tu plan ha expirado",
              message: `Tu agente Omnira está en pausa. Renueva tu plan para que vuelva a responder en WhatsApp 24/7.`,
              created_by: dedup
            });
          }
        } else {
          const daysLeft = Math.ceil(msLeft / 86_400_000);
          if (daysLeft >= 1 && daysLeft <= 5) {
            const dedup = `system:expiry-${daysLeft}d:${today}:${customerId}`;
            const { data: existing } = await supabaseAdmin
              .from("user_notifications")
              .select("id")
              .eq("created_by", dedup)
              .maybeSingle();
            if (!existing) {
              await supabaseAdmin.from("user_notifications").insert({
                target_email: email,
                title: `⏰ Tu plan expira en ${daysLeft} día${daysLeft === 1 ? "" : "s"}`,
                message:
                  `Renueva antes del ${dateStr} para que tu agente Omnira siga respondiendo automáticamente en WhatsApp.`,
                created_by: dedup
              });
            }
          }
        }
      }
    } catch {
      /* Notifications are best-effort — never block the main response. */
    }

    const { data, error } = await supabaseAdmin
      .from("user_notifications")
      .select("id, title, message, created_at, target_email, created_by")
      .eq("is_active", true)
      .or(`target_email.is.null,target_email.eq.${email}`)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return res.status(200).json({ ok: true, notifications: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer notifications failed: ${error.message}` });
  }
});

app.get("/api/admin/overview", async (_req, res) => {
  try {
    const now = new Date();
    const dayMs = 86_400_000;
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const startOfWeek = new Date(now.getTime() - 6 * dayMs);
    startOfWeek.setUTCHours(0, 0, 0, 0);
    const startWeekIso = startOfWeek.toISOString();
    const startLastWeek = new Date(startOfWeek.getTime() - 7 * dayMs);
    startLastWeek.setUTCHours(0, 0, 0, 0);

    const [customerCountRes, adminCountRes, paidCountRes, leadsCountRes] = await Promise.all([
      supabaseAdmin.from("customer_users").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("admin_users").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("customer_users")
        .select("*", { count: "exact", head: true })
        .gt("subscription_ends_at", new Date().toISOString()),
      supabaseAdmin.from("wa_leads").select("*", { count: "exact", head: true })
    ]);
    if (customerCountRes.error) throw customerCountRes.error;
    if (adminCountRes.error) throw adminCountRes.error;

    const { count: monthlyResets } = await supabaseAdmin
      .from("customer_password_resets")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfMonth);

    const { count: messagesMonth } = await supabaseAdmin
      .from("wa_messages")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfMonth);

    const { count: paymentsMonth } = await supabaseAdmin
      .from("customer_payments")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfMonth);

    const { data: paymentRowsMonth } = await supabaseAdmin
      .from("customer_payments")
      .select("amount_cents")
      .gte("created_at", startOfMonth);
    const revenueMonthCents = (paymentRowsMonth || []).reduce(
      (s, r) => s + Number(r.amount_cents || 0),
      0
    );

    const { data: recentClients } = await supabaseAdmin
      .from("customer_users")
      .select("id, email, first_name, last_name, is_active, subscription_plan_id, subscription_ends_at, created_at")
      .order("created_at", { ascending: false })
      .limit(6);

    // Last 14 days of inbound/outbound messages so the dashboard can both
    // render the 7-day chart AND compute the WoW delta from the same data.
    const { data: msg14 } = await supabaseAdmin
      .from("wa_messages")
      .select("created_at, direction")
      .gte("created_at", startLastWeek.toISOString());

    const byDay = new Map();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startOfWeek.getTime() + i * dayMs);
      const iso = d.toISOString().slice(0, 10);
      byDay.set(iso, {
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        date: iso,
        messages: 0,
        inbound: 0,
        outbound: 0
      });
    }
    let messagesThisWeek = 0;
    let messagesLastWeek = 0;
    const startWeekTime = startOfWeek.getTime();
    for (const m of msg14 || []) {
      const t = new Date(m.created_at).getTime();
      if (t >= startWeekTime) {
        messagesThisWeek += 1;
        const key = m.created_at.slice(0, 10);
        const b = byDay.get(key);
        if (b) {
          b.messages += 1;
          if (m.direction === "outbound") b.outbound += 1;
          else b.inbound += 1;
        }
      } else {
        messagesLastWeek += 1;
      }
    }
    const messagesSeries = Array.from(byDay.values());
    const messagesDelta = messagesThisWeek - messagesLastWeek;
    const messagesDeltaPct =
      messagesLastWeek > 0
        ? Math.round((messagesDelta / messagesLastWeek) * 100)
        : messagesThisWeek > 0
          ? 100
          : 0;

    return res.status(200).json({
      ok: true,
      kpis: [
        { id: "customers", label: "Customers", value: customerCountRes.count || 0, hint: "Total registered customers" },
        { id: "paid", label: "Active subscribers", value: paidCountRes.count || 0, hint: "subscription_ends_at in future" },
        { id: "leads", label: "WhatsApp leads", value: leadsCountRes.count || 0, hint: "From wa_leads (all-time)" },
        { id: "messages_month", label: "Messages this month", value: messagesMonth || 0, hint: "Inbound+outbound from wa_messages" },
        { id: "payments_month", label: "Payments this month", value: paymentsMonth || 0, hint: "customer_payments" },
        { id: "revenue_month", label: "Revenue this month", value: (revenueMonthCents / 100).toFixed(2) + "€", hint: "Sum of customer_payments" },
        { id: "admins", label: "Admins", value: adminCountRes.count || 0, hint: "Total admin accounts" },
        { id: "password_resets_month", label: "Resets this month", value: monthlyResets || 0, hint: "Current month" }
      ],
      messagesSeries,
      activity: {
        messagesThisWeek,
        messagesLastWeek,
        messagesDelta,
        messagesDeltaPct
      },
      recentClients: (recentClients || []).map((c) => ({
        id: c.id,
        businessName: `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email.split("@")[0],
        email: c.email,
        plan: c.subscription_plan_id || null,
        subscriptionEndsAt: c.subscription_ends_at,
        agentStatus: c.is_active ? "live" : "paused",
        createdAt: c.created_at
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin overview failed: ${error.message}` });
  }
});

/**
 * Real analytics — everything below comes from Supabase, nothing is fabricated.
 *
 * Time windows:
 *   - daily series: last 30 days (UTC) of wa_messages + wa_leads
 *   - this week / last week: rolling 7-day windows for WoW deltas
 *   - monthly revenue: last 6 calendar months from customer_payments
 *   - status / intent / language: all-time wa_leads (so admins see the
 *     real funnel breakdown, not just the last week's slice)
 */
app.get("/api/admin/analytics", async (_req, res) => {
  try {
    const now = new Date();
    const dayMs = 86_400_000;
    const start30 = new Date(now.getTime() - 29 * dayMs);
    start30.setUTCHours(0, 0, 0, 0);
    const startThisWeek = new Date(now.getTime() - 6 * dayMs);
    startThisWeek.setUTCHours(0, 0, 0, 0);
    const startLastWeek = new Date(now.getTime() - 13 * dayMs);
    startLastWeek.setUTCHours(0, 0, 0, 0);
    const endLastWeek = new Date(now.getTime() - 7 * dayMs);
    endLastWeek.setUTCHours(0, 0, 0, 0);
    const start6Months = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    const [
      msg30,
      leads30,
      allLeads,
      payments6m,
      activeSubs,
      planRows,
      openaiKeys
    ] = await Promise.all([
      supabaseAdmin.from("wa_messages").select("created_at, direction, language").gte("created_at", start30.toISOString()),
      supabaseAdmin.from("wa_leads").select("created_at, status, intent, language").gte("created_at", start30.toISOString()),
      supabaseAdmin.from("wa_leads").select("status, intent, language, message_count"),
      supabaseAdmin.from("customer_payments").select("amount_cents, currency, created_at, plan_id").gte("created_at", start6Months.toISOString()),
      supabaseAdmin
        .from("customer_users")
        .select("subscription_plan_id")
        .gt("subscription_ends_at", now.toISOString()),
      supabaseAdmin.from("pricing_plans").select("id, label, sort_order").order("sort_order"),
      supabaseAdmin.from("openai_api_keys").select("is_active, fail_count, success_count, last_failed_at")
    ]);

    // -------- 30-day daily series (inbound / outbound / new leads) ----------
    const dailyMap = new Map();
    for (let i = 0; i < 30; i += 1) {
      const d = new Date(start30.getTime() + i * dayMs);
      dailyMap.set(d.toISOString().slice(0, 10), {
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("en-US", { weekday: "short", day: "2-digit" }),
        inbound: 0,
        outbound: 0,
        leads: 0
      });
    }
    for (const m of msg30.data || []) {
      const key = asIsoDate(m.created_at).slice(0, 10);
      const b = dailyMap.get(key);
      if (!b) continue;
      if (m.direction === "outbound") b.outbound += 1;
      else b.inbound += 1;
    }
    for (const l of leads30.data || []) {
      const key = asIsoDate(l.created_at).slice(0, 10);
      const b = dailyMap.get(key);
      if (b) b.leads += 1;
    }
    const dailySeries = Array.from(dailyMap.values());

    // -------- Last 7-day series (back-compat for /api/admin/overview style) -
    const series7 = dailySeries.slice(-7).map((d) => ({
      label: d.label,
      messages: d.inbound + d.outbound,
      newLeads: d.leads
    }));

    // -------- WoW KPIs ------------------------------------------------------
    const startThisWeekIso = startThisWeek.toISOString();
    const endLastWeekIso = endLastWeek.toISOString();
    const startLastWeekIso = startLastWeek.toISOString();

    const leadsThisWeek = (leads30.data || []).filter((l) => l.created_at >= startThisWeekIso).length;
    const leadsLastWeek = (leads30.data || []).filter(
      (l) => l.created_at >= startLastWeekIso && l.created_at < endLastWeekIso
    ).length;
    const msgThisWeek = (msg30.data || []).filter((m) => m.created_at >= startThisWeekIso).length;
    const msgLastWeek = (msg30.data || []).filter(
      (m) => m.created_at >= startLastWeekIso && m.created_at < endLastWeekIso
    ).length;

    // -------- All-time status / intent / language ---------------------------
    const statusOrder = ["new", "contacted", "qualified", "converted", "lost"];
    const statusCounts = Object.fromEntries(statusOrder.map((s) => [s, 0]));
    const intentCounts = {};
    const languageCounts = {};
    let totalMessagesPerLead = 0;
    let leadsWithMessages = 0;
    for (const l of allLeads.data || []) {
      if (l.status && statusCounts[l.status] !== undefined) statusCounts[l.status] += 1;
      if (l.intent) intentCounts[l.intent] = (intentCounts[l.intent] || 0) + 1;
      if (l.language) languageCounts[l.language] = (languageCounts[l.language] || 0) + 1;
      if (l.message_count) {
        totalMessagesPerLead += Number(l.message_count);
        leadsWithMessages += 1;
      }
    }
    const totalLeadsAllTime = (allLeads.data || []).length;
    const qualifiedAllTime = statusCounts.qualified + statusCounts.converted;
    const convertedAllTime = statusCounts.converted;
    const conversionRate = totalLeadsAllTime ? (convertedAllTime / totalLeadsAllTime) * 100 : 0;
    const avgMsgPerLead = leadsWithMessages ? totalMessagesPerLead / leadsWithMessages : 0;

    const statusDistribution = statusOrder.map((s) => ({
      status: s,
      count: statusCounts[s],
      pct: totalLeadsAllTime ? (statusCounts[s] / totalLeadsAllTime) * 100 : 0
    }));

    const topIntents = Object.entries(intentCounts)
      .map(([intent, count]) => ({ intent, count, pct: totalLeadsAllTime ? (count / totalLeadsAllTime) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const topLanguages = Object.entries(languageCounts)
      .map(([language, count]) => ({ language, count, pct: totalLeadsAllTime ? (count / totalLeadsAllTime) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // -------- Funnel (all-time) --------------------------------------------
    const denom = Math.max(1, totalLeadsAllTime);
    const funnel = [
      { stage: "All leads", count: totalLeadsAllTime, pct: 100 },
      { stage: "Contacted", count: totalLeadsAllTime - statusCounts.new, pct: ((totalLeadsAllTime - statusCounts.new) / denom) * 100 },
      { stage: "Qualified", count: qualifiedAllTime, pct: (qualifiedAllTime / denom) * 100 },
      { stage: "Converted", count: convertedAllTime, pct: (convertedAllTime / denom) * 100 }
    ];

    // -------- Monthly revenue (last 6 months) -------------------------------
    const monthMap = new Map();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, {
        month: key,
        label: d.toLocaleDateString("en-US", { month: "short" }),
        amount_cents: 0,
        amount_euro: 0,
        payment_count: 0
      });
    }
    for (const p of payments6m.data || []) {
      const d = new Date(p.created_at);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const b = monthMap.get(key);
      if (!b) continue;
      b.amount_cents += Number(p.amount_cents || 0);
      b.payment_count += 1;
    }
    const monthlyRevenue = Array.from(monthMap.values()).map((m) => ({
      ...m,
      amount_euro: Number((m.amount_cents / 100).toFixed(2))
    }));
    const revenue6mCents = monthlyRevenue.reduce((s, m) => s + m.amount_cents, 0);

    // -------- Plan distribution (currently active subscribers) --------------
    const planLabelById = Object.fromEntries((planRows.data || []).map((p) => [p.id, p.label]));
    const planCount = {};
    for (const u of activeSubs.data || []) {
      const k = u.subscription_plan_id || "—";
      planCount[k] = (planCount[k] || 0) + 1;
    }
    const planDistribution = Object.entries(planCount)
      .map(([id, count]) => ({ id, label: planLabelById[id] || id, count }))
      .sort((a, b) => b.count - a.count);
    const activeSubscribers = (activeSubs.data || []).length;

    // -------- OpenAI key health summary -------------------------------------
    const openaiActive = (openaiKeys.data || []).filter((k) => k.is_active).length;
    const openaiFailures = (openaiKeys.data || []).reduce((s, k) => s + (Number(k.fail_count) || 0), 0);
    const openaiSuccesses = (openaiKeys.data || []).reduce((s, k) => s + (Number(k.success_count) || 0), 0);

    return res.status(200).json({
      ok: true,
      generated_at: new Date().toISOString(),
      kpis: {
        leadsThisWeek,
        leadsLastWeek,
        leadsDelta: leadsThisWeek - leadsLastWeek,
        leadsDeltaPct: leadsLastWeek > 0
          ? Math.round(((leadsThisWeek - leadsLastWeek) / leadsLastWeek) * 100)
          : leadsThisWeek > 0 ? 100 : 0,
        msgThisWeek,
        msgLastWeek,
        msgDelta: msgThisWeek - msgLastWeek,
        msgDeltaPct: msgLastWeek > 0
          ? Math.round(((msgThisWeek - msgLastWeek) / msgLastWeek) * 100)
          : msgThisWeek > 0 ? 100 : 0,
        totalLeads: totalLeadsAllTime,
        qualifiedLeads: qualifiedAllTime,
        convertedLeads: convertedAllTime,
        conversionRate: Number(conversionRate.toFixed(2)),
        avgMsgPerLead: Number(avgMsgPerLead.toFixed(1)),
        activeSubscribers,
        revenue6mEuro: Number((revenue6mCents / 100).toFixed(2))
      },
      series: series7,
      dailySeries,
      funnel,
      statusDistribution,
      topIntents,
      topLanguages,
      monthlyRevenue,
      planDistribution,
      openaiHealth: {
        active_keys: openaiActive,
        total_successes: openaiSuccesses,
        total_failures: openaiFailures
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin analytics failed: ${error.message}` });
  }
});

/**
 * Helpers (closure-scoped): plan label / monthly-equivalent EUR for a customer
 * row, computed from the live pricing_plans cache. Returns null fields when
 * pricing data is missing — admin UI shows "—" for those.
 */
function planSummaryFromMap(planMap, planId) {
  if (!planId || !planMap[planId]) return { planLabel: null, monthlyEuro: null, totalEuro: null };
  const p = planMap[planId];
  const months = Math.max(1, Math.round((p.durationDays || 30) / 30));
  return {
    planLabel: p.label,
    monthlyEuro: Number((p.amountCents / 100 / months).toFixed(2)),
    totalEuro: Number((p.amountCents / 100).toFixed(2))
  };
}

app.get("/api/admin/clients", async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [{ data, error }, planMap] = await Promise.all([
      supabaseAdmin
        .from("customer_users")
        .select(
          "id, email, first_name, last_name, phone, is_active, subscription_plan_id, subscription_ends_at, created_at, updated_at"
        )
        .order("created_at", { ascending: false }),
      getCheckoutPlans()
    ]);
    if (error) throw error;

    const clientIds = (data || []).map((c) => c.id);
    let paymentsByUser = new Map();
    let messagesThisMonthByUser = new Map();
    if (clientIds.length) {
      const { data: pays } = await supabaseAdmin
        .from("customer_payments")
        .select("customer_user_id, amount_cents, created_at")
        .in("customer_user_id", clientIds);
      for (const p of pays || []) {
        const arr = paymentsByUser.get(p.customer_user_id) || [];
        arr.push(p);
        paymentsByUser.set(p.customer_user_id, arr);
      }

      const { data: msgRowsMonth } = await supabaseAdmin
        .from("wa_messages")
        .select("customer_user_id, created_at")
        .gte("created_at", startOfMonth);
      for (const m of msgRowsMonth || []) {
        if (!m.customer_user_id) continue;
        messagesThisMonthByUser.set(
          m.customer_user_id,
          (messagesThisMonthByUser.get(m.customer_user_id) || 0) + 1
        );
      }
    }

    return res.status(200).json({
      ok: true,
      clients: (data || []).map((c) => {
        const planInfo = planSummaryFromMap(planMap, c.subscription_plan_id);
        const ends = c.subscription_ends_at;
        const subscriptionActive = Boolean(ends && new Date(ends) > new Date());
        const userPayments = paymentsByUser.get(c.id) || [];
        const lifetimeCents = userPayments.reduce((s, p) => s + Number(p.amount_cents || 0), 0);
        return {
          id: c.id,
          businessName: `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email.split("@")[0],
          ownerName: `${c.first_name || ""} ${c.last_name || ""}`.trim() || null,
          email: c.email,
          phone: c.phone || null,
          plan: c.subscription_plan_id || null,
          planLabel: planInfo.planLabel,
          monthlyEuro: planInfo.monthlyEuro,
          status: subscriptionActive ? "active" : c.is_active ? "free" : "blocked",
          renewsAt: ends ? ends.slice(0, 10) : null,
          paymentsCount: userPayments.length,
          lifetimeEuro: Number((lifetimeCents / 100).toFixed(2)),
          messagesThisMonth: messagesThisMonthByUser.get(c.id) || 0,
          createdAt: c.created_at
        };
      })
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin clients failed: ${error.message}` });
  }
});

app.get("/api/admin/clients/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [{ data, error }, planMap] = await Promise.all([
      supabaseAdmin
        .from("customer_users")
        .select(
          "id, email, first_name, last_name, phone, is_active, subscription_plan_id, subscription_ends_at, created_at, updated_at"
        )
        .eq("id", clientId)
        .maybeSingle(),
      getCheckoutPlans()
    ]);
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Client not found" });

    const [{ data: payments }, { count: messagesThisMonth }, { count: messagesTotal }, { count: leadsTotal }] =
      await Promise.all([
        supabaseAdmin
          .from("customer_payments")
          .select("id, plan_id, amount_cents, currency, period_days, created_at, subscription_end_after")
          .eq("customer_user_id", clientId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("wa_messages")
          .select("*", { count: "exact", head: true })
          .eq("customer_user_id", clientId)
          .gte("created_at", startOfMonth),
        supabaseAdmin
          .from("wa_messages")
          .select("*", { count: "exact", head: true })
          .eq("customer_user_id", clientId),
        supabaseAdmin
          .from("wa_leads")
          .select("*", { count: "exact", head: true })
          .eq("customer_user_id", clientId)
      ]);

    const planInfo = planSummaryFromMap(planMap, data.subscription_plan_id);
    const ends = data.subscription_ends_at;
    const subscriptionActive = Boolean(ends && new Date(ends) > new Date());
    const lifetimeCents = (payments || []).reduce((s, p) => s + Number(p.amount_cents || 0), 0);

    return res.status(200).json({
      ok: true,
      client: {
        id: data.id,
        businessName: `${data.first_name || ""} ${data.last_name || ""}`.trim() || data.email.split("@")[0],
        ownerName: `${data.first_name || ""} ${data.last_name || ""}`.trim() || null,
        email: data.email,
        phone: data.phone || null,
        plan: data.subscription_plan_id || null,
        planLabel: planInfo.planLabel,
        monthlyEuro: planInfo.monthlyEuro,
        status: subscriptionActive ? "active" : data.is_active ? "free" : "blocked",
        renewsAt: ends ? ends.slice(0, 10) : null,
        paymentsCount: (payments || []).length,
        lifetimeEuro: Number((lifetimeCents / 100).toFixed(2)),
        messagesThisMonth: messagesThisMonth || 0,
        messagesTotal: messagesTotal || 0,
        leadsTotal: leadsTotal || 0,
        createdAt: data.created_at,
        payments: (payments || []).map((p) => ({
          id: p.id,
          plan_id: p.plan_id,
          amount_euro: Number((Number(p.amount_cents || 0) / 100).toFixed(2)),
          currency: p.currency,
          period_days: p.period_days,
          created_at: p.created_at,
          subscription_end_after: p.subscription_end_after
        }))
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin client detail failed: ${error.message}` });
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN CALENDAR — all customer_events across every client, with optional
   filters: month (YYYY-MM), status, and a freetext search on name/phone/service.
   ───────────────────────────────────────────────────────────────────────── */

app.get("/api/admin/events", async (req, res) => {
  try {
    const month = String(req.query.month || "").trim();
    const status = String(req.query.status || "").trim();
    const search = String(req.query.search || "").trim().toLowerCase();
    const upcoming = req.query.upcoming === "1";

    let query = supabaseAdmin
      .from("customer_events")
      .select(
        `id, customer_user_id, name, datetime, end_at, service, phone, notes, source, status, created_at,
         customer_users!customer_events_customer_user_id_fkey(email, first_name, last_name)`
      )
      .order("datetime", { ascending: true });

    if (month) {
      const [y, m] = month.split("-").map(Number);
      const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
      const to   = new Date(Date.UTC(y, m, 1)).toISOString();
      query = query.gte("datetime", from).lt("datetime", to);
    } else if (upcoming) {
      const now = new Date().toISOString();
      const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
      query = query.gte("datetime", now).lte("datetime", future);
    }

    if (status && status !== "all") query = query.eq("status", status);

    const { data, error } = await query.limit(500);
    if (error) throw error;

    let events = (data || []).map((e) => {
      const cu = e.customer_users || {};
      return {
        id: e.id,
        customer_user_id: e.customer_user_id,
        customer_email: cu.email || null,
        customer_name: [cu.first_name, cu.last_name].filter(Boolean).join(" ") || cu.email || null,
        name: e.name,
        datetime: e.datetime,
        end_at: e.end_at,
        service: e.service,
        phone: e.phone,
        notes: e.notes,
        source: e.source,
        status: e.status,
        created_at: e.created_at
      };
    });

    if (search) {
      events = events.filter((e) =>
        (e.name || "").toLowerCase().includes(search) ||
        (e.phone || "").toLowerCase().includes(search) ||
        (e.service || "").toLowerCase().includes(search) ||
        (e.customer_email || "").toLowerCase().includes(search) ||
        (e.customer_name || "").toLowerCase().includes(search)
      );
    }

    return res.status(200).json({ ok: true, events });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || "Events load failed" });
  }
});

app.patch("/api/admin/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (["pending", "confirmed", "cancelled"].includes(body.status)) patch.status = body.status;
    if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000);

    const { data, error } = await supabaseAdmin
      .from("customer_events")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Event not found" });
    return res.status(200).json({ ok: true, event: data });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || "Update failed" });
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   INVOICES — every customer_payments row is an invoice. The admin can list
   them, preview the A4 document, and re-send the email. New payments email
   the invoice automatically (see stripeSync → sendInvoiceForPayment).
   ───────────────────────────────────────────────────────────────────────── */

app.get("/api/admin/email/health", async (_req, res) => {
  try {
    const present = emailConfigDiagnostics();
    if (!isEmailConfigured()) {
      return res.status(200).json({
        ok: false,
        configured: false,
        present,
        message: "SMTP no configurado. Revisa qué variable falta en 'present' (Vercel → backend → Environment Variables → Production, luego Redeploy)."
      });
    }
    const health = await verifyEmailTransport();
    return res.status(200).json({ ok: health.ok, configured: true, present, message: health.message });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || "email health failed" });
  }
});

app.get("/api/admin/invoices", async (_req, res) => {
  try {
    const [{ data: pays, error }, planMap] = await Promise.all([
      supabaseAdmin
        .from("customer_payments")
        .select(
          "id, customer_user_id, plan_id, stripe_payment_intent_id, stripe_checkout_session_id, amount_cents, currency, period_days, subscription_end_after, created_at"
        )
        .order("created_at", { ascending: false }),
      getCheckoutPlans()
    ]);
    if (error) throw error;

    const userIds = [...new Set((pays || []).map((p) => p.customer_user_id))];
    const usersById = new Map();
    if (userIds.length) {
      const { data: users } = await supabaseAdmin
        .from("customer_users")
        .select("id, email, first_name, last_name, phone, subscription_ends_at")
        .in("id", userIds);
      for (const u of users || []) usersById.set(u.id, u);
    }

    const invoices = (pays || []).map((p) => {
      const u = usersById.get(p.customer_user_id) || {};
      const months = Math.max(1, Math.round((p.period_days || 30) / 30));
      const planLabel = planMap?.[p.plan_id]?.label || p.plan_id;
      const subActive = Boolean(u.subscription_ends_at && new Date(u.subscription_ends_at) > new Date());
      return {
        id: p.id,
        number: invoiceNumberFor(p),
        customerId: p.customer_user_id,
        customerName: `${u.first_name || ""} ${u.last_name || ""}`.trim() || (u.email ? u.email.split("@")[0] : "Cliente"),
        email: u.email || "",
        phone: u.phone || "",
        subscriptionActive: subActive,
        planId: p.plan_id,
        planLabel,
        months,
        amountEuro: Number((Number(p.amount_cents || 0) / 100).toFixed(2)),
        currency: p.currency || "eur",
        createdAt: p.created_at,
        subscriptionEnd: p.subscription_end_after,
        paymentRef: p.stripe_payment_intent_id || p.stripe_checkout_session_id || ""
      };
    });

    return res.status(200).json({ ok: true, invoices, email_configured: isEmailConfigured() });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin invoices failed: ${error.message}` });
  }
});

app.get("/api/admin/invoices/:id", async (req, res) => {
  try {
    const result = await getInvoiceById(String(req.params.id || ""));
    if (!result) return res.status(404).json({ ok: false, message: "Factura no encontrada." });
    return res.status(200).json({ ok: true, invoice: result.inv, html: result.html });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Invoice load failed: ${error.message}` });
  }
});

app.post("/api/admin/invoices/:id/resend", async (req, res) => {
  try {
    if (!isEmailConfigured()) {
      return res.status(503).json({ ok: false, message: "El email no está configurado en el servidor (variables SMTP_*)." });
    }
    const result = await getInvoiceById(String(req.params.id || ""));
    if (!result) return res.status(404).json({ ok: false, message: "Factura no encontrada." });
    const to = String(req.body?.to || result.user?.email || "").trim();
    if (!to) return res.status(400).json({ ok: false, message: "El cliente no tiene email." });

    await sendEmail({
      to,
      subject: `Tu factura de Omnira · ${result.inv.number}`,
      html: result.html,
      text:
        `Factura ${result.inv.number}\nPlan: ${result.inv.planLabel} (${result.inv.periodText})\n` +
        `Total: €${(result.inv.amountCents / 100).toFixed(2)}\nSoporte: ayuda@omnira.chat`
    });
    return res.status(200).json({ ok: true, sentTo: to });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Resend failed: ${error.message}` });
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   EMAIL CLIENT — full Inbox/Sent/Drafts/Spam/Trash. IMAP for read+mutate,
   SMTP (via email.js) for send. Drafts persist in Supabase so a reload
   never loses the half-typed message.
   ───────────────────────────────────────────────────────────────────────── */

app.get("/api/admin/email/config", async (_req, res) => {
  return res.status(200).json({
    ok: true,
    smtp_configured: isEmailConfigured(),
    imap_configured: isImapConfigured(),
    smtp: emailConfigDiagnostics(),
    imap: imapConfigDiagnostics(),
  });
});

app.get("/api/admin/email/folders", async (_req, res) => {
  try {
    if (!isImapConfigured()) {
      return res.status(503).json({ ok: false, message: "IMAP no configurado (define IMAP_USER/IMAP_PASS o reusa SMTP_USER/SMTP_PASS)." });
    }
    const folders = await imapListFolders();
    return res.status(200).json({ ok: true, folders });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Folders failed" });
  }
});

app.get("/api/admin/email/messages", async (req, res) => {
  try {
    if (!isImapConfigured()) {
      return res.status(503).json({ ok: false, message: "IMAP no configurado." });
    }
    const folder = String(req.query.folder || "inbox").slice(0, 200);
    const page = Math.max(0, Number(req.query.page) || 0);
    const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 30));
    const search = String(req.query.q || "").slice(0, 300);
    const out = await imapListMessages({ folder, page, limit, search });
    return res.status(200).json({ ok: true, ...out });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "List failed" });
  }
});

app.get("/api/admin/email/messages/:uid", async (req, res) => {
  try {
    if (!isImapConfigured()) {
      return res.status(503).json({ ok: false, message: "IMAP no configurado." });
    }
    const folder = String(req.query.folder || "inbox").slice(0, 200);
    const uid = Number(req.params.uid);
    if (!uid || !Number.isFinite(uid)) {
      return res.status(400).json({ ok: false, message: "uid inválido" });
    }
    const msg = await imapFetchMessage({ folder, uid });
    if (!msg) return res.status(404).json({ ok: false, message: "Mensaje no encontrado" });
    return res.status(200).json({ ok: true, message: msg });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Fetch failed" });
  }
});

app.post("/api/admin/email/messages/:uid/flag", async (req, res) => {
  try {
    if (!isImapConfigured()) {
      return res.status(503).json({ ok: false, message: "IMAP no configurado." });
    }
    const folder = String(req.body?.folder || req.query.folder || "inbox").slice(0, 200);
    const uid = Number(req.params.uid);
    const add = Array.isArray(req.body?.add) ? req.body.add.slice(0, 5) : [];
    const remove = Array.isArray(req.body?.remove) ? req.body.remove.slice(0, 5) : [];
    if (!add.length && !remove.length) {
      return res.status(400).json({ ok: false, message: "Nada que modificar (envía add[] o remove[])." });
    }
    const r = await imapSetFlags({ folder, uid, add, remove });
    return res.status(200).json(r);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Flag failed" });
  }
});

app.post("/api/admin/email/messages/:uid/move", async (req, res) => {
  try {
    if (!isImapConfigured()) {
      return res.status(503).json({ ok: false, message: "IMAP no configurado." });
    }
    const uid = Number(req.params.uid);
    const fromFolder = String(req.body?.from || "inbox").slice(0, 200);
    const toFolder = String(req.body?.to || "").slice(0, 200);
    if (!toFolder) return res.status(400).json({ ok: false, message: "Falta el destino (to)." });
    const r = await imapMoveMessage({ uid, fromFolder, toFolder });
    return res.status(200).json(r);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Move failed" });
  }
});

app.post("/api/admin/email/send", async (req, res) => {
  try {
    if (!isEmailConfigured()) {
      return res.status(503).json({ ok: false, message: "SMTP no configurado." });
    }
    const to = String(req.body?.to || "").trim();
    if (!to) return res.status(400).json({ ok: false, message: "Falta el destinatario (to)." });
    const cc = String(req.body?.cc || "").trim() || undefined;
    const bcc = String(req.body?.bcc || "").trim() || undefined;
    const subject = String(req.body?.subject || "").trim();
    const text = String(req.body?.text || "");
    const html = req.body?.html ? String(req.body.html) : undefined;
    const replyTo = String(req.body?.replyTo || "").trim() || undefined;
    const draftId = String(req.body?.draft_id || "").trim();

    const info = await sendEmail({ to, cc, bcc, subject, text, html, replyTo });

    // Best-effort: copy the sent message into the Sent folder so it shows up
    // in the UI on next refresh. Build a minimal RFC822 ourselves rather than
    // re-encoding through nodemailer — keeps the payload predictable.
    const headers = [
      `From: ${process.env.SMTP_FROM || process.env.SMTP_USER}`,
      `To: ${to}`,
      cc ? `Cc: ${cc}` : null,
      `Subject: ${subject || "(sin asunto)"}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-Id: ${info.messageId || `<${Date.now()}@omnira.local>`}`,
      `MIME-Version: 1.0`,
      html ? `Content-Type: text/html; charset=utf-8` : `Content-Type: text/plain; charset=utf-8`,
      ``,
      html || text || "",
    ].filter(Boolean).join("\r\n");
    await imapAppendToSent(headers).catch(() => null);

    // Delete the draft if this send was tied to one.
    if (draftId) {
      await supabaseAdmin.from("email_drafts").delete().eq("id", draftId).catch(() => null);
    }

    return res.status(200).json({ ok: true, messageId: info.messageId, sentTo: to });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Send failed" });
  }
});

/* Drafts — Supabase-backed. Endpoints fail soft if the email_drafts table
   hasn't been created yet (phase11 migration). */

app.get("/api/admin/email/drafts", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("email_drafts")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      return res.status(200).json({ ok: false, drafts: [], message: `Aplica server/sql/phase11-email-drafts.sql para activar borradores (${error.message}).` });
    }
    return res.status(200).json({ ok: true, drafts: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post("/api/admin/email/drafts", async (req, res) => {
  try {
    const payload = {
      to_addr: String(req.body?.to || "").slice(0, 4000),
      cc_addr: String(req.body?.cc || "").slice(0, 4000),
      bcc_addr: String(req.body?.bcc || "").slice(0, 4000),
      subject: String(req.body?.subject || "").slice(0, 4000),
      body_text: String(req.body?.text || "").slice(0, 200000),
      body_html: String(req.body?.html || "").slice(0, 400000),
      in_reply_to: String(req.body?.in_reply_to || "").slice(0, 200) || null,
      reply_folder: String(req.body?.reply_folder || "").slice(0, 200) || null,
      updated_by: String(req.body?.updated_by || "admin").slice(0, 200),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from("email_drafts")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      return res.status(503).json({ ok: false, message: `Aplica server/sql/phase11-email-drafts.sql primero (${error.message}).` });
    }
    return res.status(201).json({ ok: true, draft: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.patch("/api/admin/email/drafts/:id", async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    if ("to" in (req.body || {})) patch.to_addr = String(req.body.to).slice(0, 4000);
    if ("cc" in (req.body || {})) patch.cc_addr = String(req.body.cc).slice(0, 4000);
    if ("bcc" in (req.body || {})) patch.bcc_addr = String(req.body.bcc).slice(0, 4000);
    if ("subject" in (req.body || {})) patch.subject = String(req.body.subject).slice(0, 4000);
    if ("text" in (req.body || {})) patch.body_text = String(req.body.text).slice(0, 200000);
    if ("html" in (req.body || {})) patch.body_html = String(req.body.html).slice(0, 400000);
    if ("updated_by" in (req.body || {})) patch.updated_by = String(req.body.updated_by).slice(0, 200);
    const { data, error } = await supabaseAdmin
      .from("email_drafts")
      .update(patch)
      .eq("id", req.params.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Draft not found" });
    return res.status(200).json({ ok: true, draft: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.delete("/api/admin/email/drafts/:id", async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from("email_drafts").delete().eq("id", req.params.id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * Bot brain: the WhatsApp agent's live system prompt + knowledge base +
 * lead-extraction prompt. metaWhatsAppWebhook reads from this row at every
 * inbound turn (with a 30 s cache that the PATCH below invalidates), so edits
 * here go live within seconds — no redeploy required.
 */
async function ensurePlatformBotConfig() {
  const { data } = await supabaseAdmin
    .from("bot_configs")
    .select("id")
    .eq("scope", "platform")
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await supabaseAdmin
    .from("bot_configs")
    .insert({ scope: "platform" })
    .select("id")
    .single();
  if (error) throw error;
  return created;
}

app.get("/api/admin/bot-config", async (_req, res) => {
  try {
    await ensurePlatformBotConfig();
    const { data, error } = await supabaseAdmin
      .from("bot_configs")
      .select("id, scope, system_prompt, knowledge_base, greeting, lead_extraction_prompt, is_active, updated_at, updated_by")
      .eq("scope", "platform")
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({ ok: true, config: data || null });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Bot config load failed: ${error.message}` });
  }
});

app.patch("/api/admin/bot-config", async (req, res) => {
  try {
    await ensurePlatformBotConfig();
    const patch = { updated_at: new Date().toISOString() };
    if (typeof req.body?.system_prompt === "string") patch.system_prompt = req.body.system_prompt.slice(0, 16000);
    if (typeof req.body?.knowledge_base === "string") patch.knowledge_base = req.body.knowledge_base.slice(0, 32000);
    if (typeof req.body?.greeting === "string") patch.greeting = req.body.greeting.slice(0, 2000);
    if (typeof req.body?.lead_extraction_prompt === "string")
      patch.lead_extraction_prompt = req.body.lead_extraction_prompt.slice(0, 8000);
    if (typeof req.body?.is_active === "boolean") patch.is_active = req.body.is_active;
    if (typeof req.body?.updated_by === "string") patch.updated_by = req.body.updated_by.slice(0, 200);
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ ok: false, message: "No editable fields supplied." });
    }
    const { data, error } = await supabaseAdmin
      .from("bot_configs")
      .update(patch)
      .eq("scope", "platform")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    invalidateBotConfigCache();
    return res.status(200).json({ ok: true, config: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Bot config update failed: ${error.message}` });
  }
});

/**
 * Pricing administration. PATCH only allows amount_cents + label + period_text +
 * is_active changes — duration_days is intentionally locked (changing it mid-flight
 * would corrupt computed subscription_end_after dates on existing payments).
 */
app.get("/api/admin/pricing", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("pricing_plans")
      .select("id, label, period_text, amount_cents, duration_days, currency, sort_order, is_active, updated_at")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return res.status(200).json({ ok: true, plans: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin pricing failed: ${error.message}` });
  }
});

app.patch("/api/admin/pricing/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const patch = {};
    if (typeof req.body?.amount_cents !== "undefined") {
      const n = Number(req.body.amount_cents);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        return res.status(400).json({ ok: false, message: "amount_cents must be a positive integer (in cents)." });
      }
      patch.amount_cents = n;
    }
    if (typeof req.body?.label === "string") patch.label = req.body.label.slice(0, 80);
    if (typeof req.body?.period_text === "string") patch.period_text = req.body.period_text.slice(0, 32);
    if (typeof req.body?.sort_order === "number") patch.sort_order = req.body.sort_order;
    if (typeof req.body?.is_active === "boolean") patch.is_active = req.body.is_active;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, message: "No editable fields supplied." });
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("pricing_plans")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Plan not found." });
    invalidatePricingCache();
    return res.status(200).json({ ok: true, plan: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Pricing update failed: ${error.message}` });
  }
});

/**
 * WhatsApp leads (Phase 1 — single-tenant: all leads belong to the Omnira admin
 * since every customer's WABA is not yet wired to its own row in `customer_users`).
 * Filters: ?status=new|contacted|qualified|converted|lost, ?search=name/email/phone substring, ?limit=50.
 */
app.get("/api/admin/leads", async (req, res) => {
  try {
    const status = String(req.query.status || "").trim().toLowerCase();
    const search = String(req.query.search || "").trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

    let q = supabaseAdmin
      .from("wa_leads")
      .select(
        "id, phone_number_id, wa_from, name, email, phone, intent, language, confidence, notes, status, message_count, first_seen_at, last_message_at, created_at"
      )
      .order("last_message_at", { ascending: false })
      .limit(limit);

    if (status && ["new", "contacted", "qualified", "converted", "lost"].includes(status)) {
      q = q.eq("status", status);
    }
    const { data, error } = await q;
    if (error) throw error;

    let leads = data || [];
    if (search) {
      leads = leads.filter((l) =>
        [l.name, l.email, l.phone, l.wa_from, l.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(search))
      );
    }

    return res.status(200).json({ ok: true, leads });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin leads failed: ${error.message}` });
  }
});

app.get("/api/admin/leads/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: lead, error } = await supabaseAdmin
      .from("wa_leads")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!lead) return res.status(404).json({ ok: false, message: "Lead not found." });

    const { data: msgs } = await supabaseAdmin
      .from("wa_messages")
      .select("id, direction, body, message_type, language, created_at")
      .eq("wa_from", lead.wa_from)
      .eq("phone_number_id", lead.phone_number_id || "")
      .order("created_at", { ascending: false })
      .limit(200);

    return res.status(200).json({
      ok: true,
      lead,
      messages: (msgs || []).slice().reverse()
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Lead detail failed: ${error.message}` });
  }
});

app.patch("/api/admin/leads/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const allowedStatus = ["new", "contacted", "qualified", "converted", "lost"];
    const patch = {};
    if (typeof req.body?.status === "string" && allowedStatus.includes(req.body.status)) {
      patch.status = req.body.status;
    }
    if (typeof req.body?.notes === "string") {
      patch.notes = req.body.notes.slice(0, 2000);
    }
    if (typeof req.body?.name === "string") patch.name = req.body.name.slice(0, 200) || null;
    if (typeof req.body?.email === "string") patch.email = req.body.email.trim().toLowerCase().slice(0, 200) || null;
    if (typeof req.body?.phone === "string") patch.phone = req.body.phone.slice(0, 40) || null;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, message: "No editable fields supplied." });
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("wa_leads")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Lead not found." });
    return res.status(200).json({ ok: true, lead: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Lead update failed: ${error.message}` });
  }
});

/**
 * Conversation list for the admin "Chats" view — collapses wa_messages into one
 * thread per (phone_number_id, wa_from), with the last body + counts + the lead
 * row (if any). Done in two queries + JS aggregation so we don't need a SQL view.
 */
app.get("/api/admin/wa-conversations", async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const { data: rows, error } = await supabaseAdmin
      .from("wa_messages")
      .select("phone_number_id, wa_from, direction, body, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;

    const byKey = new Map();
    for (const r of rows || []) {
      const key = `${r.phone_number_id || ""}|${r.wa_from}`;
      const cur = byKey.get(key);
      if (!cur) {
        byKey.set(key, {
          phone_number_id: r.phone_number_id || null,
          wa_from: r.wa_from,
          last_direction: r.direction,
          last_body: r.body || "",
          last_at: r.created_at,
          message_count: 1,
          inbound_count: r.direction === "inbound" ? 1 : 0,
          outbound_count: r.direction === "outbound" ? 1 : 0
        });
      } else {
        cur.message_count += 1;
        if (r.direction === "inbound") cur.inbound_count += 1;
        else cur.outbound_count += 1;
      }
    }

    const conversations = Array.from(byKey.values())
      .sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)))
      .slice(0, limit);

    if (conversations.length) {
      const orFilters = conversations
        .map((c) => `and(phone_number_id.eq.${c.phone_number_id || ""},wa_from.eq.${c.wa_from})`)
        .join(",");
      const { data: leads } = await supabaseAdmin
        .from("wa_leads")
        .select("phone_number_id, wa_from, id, name, email, intent, status, confidence, language")
        .or(orFilters);
      const leadIdx = new Map();
      for (const l of leads || []) {
        leadIdx.set(`${l.phone_number_id || ""}|${l.wa_from}`, l);
      }
      for (const c of conversations) {
        c.lead = leadIdx.get(`${c.phone_number_id || ""}|${c.wa_from}`) || null;
      }
    }

    return res.status(200).json({ ok: true, conversations });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `wa-conversations failed: ${error.message}` });
  }
});

app.get("/api/admin/wa-messages", async (req, res) => {
  try {
    const from = String(req.query.from || "").trim();
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    let q = supabaseAdmin
      .from("wa_messages")
      .select("id, phone_number_id, wa_from, direction, message_type, body, language, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (from) q = q.eq("wa_from", from);
    const { data, error } = await q;
    if (error) throw error;
    return res.status(200).json({ ok: true, messages: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `wa-messages failed: ${error.message}` });
  }
});

/**
 * Admin users list (was "Sessions" — we don't track live sessions yet, so this
 * exposes the actual admin_users table instead of fabricating session rows).
 */
app.get("/api/admin/sessions", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, full_name, created_at, updated_at, is_active")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    return res.status(200).json({
      ok: true,
      admins: (data || []).map((a) => ({
        id: a.id,
        email: a.email,
        fullName: a.full_name || null,
        isActive: !!a.is_active,
        createdAt: a.created_at,
        updatedAt: a.updated_at
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin users failed: ${error.message}` });
  }
});

/**
 * Admin → platform-settings (real, editable). Returns one row per known key with
 * the current effective value (DB → env fallback) and a `source` flag so the UI
 * shows where it comes from. Secrets are masked unless ?reveal=1 (and admin auth
 * is wired) — for now, secrets always come back masked.
 *
 * Also returns the canonical webhook URL the admin must paste into Meta App
 * Dashboard → WhatsApp → Configuration → Callback URL.
 */
function canonicalWebhookUrl() {
  const explicit = String(process.env.PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (explicit) return `${explicit}/api/meta/whatsapp/webhook`;
  const vercelUrl = String(process.env.VERCEL_URL || "").trim();
  if (vercelUrl) {
    const base = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return `${base.replace(/\/$/, "")}/api/meta/whatsapp/webhook`;
  }
  return "/api/meta/whatsapp/webhook";
}

app.get("/api/admin/platform-settings", async (_req, res) => {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from("platform_settings")
      .select("key, value, is_secret, description, updated_at, updated_by")
      .order("key", { ascending: true });
    if (error) throw error;

    const settings = (rows || []).map((row) => {
      const dbValue = row.value || "";
      const envValue = String(process.env[row.key] || "").trim();
      const effective = dbValue || envValue;
      const source = dbValue ? "db" : envValue ? "env" : "unset";
      return {
        key: row.key,
        description: row.description || "",
        is_secret: !!row.is_secret,
        has_value: Boolean(effective),
        source,
        value_masked: row.is_secret ? maskSecret(effective) : effective,
        updated_at: row.updated_at,
        updated_by: row.updated_by
      };
    });

    let messageTemplates = [];
    try {
      const { data: tpls } = await supabaseAdmin
        .from("whatsapp_message_templates")
        .select("id, template_name, category, status, last_synced_at")
        .order("last_synced_at", { ascending: false });
      messageTemplates = tpls || [];
    } catch {
      /* table may not exist yet */
    }

    return res.status(200).json({
      ok: true,
      settings,
      webhook_url: canonicalWebhookUrl(),
      messageTemplates
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin settings failed: ${error.message}` });
  }
});

/**
 * OpenAI fallback chain — admin-managed. The webhook tries Vercel env first
 * (process.env.OPENAI_API_KEY), then any platform_settings.OPENAI_API_KEY, then
 * each row in this table sorted by sort_order. Rotation happens on
 * 401 / 429 / 402 / 403-quota errors only; transient 5xx / timeout do NOT rotate.
 * Each row tracks success_count / fail_count / last_failed_at so admins can see
 * which keys are healthy.
 */
app.get("/api/admin/openai-keys", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("openai_api_keys")
      .select(
        "id, label, api_key, sort_order, is_active, last_used_at, last_failed_at, last_fail_reason, fail_count, success_count, created_by, created_at, updated_at"
      )
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    const keys = (data || []).map((row) => ({
      id: row.id,
      label: row.label || null,
      api_key_masked: maskSecret(row.api_key || ""),
      api_key_set: Boolean(row.api_key),
      sort_order: row.sort_order ?? 0,
      is_active: !!row.is_active,
      last_used_at: row.last_used_at,
      last_failed_at: row.last_failed_at,
      last_fail_reason: row.last_fail_reason || null,
      fail_count: row.fail_count || 0,
      success_count: row.success_count || 0,
      created_by: row.created_by || null,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    return res.status(200).json({ ok: true, keys });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `OpenAI keys load failed: ${error.message}` });
  }
});

app.post("/api/admin/openai-keys", async (req, res) => {
  try {
    const apiKey = String(req.body?.api_key || "").trim();
    if (!apiKey || apiKey.length < 16) {
      return res.status(400).json({ ok: false, message: "api_key must be at least 16 characters." });
    }
    const label = String(req.body?.label || "").trim().slice(0, 200) || null;
    const sort_order = Number(req.body?.sort_order);
    const is_active = req.body?.is_active === false ? false : true;
    const created_by = String(req.body?.created_by || "admin").slice(0, 200);

    const { data, error } = await supabaseAdmin
      .from("openai_api_keys")
      .insert({
        label,
        api_key: apiKey,
        sort_order: Number.isFinite(sort_order) ? sort_order : 0,
        is_active,
        created_by
      })
      .select("id")
      .single();
    if (error) throw error;
    return res.status(201).json({ ok: true, id: data.id });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `OpenAI key create failed: ${error.message}` });
  }
});

app.patch("/api/admin/openai-keys/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const patch = { updated_at: new Date().toISOString() };
    if (typeof req.body?.label === "string") patch.label = req.body.label.slice(0, 200) || null;
    if (typeof req.body?.api_key === "string" && req.body.api_key.trim()) {
      const k = req.body.api_key.trim();
      if (k.length < 16) {
        return res.status(400).json({ ok: false, message: "api_key must be at least 16 characters." });
      }
      patch.api_key = k;
      // Reset failure counters when admin pastes a fresh key
      patch.last_failed_at = null;
      patch.last_fail_reason = null;
    }
    if (typeof req.body?.sort_order === "number") patch.sort_order = req.body.sort_order;
    if (typeof req.body?.is_active === "boolean") patch.is_active = req.body.is_active;
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ ok: false, message: "No editable fields supplied." });
    }
    const { data, error } = await supabaseAdmin
      .from("openai_api_keys")
      .update(patch)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Key not found" });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `OpenAI key update failed: ${error.message}` });
  }
});

app.delete("/api/admin/openai-keys/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from("openai_api_keys").delete().eq("id", id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `OpenAI key delete failed: ${error.message}` });
  }
});

app.patch("/api/admin/platform-settings/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const raw = req.body?.value;
    if (raw == null) {
      return res.status(400).json({ ok: false, message: "Missing value" });
    }
    const value = String(raw);
    if (value.length > 16000) {
      return res.status(400).json({ ok: false, message: "Value too long (max 16 KB)" });
    }
    const updated_by = String(req.body?.updated_by || "admin").slice(0, 200);
    // Upsert: only allow keys that are pre-seeded (so admins can't add arbitrary rows).
    const { data: existing } = await supabaseAdmin
      .from("platform_settings")
      .select("key")
      .eq("key", key)
      .maybeSingle();
    if (!existing) {
      return res.status(404).json({ ok: false, message: `Unknown setting: ${key}` });
    }
    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .update({ value: value || null, updated_by, updated_at: new Date().toISOString() })
      .eq("key", key)
      .select("key, value, is_secret, updated_at, updated_by")
      .maybeSingle();
    if (error) throw error;
    invalidatePlatformSettingsCache();
    return res.status(200).json({
      ok: true,
      key: data.key,
      value_masked: data.is_secret ? maskSecret(data.value || "") : data.value || "",
      has_value: Boolean(data.value),
      updated_at: data.updated_at,
      updated_by: data.updated_by
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Setting update failed: ${error.message}` });
  }
});

// ---------------------------------------------------------------------------
// Rate limiting — in-process, IP-based. Protects auth endpoints against
// brute-force. Works on Vercel because warm instances are reused for rapid
// bursts; a future Redis store can replace the Map without changing callers.
// ---------------------------------------------------------------------------

const _rlStore = new Map(); // ip:route → { count, resetAt }

function getClientIp(req) {
  return (
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function rateLimit({ max, windowMs }) {
  return (req, res, next) => {
    const key = `${getClientIp(req)}:${req.path}`;
    const now = Date.now();
    const entry = _rlStore.get(key);

    if (!entry || now > entry.resetAt) {
      _rlStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        ok: false,
        message: `Demasiados intentos. Inténtalo de nuevo en ${retryAfter} segundos.`
      });
    }
    entry.count += 1;
    return next();
  };
}

// Purge expired entries every 10 minutes to prevent unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _rlStore) {
    if (now > val.resetAt) _rlStore.delete(key);
  }
}, 10 * 60 * 1000);

const loginLimit  = rateLimit({ max: 10, windowMs: 15 * 60 * 1000 }); // 10 / 15 min
const signupLimit = rateLimit({ max: 5,  windowMs: 60 * 60 * 1000 }); // 5 / hora
const resetLimit  = rateLimit({ max: 5,  windowMs: 60 * 60 * 1000 }); // 5 / hora

// ---------------------------------------------------------------------------

app.post("/api/admin/login", loginLimit, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "Email and password are required." });
    }

    const { data: admin, error } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, full_name, avatar_data_url, is_active, password_hash")
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;
    if (!admin || !admin.is_active || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ ok: false, message: "Invalid credentials." });
    }

    if (!String(admin.password_hash || "").includes(":")) {
      await supabaseAdmin
        .from("admin_users")
        .update({
          password_hash: hashPassword(password),
          updated_at: new Date().toISOString()
        })
        .eq("id", admin.id);
    }

    return res.status(200).json({
      ok: true,
      message: "Admin login successful.",
      token: signAdminToken(admin.id, admin.email),
      user: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        avatar_data_url: admin.avatar_data_url || null
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin login failed: ${error.message}` });
  }
});

app.post("/api/admin/reset/request", resetLimit, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ ok: false, message: "Email is required." });
    }

    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admin_users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (adminError) throw adminError;

    // Always return the same response to avoid email enumeration.
    if (!admin) {
      return res.status(200).json({
        ok: true,
        message: "If this email is registered, a reset code has been sent."
      });
    }

    const resetToken = generateResetToken();
    const expiresAt = getTokenExpiryIso();

    const { error: insertError } = await supabaseAdmin.from("admin_password_resets").insert({
      admin_user_id: admin.id,
      reset_token: resetToken,
      expires_at: expiresAt,
      is_used: false
    });
    if (insertError) throw insertError;

    // Send token by email — never expose it in the HTTP response.
    if (isEmailConfigured()) {
      await sendEmail({
        to: admin.email,
        subject: "Código de recuperación de contraseña — Omnira Admin",
        html: `<p>Tu código de recuperación es: <strong>${resetToken}</strong></p><p>Caduca en ${RESET_TOKEN_TTL_MINUTES} minutos.</p>`
      }).catch((e) => console.warn("[reset] email send failed:", e?.message));
    } else {
      console.warn("[reset] SMTP not configured — admin reset token was NOT emailed:", resetToken);
    }

    return res.status(200).json({
      ok: true,
      message: "If this email is registered, a reset code has been sent."
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin reset request failed: ${error.message}` });
  }
});

app.post("/api/admin/reset/confirm", resetLimit, async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = req.body?.newPassword;

    if (!token || !isValidPassword(newPassword)) {
      return res.status(400).json({
        ok: false,
        message: "Valid token and new password (min 8 chars) are required."
      });
    }

    const { data: resetRow, error: resetError } = await supabaseAdmin
      .from("admin_password_resets")
      .select("id, admin_user_id, expires_at, is_used")
      .eq("reset_token", token)
      .maybeSingle();

    if (resetError) throw resetError;
    if (!resetRow || resetRow.is_used || new Date(resetRow.expires_at) < new Date()) {
      return res.status(400).json({ ok: false, message: "Reset token is invalid or expired." });
    }

    const { error: updateAdminError } = await supabaseAdmin
      .from("admin_users")
      .update({
        password_hash: hashPassword(newPassword),
        updated_at: new Date().toISOString()
      })
      .eq("id", resetRow.admin_user_id);

    if (updateAdminError) throw updateAdminError;

    const { error: markUsedError } = await supabaseAdmin
      .from("admin_password_resets")
      .update({ is_used: true })
      .eq("id", resetRow.id);

    if (markUsedError) throw markUsedError;

    return res.status(200).json({ ok: true, message: "Admin password reset successful." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin reset confirm failed: ${error.message}` });
  }
});

app.post("/api/customer/signup", signupLimit, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const firstName = String(req.body?.first_name || "").trim() || null;
    const lastName = String(req.body?.last_name || "").trim() || null;
    const phone = String(req.body?.phone || "").trim() || null;

    if (!email || !isValidPassword(password)) {
      return res.status(400).json({
        ok: false,
        message: "Email and password (min 8 chars) are required."
      });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("customer_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      return res.status(409).json({ ok: false, message: "Customer already exists." });
    }

    const { data, error } = await supabaseAdmin
      .from("customer_users")
      .insert({
        email,
        password_hash: hashPassword(password),
        first_name: firstName,
        last_name: lastName,
        phone
      })
      .select("id, email, first_name, last_name, phone, subscription_plan_id, subscription_ends_at, stripe_subscription_id")
      .single();

    if (error) throw error;

    return res.status(201).json({
      ok: true,
      message: "Customer signup successful.",
      token: signCustomerToken(data.id, data.email),
      user: buildCustomerUserPayload(data)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer signup failed: ${error.message}` });
  }
});

app.post("/api/customer/login", loginLimit, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "Email and password are required." });
    }

    const { data: customer, error } = await supabaseAdmin
      .from("customer_users")
      .select(
        "id, email, first_name, last_name, phone, is_active, password_hash, subscription_plan_id, subscription_ends_at"
      )
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;
    if (!customer || !customer.is_active || !verifyPassword(password, customer.password_hash)) {
      return res.status(401).json({ ok: false, message: "Invalid credentials." });
    }

    if (!String(customer.password_hash || "").includes(":")) {
      await supabaseAdmin
        .from("customer_users")
        .update({
          password_hash: hashPassword(password),
          updated_at: new Date().toISOString()
        })
        .eq("id", customer.id);
    }

    return res.status(200).json({
      ok: true,
      message: "Customer login successful.",
      token: signCustomerToken(customer.id, customer.email),
      user: buildCustomerUserPayload(customer)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer login failed: ${error.message}` });
  }
});

app.post("/api/customer/reset/request", resetLimit, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ ok: false, message: "Email is required." });
    }

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customer_users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (customerError) throw customerError;

    // Always return the same response to avoid email enumeration.
    if (!customer) {
      return res.status(200).json({
        ok: true,
        message: "Si este email está registrado, recibirás un código de recuperación."
      });
    }

    const resetToken = generateResetToken();
    const expiresAt = getTokenExpiryIso();

    const { error: insertError } = await supabaseAdmin.from("customer_password_resets").insert({
      customer_user_id: customer.id,
      reset_token: resetToken,
      expires_at: expiresAt,
      is_used: false
    });
    if (insertError) throw insertError;

    // Send token by email — never expose it in the HTTP response.
    if (isEmailConfigured()) {
      await sendEmail({
        to: customer.email,
        subject: "Código de recuperación de contraseña — Omnira",
        html: `<p>Hola,</p><p>Tu código de recuperación de contraseña es:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${resetToken}</p><p>Introdúcelo en el panel de Omnira. Caduca en ${RESET_TOKEN_TTL_MINUTES} minutos.</p><p>Si no solicitaste esto, ignora este correo.</p>`
      }).catch((e) => console.warn("[reset] email send failed:", e?.message));
    } else {
      console.warn("[reset] SMTP not configured — customer reset token was NOT emailed:", resetToken);
    }

    return res.status(200).json({
      ok: true,
      message: "Si este email está registrado, recibirás un código de recuperación."
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer reset request failed: ${error.message}` });
  }
});

app.post("/api/customer/reset/confirm", resetLimit, async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = req.body?.newPassword;

    if (!token || !isValidPassword(newPassword)) {
      return res.status(400).json({
        ok: false,
        message: "Valid token and new password (min 8 chars) are required."
      });
    }

    const { data: resetRow, error: resetError } = await supabaseAdmin
      .from("customer_password_resets")
      .select("id, customer_user_id, expires_at, is_used")
      .eq("reset_token", token)
      .maybeSingle();

    if (resetError) throw resetError;
    if (!resetRow || resetRow.is_used || new Date(resetRow.expires_at) < new Date()) {
      return res.status(400).json({ ok: false, message: "Reset token is invalid or expired." });
    }

    const { error: updateCustomerError } = await supabaseAdmin
      .from("customer_users")
      .update({
        password_hash: hashPassword(newPassword),
        updated_at: new Date().toISOString()
      })
      .eq("id", resetRow.customer_user_id);

    if (updateCustomerError) throw updateCustomerError;

    const { error: markUsedError } = await supabaseAdmin
      .from("customer_password_resets")
      .update({ is_used: true })
      .eq("id", resetRow.id);

    if (markUsedError) throw markUsedError;

    return res.status(200).json({ ok: true, message: "Customer password reset successful." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer reset confirm failed: ${error.message}` });
  }
});

app.get("/health", async (_req, res) => {
  try {
    const supabaseEnvOk = isSupabaseConfigured();
    let supabaseLive = false;
    let supabaseError = "";
    if (supabaseEnvOk) {
      try {
        await testSupabaseConnection();
        supabaseLive = true;
      } catch (e) {
        supabaseError = e?.message || String(e);
      }
    } else {
      supabaseError =
        "Missing SUPABASE_URL or service key (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY). Set them in Vercel Environment Variables.";
    }

    const metaWa = await getMetaWhatsAppDeployDiagnostics();

    return res.status(200).json({
      ok: true,
      message: supabaseLive
        ? "Server is running and Supabase is connected."
        : "Server process is up; see supabase_live and supabase_error.",
      supabase_env_configured: supabaseEnvOk,
      supabase_live: supabaseLive,
      supabase_error: supabaseError || undefined,
      vercel_env: isVercelRuntime ? String(process.env.VERCEL_ENV || "").trim() || undefined : undefined,
      vercel_url: isVercelRuntime ? String(process.env.VERCEL_URL || "").trim() || undefined : undefined,
      ...metaWa,
      stripe_secret_configured: Boolean(getStripe()),
      stripe_publishable_configured: Boolean(String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim()),
      stripe_webhook_secret_configured: Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || "").trim()),
      customer_jwt_configured: Boolean(String(process.env.CUSTOMER_JWT_SECRET || "").trim()),
      runtime: isVercelRuntime ? "vercel" : "node"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

// ---------------------------------------------------------------------------
// TWILIO WHATSAPP — virtual number pool
// ---------------------------------------------------------------------------

/**
 * Inbound webhook from Twilio. Twilio sends form-urlencoded POST when an
 * end-user messages one of our WhatsApp numbers.
 * Routing: To (our Twilio number) → customer → bot config → OpenAI → reply.
 */
app.post("/api/twilio/whatsapp/webhook", express.urlencoded({ extended: false }), async (req, res) => {
  // Always respond 200 to Twilio immediately to avoid retries.
  res.set("Content-Type", "text/xml");

  const valid = await verifyTwilioSignature(req);
  if (!valid) {
    console.warn("[twilio] webhook signature invalid");
    return res.status(403).send("<Response></Response>");
  }

  const toRaw   = String(req.body?.To   || "");
  const fromRaw = String(req.body?.From || "");
  const body    = String(req.body?.Body || "").trim();
  const sid     = String(req.body?.MessageSid || "");

  // Strip whatsapp: prefix to get E.164 numbers.
  const toPhone   = toRaw.replace(/^whatsapp:/i, "").trim();
  const fromPhone = fromRaw.replace(/^whatsapp:/i, "").trim();

  if (!toPhone || !fromPhone || !body) {
    return res.send("<Response></Response>");
  }

  try {
    // Find which customer owns this Twilio number.
    const assignment = await findCustomerByTwilioNumber(toPhone);
    if (!assignment) {
      console.warn(`[twilio] no customer found for number ${toPhone}`);
      return res.send("<Response></Response>");
    }
    const customerId = assignment.customer_user_id;

    // Load customer row — need subscription status and plan for all checks below.
    const { data: customerRow } = await supabaseAdmin
      .from("customer_users")
      .select("subscription_plan_id, subscription_ends_at")
      .eq("id", customerId)
      .maybeSingle();
    const planId = customerRow?.subscription_plan_id || "monthly";

    // Check subscription is still active. If expired, send a renewal nudge and bail.
    const subActive = Boolean(
      customerRow?.subscription_ends_at && new Date(customerRow.subscription_ends_at) > new Date()
    );
    if (!subActive) {
      console.warn(`[twilio] subscription expired for customer ${customerId} — sending renewal nudge`);
      await sendTwilioWhatsAppMessage(
        toPhone,
        fromPhone,
        "Hola 👋 Tu plan de Omnira ha expirado, por eso este asistente no puede responder ahora mismo. " +
          "Renueva tu plan en https://www.omnira.chat/ para reactivar las respuestas automáticas. ¡Gracias!"
      );
      return res.send("<Response></Response>");
    }

    // Check monthly conversation limit (Plan A: OMNIRA absorbs Twilio cost).
    const limitCheck = await checkAndIncrementConversation(customerId, fromPhone, planId);
    if (!limitCheck.allowed) {
      console.warn(`[twilio] conversation limit reached for customer ${customerId} (${limitCheck.used}/${limitCheck.limit})`);
      await sendTwilioWhatsAppMessage(
        toPhone,
        fromPhone,
        "Lo sentimos, hemos alcanzado el límite de conversaciones de este mes. Inténtalo de nuevo el mes que viene o contacta con soporte."
      );
      return res.send("<Response></Response>");
    }

    // Persist inbound message.
    await supabaseAdmin.from("twilio_messages").insert({
      customer_user_id: customerId,
      twilio_number: toPhone,
      wa_from: fromPhone,
      direction: "inbound",
      body,
      twilio_sid: sid
    });

    // Load bot config + business context (same as Meta webhook — includes
    // system prompt, knowledge base, greeting, and business info).
    const [customerBot, business] = await Promise.all([
      loadCustomerBotConfig(customerId),
      loadCustomerBusiness(customerId)
    ]);
    const systemPrompt = buildCustomerSystemPrompt(customerBot, business);

    // Load recent conversation history from twilio_messages (last 20 turns).
    const { data: historyRows } = await supabaseAdmin
      .from("twilio_messages")
      .select("direction, body")
      .eq("customer_user_id", customerId)
      .eq("wa_from", fromPhone)
      .order("created_at", { ascending: false })
      .limit(20);
    const history = (historyRows || []).reverse().map(m => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: String(m.body || "")
    }));

    // Call OpenAI via the shared key pool (with automatic rotation on 401/429).
    const model = String(await getPlatformSetting("OPENAI_CHAT_MODEL", "gpt-4o-mini")).trim() || "gpt-4o-mini";
    const fallback = customerBot?.greeting?.trim() || "Hola, ¿en qué puedo ayudarte?";
    const aiData = await callOpenAiWithRetry(
      "https://api.openai.com/v1/chat/completions",
      (apiKey) => ({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...history.slice(-10),
            { role: "user", content: body }
          ],
          temperature: 0.55,
          max_tokens: 700
        })
      }),
      `twilio reply customer/${customerId}`
    );
    const aiReply = aiData?.choices?.[0]?.message?.content;
    const replyText = (typeof aiReply === "string" && aiReply.trim()) ? aiReply.trim().slice(0, 4090) : fallback;

    // Send reply via Twilio.
    const sent = await sendTwilioWhatsAppMessage(toPhone, fromPhone, replyText);

    // Persist outbound message.
    await supabaseAdmin.from("twilio_messages").insert({
      customer_user_id: customerId,
      twilio_number: toPhone,
      wa_from: fromPhone,
      direction: "outbound",
      body: replyText,
      twilio_sid: sent.sid || null,
      openai_used: true
    });

    // Lead extraction + booking detection (same pipeline as Meta webhook).
    const conversation = [
      ...history.slice(-10),
      { role: "user", content: body },
      { role: "assistant", content: replyText }
    ];
    const extracted = await extractLeadFromConversation(conversation);
    await upsertWaLead({
      phoneNumberId: toPhone,
      waFrom: fromPhone,
      extracted,
      inboundBody: body,
      customerId
    });
    if (conversationHasBookingKeywords(conversation)) {
      const booking = await extractBookingFromConversation(conversation);
      if (booking) {
        await saveBotBooking({ customerId, waFrom: fromPhone, booking });
      }
    }
  } catch (e) {
    console.error("[twilio] webhook handler error:", e?.message || e);
  }

  return res.send("<Response></Response>");
});

/** Customer: get their assigned Twilio number. */
app.get("/api/customer/twilio-number", requireCustomer, async (req, res) => {
  try {
    const number = await getCustomerNumber(req.customerId);
    return res.status(200).json({ ok: true, number });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Customer: get conversation usage for the current month. */
app.get("/api/customer/twilio-usage", requireCustomer, async (req, res) => {
  try {
    const { data: customerRow } = await supabaseAdmin
      .from("customer_users")
      .select("subscription_plan_id")
      .eq("id", req.customerId)
      .maybeSingle();
    const planId = customerRow?.subscription_plan_id || "monthly";
    const used = await getConversationUsage(req.customerId);
    const limit = PLAN_CONVERSATION_LIMITS[planId] ?? 300;
    return res.status(200).json({ ok: true, used, limit, plan: planId });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Customer: get Twilio conversation history (grouped by end-user phone). */
app.get("/api/customer/twilio-conversations", requireCustomer, async (req, res) => {
  try {
    const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 100));
    const { data: rows, error } = await supabaseAdmin
      .from("twilio_messages")
      .select("twilio_number, wa_from, direction, body, created_at")
      .eq("customer_user_id", req.customerId)
      .order("created_at", { ascending: false })
      .limit(1500);
    if (error) throw error;

    const byKey = new Map();
    for (const r of rows || []) {
      const cur = byKey.get(r.wa_from);
      if (!cur) {
        byKey.set(r.wa_from, {
          phone_number_id: r.twilio_number || null,
          wa_from: r.wa_from,
          last_direction: r.direction,
          last_body: r.body || "",
          last_at: r.created_at,
          message_count: 1,
          inbound_count: r.direction === "inbound" ? 1 : 0,
          outbound_count: r.direction === "outbound" ? 1 : 0,
          source: "twilio"
        });
      } else {
        cur.message_count += 1;
        if (r.direction === "inbound") cur.inbound_count += 1;
        else cur.outbound_count += 1;
      }
    }
    const conversations = Array.from(byKey.values())
      .sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)))
      .slice(0, limit);

    if (conversations.length) {
      const { data: leads } = await supabaseAdmin
        .from("wa_leads")
        .select("wa_from, id, name, email, intent, status, confidence, language")
        .eq("customer_user_id", req.customerId);
      const leadIdx = new Map();
      for (const l of leads || []) leadIdx.set(l.wa_from, l);
      for (const c of conversations) c.lead = leadIdx.get(c.wa_from) || null;
    }

    return res.status(200).json({ ok: true, conversations });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `twilio-conversations failed: ${error.message}` });
  }
});

/** Admin: release numbers for all customers whose subscription has expired. */
/**
 * Internal cron: release Twilio numbers from customers whose subscription has
 * expired. Protected by X-Cron-Token === CRON_SECRET (same pattern as
 * /api/internal/calendar/drain). Vercel cron calls this daily at 02:00 UTC.
 */
async function handleTwilioReleaseExpired(req, res) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  try {
    const now = new Date().toISOString();
    // Find customers whose subscription has expired AND who still have an assigned number.
    const { data: expiredCustomers } = await supabaseAdmin
      .from("twilio_number_pool")
      .select("customer_user_id")
      .eq("status", "assigned")
      .not("customer_user_id", "is", null);

    const released = [];
    for (const row of expiredCustomers || []) {
      const { data: u } = await supabaseAdmin
        .from("customer_users")
        .select("subscription_ends_at")
        .eq("id", row.customer_user_id)
        .maybeSingle();
      const expired = !u?.subscription_ends_at || new Date(u.subscription_ends_at) <= new Date();
      if (expired) {
        const r = await releaseCustomerNumber(row.customer_user_id);
        if (r.ok) released.push(row.customer_user_id);
      }
    }
    console.log(`[twilio cron] released ${released.length} expired numbers`);
    return res.status(200).json({ ok: true, released: released.length, ids: released });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
}
app.get("/api/internal/twilio/release-expired", handleTwilioReleaseExpired);
app.post("/api/internal/twilio/release-expired", handleTwilioReleaseExpired);

app.post("/api/admin/twilio/release-expired", requireAdmin, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data: expired } = await supabaseAdmin
      .from("customer_users")
      .select("id")
      .lt("subscription_ends_at", now);

    const released = [];
    for (const u of expired || []) {
      const r = await releaseCustomerNumber(u.id);
      if (r.ok) released.push(u.id);
    }
    return res.status(200).json({ ok: true, released: released.length, ids: released });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Admin: pool overview. */
app.get("/api/admin/twilio/pool", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("twilio_number_pool")
      .select("id, phone_number, friendly_name, status, customer_user_id, assigned_at, monthly_cost_cents")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const available = (data || []).filter(n => n.status === "available").length;
    const assigned  = (data || []).filter(n => n.status === "assigned").length;
    return res.status(200).json({ ok: true, numbers: data || [], stats: { available, assigned, total: (data || []).length } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Admin: add a number to the pool manually. */
app.post("/api/admin/twilio/pool", async (req, res) => {
  try {
    const phoneNumber  = String(req.body?.phone_number || "").trim();
    const twilioSid    = String(req.body?.twilio_sid   || "").trim();
    const friendlyName = String(req.body?.friendly_name || "").trim() || null;
    const costCents    = Number(req.body?.monthly_cost_cents) || 100;
    if (!phoneNumber || !twilioSid) {
      return res.status(400).json({ ok: false, message: "phone_number and twilio_sid are required." });
    }
    const { data, error } = await supabaseAdmin
      .from("twilio_number_pool")
      .insert({ phone_number: phoneNumber, twilio_sid: twilioSid, friendly_name: friendlyName, monthly_cost_cents: costCents })
      .select("id, phone_number, status")
      .single();
    if (error) throw error;
    return res.status(201).json({ ok: true, number: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Admin: manually assign / release a number. */
app.patch("/api/admin/twilio/pool/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const patch = { updated_at: new Date().toISOString() };
    if (typeof req.body?.status === "string") patch.status = req.body.status;
    if (typeof req.body?.friendly_name === "string") patch.friendly_name = req.body.friendly_name;
    const { data, error } = await supabaseAdmin
      .from("twilio_number_pool")
      .update(patch)
      .eq("id", id)
      .select("id, phone_number, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Number not found." });
    return res.status(200).json({ ok: true, number: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Admin: manually trigger number assignment for a customer. */
app.post("/api/admin/twilio/assign", async (req, res) => {
  try {
    const customerId = String(req.body?.customer_user_id || "").trim();
    if (!customerId) return res.status(400).json({ ok: false, message: "customer_user_id required." });
    const result = await assignNumberToCustomer(customerId);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/** Admin: release a customer's number back to the pool. */
app.post("/api/admin/twilio/release", async (req, res) => {
  try {
    const customerId = String(req.body?.customer_user_id || "").trim();
    if (!customerId) return res.status(400).json({ ok: false, message: "customer_user_id required." });
    const result = await releaseCustomerNumber(customerId);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, message: `Not found: ${req.method} ${req.path}` });
});

app.use((err, _req, res, _next) => {
  console.error("[omnira-api]", err);
  if (res.headersSent) return;
  res.status(500).json({
    ok: false,
    message: err?.message || "Internal server error"
  });
});

async function testSupabaseWithRetry(retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const message = await testSupabaseConnection();
      return message;
    } catch (error) {
      lastError = error;
      console.error(`Supabase check failed (attempt ${attempt}/${retries}): ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

async function startServer() {
  try {
    await ensureAuxTables();
    const message = await testSupabaseWithRetry(3);
    console.log(message);
    const server = app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });

    server.on("error", (error) => {
      console.error(`Server runtime error: ${error.message}`);
    });
  } catch (error) {
    console.error(`Startup failed: ${error.message}`);
    process.exit(1);
  }
}

if (!isVercelRuntime) {
  startServer();
}

export { app, startServer };
export default app;
