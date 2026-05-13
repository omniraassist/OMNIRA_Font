import { isVercelRuntime } from "./load-env.js";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { testSupabaseConnection, isSupabaseConfigured } from "./config/supabase.js";
import { supabaseAdmin } from "./config/supabase.js";
import { signCustomerToken, requireCustomer } from "./customerJwt.js";
import { getCheckoutPlans, getCheckoutPlan, computeNewSubscriptionEnd, invalidatePricingCache } from "./billing.js";
import { invalidatePlatformSettingsCache, maskSecret } from "./platformSettings.js";
import { getStripe, applyPaidCheckoutSession, applyPaidPaymentIntent, OMNIRA_PAYMENT_INTENT_FLOW } from "./stripeSync.js";
import {
  handleMetaWhatsAppGet,
  handleMetaWhatsAppPost,
  getMetaWhatsAppDeployDiagnostics,
  invalidateBotConfigCache
} from "./metaWhatsAppWebhook.js";

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
    }
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      if (String(pi.metadata?.omnira_flow || "").trim() === OMNIRA_PAYMENT_INTENT_FLOW) {
        await applyPaidPaymentIntent(pi);
      }
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
    subscriptionActive
  };
}

app.get("/api/customer/me", requireCustomer, async (req, res) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from("customer_users")
      .select("id, email, first_name, last_name, phone, subscription_plan_id, subscription_ends_at")
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
    const session = await stripe.checkout.sessions.create({
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
      metadata: {
        customer_user_id: String(req.customerId),
        plan_id: planId
      },
      client_reference_id: String(req.customerId)
    });
    return res.status(200).json({ ok: true, url: session.url });
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
      .select("id, email, first_name, last_name, phone, subscription_plan_id, subscription_ends_at")
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
      .select("id, email, first_name, last_name, phone, subscription_plan_id, subscription_ends_at")
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
    const allow = String(process.env.OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE || "").trim() === "true";
    if (!allow) {
      return res.status(403).json({ ok: false, message: "Simulate disabled." });
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
      .select("id, email, first_name, last_name, phone, subscription_plan_id, subscription_ends_at")
      .maybeSingle();
    if (error || !user) {
      return res.status(500).json({ ok: false, message: error?.message || "Update failed." });
    }
    return res.status(200).json({ ok: true, user: buildCustomerUserPayload(user) });
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
    return password === value;
  }

  const [salt, originalHash] = value.split(":");
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
      .select("id, email, full_name, is_active, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Admin not found." });
    return res.status(200).json({ ok: true, admin: data });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Get admin failed: ${error.message}` });
  }
});

app.patch("/api/admin/admins/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const newName = typeof req.body?.full_name === "string" ? req.body.full_name.trim().slice(0, 200) : null;
    const newPassword = typeof req.body?.new_password === "string" ? req.body.new_password : null;
    const currentPassword = typeof req.body?.current_password === "string" ? req.body.current_password : null;

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
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ ok: false, message: "Nothing to update." });
    }

    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .update(patch)
      .eq("id", id)
      .select("id, email, full_name, is_active, updated_at")
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

/**
 * Customer-side WhatsApp credentials: each paying customer provides their own
 * Meta Cloud API setup (access token, phone_number_id, app secret, verify token,
 * WABA id). Phase-3 multi-tenant routing reads this row when the inbound webhook
 * matches their phone_number_id and dispatches to their bot_configs.customer row.
 *
 * Secrets are masked on GET. PATCH lets the customer overwrite any field.
 */
async function ensureCustomerWhatsAppConfig(customerId) {
  const { data } = await supabaseAdmin
    .from("customer_whatsapp_configs")
    .select("customer_user_id")
    .eq("customer_user_id", customerId)
    .maybeSingle();
  if (data) return data;
  const { error } = await supabaseAdmin
    .from("customer_whatsapp_configs")
    .insert({ customer_user_id: customerId });
  if (error) throw error;
  return { customer_user_id: customerId };
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
    const STRING_FIELDS = [
      "meta_access_token",
      "meta_phone_number_id",
      "meta_business_account_id",
      "meta_app_secret",
      "meta_verify_token",
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

app.get("/api/customer/notifications", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email || "");
    if (!email) return res.status(400).json({ ok: false, message: "Email query is required." });
    const { data, error } = await supabaseAdmin
      .from("user_notifications")
      .select("id, title, message, created_at, target_email")
      .eq("is_active", true)
      .or(`target_email.is.null,target_email.eq.${email}`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return res.status(200).json({ ok: true, notifications: data || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer notifications failed: ${error.message}` });
  }
});

app.get("/api/admin/overview", async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const startOfWeek = new Date(now);
    startOfWeek.setUTCDate(now.getUTCDate() - 6);
    startOfWeek.setUTCHours(0, 0, 0, 0);
    const startWeekIso = startOfWeek.toISOString();

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

    const { data: weekMessages } = await supabaseAdmin
      .from("wa_messages")
      .select("created_at")
      .gte("created_at", startWeekIso);

    const byDay = new Map();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startOfWeek);
      d.setUTCDate(startOfWeek.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      byDay.set(iso, {
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        date: iso,
        messages: 0
      });
    }
    for (const row of weekMessages || []) {
      const key = asIsoDate(row.created_at).slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) bucket.messages += 1;
    }
    const messagesSeries = Array.from(byDay.values());

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

app.post("/api/admin/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "Email and password are required." });
    }

    const { data: admin, error } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, full_name, is_active, password_hash")
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
      user: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin login failed: ${error.message}` });
  }
});

app.post("/api/admin/reset/request", async (req, res) => {
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

    if (!admin) {
      return res.status(200).json({
        ok: true,
        message: "If this email exists, reset instructions were created."
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

    return res.status(200).json({
      ok: true,
      message: "Admin reset token created.",
      reset_token: resetToken,
      expires_at: expiresAt
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin reset request failed: ${error.message}` });
  }
});

app.post("/api/admin/reset/confirm", async (req, res) => {
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

app.post("/api/customer/signup", async (req, res) => {
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
      .select("id, email, first_name, last_name, phone, subscription_plan_id, subscription_ends_at")
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

app.post("/api/customer/login", async (req, res) => {
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

app.post("/api/customer/reset/request", async (req, res) => {
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

    if (!customer) {
      return res.status(404).json({
        ok: false,
        registered: false,
        message: "No customer found with this email."
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

    return res.status(200).json({
      ok: true,
      registered: true,
      message: "Customer reset token created.",
      reset_token: resetToken,
      expires_at: expiresAt
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Customer reset request failed: ${error.message}` });
  }
});

app.post("/api/customer/reset/confirm", async (req, res) => {
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
