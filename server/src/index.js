import { isVercelRuntime } from "./load-env.js";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { testSupabaseConnection, isSupabaseConfigured } from "./config/supabase.js";
import { supabaseAdmin } from "./config/supabase.js";
import { signCustomerToken, requireCustomer } from "./customerJwt.js";
import { CHECKOUT_PLANS, isValidPlanId, computeNewSubscriptionEnd } from "./billing.js";
import { getStripe, applyPaidCheckoutSession, applyPaidPaymentIntent, OMNIRA_PAYMENT_INTENT_FLOW } from "./stripeSync.js";
import { handleMetaWhatsAppGet, handleMetaWhatsAppPost, getMetaWhatsAppDeployDiagnostics } from "./metaWhatsAppWebhook.js";

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

app.get("/", (_req, res) => {
  const meta = getMetaWhatsAppDeployDiagnostics();
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
    if (!isValidPlanId(planId)) {
      return res.status(400).json({ ok: false, message: "Invalid plan_id." });
    }
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ ok: false, message: "STRIPE_SECRET_KEY not configured on server." });
    }
    const plan = CHECKOUT_PLANS[planId];
    const base = publicAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: req.customerEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: "eur",
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

/** Create PaymentIntent for embedded card pay (same plans as Checkout redirect). */
app.post("/api/customer/stripe/payment-intent", requireCustomer, async (req, res) => {
  try {
    const planId = String(req.body?.plan_id || "").trim();
    if (!isValidPlanId(planId)) {
      return res.status(400).json({ ok: false, message: "Invalid plan_id." });
    }
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ ok: false, message: "STRIPE_SECRET_KEY not configured." });
    }
    const plan = CHECKOUT_PLANS[planId];
    const pi = await stripe.paymentIntents.create({
      amount: plan.amountCents,
      currency: "eur",
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
    if (!isValidPlanId(planId)) {
      return res.status(400).json({ ok: false, message: "Invalid plan_id." });
    }
    const plan = CHECKOUT_PLANS[planId];
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
      .select("id, email, first_name, last_name, phone, is_active, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    let users = (data || []).map((u) => ({
      id: u.id,
      email: u.email,
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      phone: u.phone || "",
      is_active: !!u.is_active,
      created_at: u.created_at
    }));

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

    const [{ count: customerCount, error: customerCountError }, { count: adminCount, error: adminCountError }] =
      await Promise.all([
        supabaseAdmin.from("customer_users").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("admin_users").select("*", { count: "exact", head: true })
      ]);
    if (customerCountError) throw customerCountError;
    if (adminCountError) throw adminCountError;

    const { count: monthlyResets, error: monthlyResetsError } = await supabaseAdmin
      .from("customer_password_resets")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfMonth);
    if (monthlyResetsError) throw monthlyResetsError;

    const { data: recentClients, error: recentError } = await supabaseAdmin
      .from("customer_users")
      .select("id, email, first_name, last_name, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(4);
    if (recentError) throw recentError;

    const weeklySeries = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      weeklySeries.push({
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        date: iso,
        bookings: 0
      });
    }

    return res.status(200).json({
      ok: true,
      kpis: [
        { id: "customers", label: "Customers", value: customerCount || 0, hint: "Total registered customers" },
        { id: "admins", label: "Admins", value: adminCount || 0, hint: "Total admin accounts" },
        {
          id: "password_resets_month",
          label: "Resets this month",
          value: monthlyResets || 0,
          hint: "Customer reset requests in current month"
        }
      ],
      bookingsSeries: weeklySeries,
      recentClients: (recentClients || []).map((c) => ({
        id: c.id,
        businessName: `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email.split("@")[0],
        email: c.email,
        agentStatus: c.is_active ? "live" : "paused",
        messagesThisMonth: 0,
        createdAt: c.created_at
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin overview failed: ${error.message}` });
  }
});

app.get("/api/admin/analytics", async (_req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setUTCDate(now.getUTCDate() - 6);
    startOfWeek.setUTCHours(0, 0, 0, 0);
    const startIso = startOfWeek.toISOString();

    const { data: customers, error: customersError } = await supabaseAdmin
      .from("customer_users")
      .select("created_at")
      .gte("created_at", startIso);
    if (customersError) throw customersError;

    const byDay = new Map();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startOfWeek);
      d.setUTCDate(startOfWeek.getUTCDate() + i);
      byDay.set(d.toISOString().slice(0, 10), {
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        messages: 0,
        newLeads: 0
      });
    }

    for (const row of customers || []) {
      const key = asIsoDate(row.created_at).slice(0, 10);
      if (byDay.has(key)) {
        const item = byDay.get(key);
        item.newLeads += 1;
        item.messages += 1;
      }
    }

    const series = Array.from(byDay.values());
    const totalLeads = series.reduce((sum, x) => sum + x.newLeads, 0);

    return res.status(200).json({
      ok: true,
      series,
      funnel: [
        { stage: "Email entered", count: totalLeads, pct: 100 },
        { stage: "Account created", count: totalLeads, pct: 100 },
        { stage: "Reset requested", count: 0, pct: 0 },
        { stage: "Reset confirmed", count: 0, pct: 0 }
      ]
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin analytics failed: ${error.message}` });
  }
});

app.get("/api/admin/clients", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("customer_users")
      .select("id, email, first_name, last_name, phone, is_active, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    return res.status(200).json({
      ok: true,
      clients: (data || []).map((c) => ({
        id: c.id,
        businessName: `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email.split("@")[0],
        ownerName: `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Customer",
        email: c.email,
        phone: c.phone || "",
        plan: "N/A",
        mrr: 0,
        status: c.is_active ? "active" : "paused",
        renewsAt: c.updated_at ? c.updated_at.slice(0, 10) : c.created_at.slice(0, 10),
        whatsappDisplay: c.phone || "—",
        waBusinessId: "—",
        sheetConnected: false,
        emailsEnabled: false,
        deployedSite: "—",
        agentStatus: c.is_active ? "live" : "paused",
        messagesThisMonth: 0,
        bookingsThisMonth: 0
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin clients failed: ${error.message}` });
  }
});

app.get("/api/admin/clients/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    const { data, error } = await supabaseAdmin
      .from("customer_users")
      .select("id, email, first_name, last_name, phone, is_active, created_at, updated_at")
      .eq("id", clientId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: "Client not found" });

    return res.status(200).json({
      ok: true,
      client: {
        id: data.id,
        businessName: `${data.first_name || ""} ${data.last_name || ""}`.trim() || data.email.split("@")[0],
        ownerName: `${data.first_name || ""} ${data.last_name || ""}`.trim() || "Customer",
        email: data.email,
        phone: data.phone || "",
        plan: "N/A",
        mrr: 0,
        status: data.is_active ? "active" : "paused",
        renewsAt: data.updated_at ? data.updated_at.slice(0, 10) : data.created_at.slice(0, 10),
        whatsappDisplay: data.phone || "—",
        waBusinessId: "—",
        deployedSite: "—",
        agentStatus: data.is_active ? "live" : "paused",
        messagesThisMonth: 0,
        bookingsThisMonth: 0
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin client detail failed: ${error.message}` });
  }
});

app.get("/api/admin/sessions", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, full_name, updated_at, is_active")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    return res.status(200).json({
      ok: true,
      sessions: (data || []).map((a) => ({
        id: a.id,
        user: a.email,
        client: "—",
        role: "Superadmin",
        ip: "—",
        device: "—",
        currentPage: "Admin panel",
        lastSeen: a.updated_at ? asIsoDate(a.updated_at) : "—",
        isActive: a.is_active
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin sessions failed: ${error.message}` });
  }
});

app.get("/api/admin/platform-settings", async (_req, res) => {
  try {
    let messageTemplates = [];
    try {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_message_templates")
        .select("id, template_name, category, status, last_synced_at")
        .order("last_synced_at", { ascending: false });
      if (!error) {
        messageTemplates = (data || []).map((t) => ({
          id: t.id,
          template_name: t.template_name,
          category: t.category,
          status: t.status,
          last_synced_at: t.last_synced_at
        }));
      }
    } catch {
      messageTemplates = [];
    }

    return res.status(200).json({
      ok: true,
      platformWhatsApp: {
        metaAppId: process.env.SUPABASE_PROJECT_ID || "—",
        metaAppSecret: "Configured in environment",
        systemUserToken: "Configured in environment",
        webhookUrl: `${process.env.SUPABASE_URL || ""}/functions/v1/webhook`,
        verifyToken: "Configured in environment",
        defaultPhoneNumberId: "—",
        graphVersion: "v1"
      },
      emailTemplates: [],
      messageTemplates
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: `Admin settings failed: ${error.message}` });
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

    const metaWa = getMetaWhatsAppDeployDiagnostics();

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
