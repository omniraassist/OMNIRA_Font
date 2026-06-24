import Stripe from "stripe";
import { supabaseAdmin } from "./config/supabase.js";
import { getCheckoutPlan, computeNewSubscriptionEnd } from "./billing.js";
import { sendInvoiceForPayment } from "./invoice.js";
import { assignNumberToCustomer } from "./twilio.js";

/**
 * Drop a "purchase confirmed" notification into user_notifications targeting
 * this customer's email. created_by is set to a deterministic system key so
 * we don't insert duplicates if Stripe re-delivers the same webhook.
 */
async function insertPurchaseNotification({ customerId, planLabel, newEnd, dedupKey }) {
  if (!customerId || !dedupKey) return;
  try {
    const { data: u } = await supabaseAdmin
      .from("customer_users")
      .select("email")
      .eq("id", customerId)
      .maybeSingle();
    if (!u?.email) return;
    const { data: existing } = await supabaseAdmin
      .from("user_notifications")
      .select("id")
      .eq("created_by", dedupKey)
      .maybeSingle();
    if (existing) return;
    const dateStr = newEnd ? new Date(newEnd).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "";
    await supabaseAdmin.from("user_notifications").insert({
      target_email: u.email,
      title: "✅ ¡Compra exitosa! Tu plan está activo",
      message:
        `Gracias por elegir Omnira. Tu plan${planLabel ? ` "${planLabel}"` : ""} está activo` +
        (dateStr ? ` hasta el ${dateStr}.` : ".") +
        " Tu número de WhatsApp se está asignando automáticamente — entra al dashboard para configurar tu bot.",
      created_by: dedupKey
    });
  } catch (e) {
    // Notifications are best-effort — never let them block the subscription grant.
    console.warn("[stripeSync] insertPurchaseNotification failed:", e?.message || e);
  }
}

export function getStripe() {
  const k = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!k) return null;
  return new Stripe(k);
}

/**
 * Idempotent: applies paid Checkout session to customer_users + customer_payments.
 */
export async function applyPaidCheckoutSession(session) {
  if (!session || session.payment_status !== "paid") {
    return { ok: false, reason: "not_paid" };
  }
  const userId = String(session.metadata?.customer_user_id || "").trim();
  const planId = String(session.metadata?.plan_id || "").trim();
  if (!userId) {
    return { ok: false, reason: "bad_metadata" };
  }
  const plan = await getCheckoutPlan(planId);
  if (!plan) {
    return { ok: false, reason: "bad_metadata" };
  }

  // Verify amount matches to prevent price-bypass attacks.
  if (
    Number(session.amount_total) !== plan.amountCents ||
    String(session.currency || "").toLowerCase() !== "eur"
  ) {
    console.error(`[stripeSync] checkout amount mismatch: expected ${plan.amountCents} EUR, got ${session.amount_total} ${session.currency}`);
    return { ok: false, reason: "amount_mismatch" };
  }

  const sessionId = session.id;

  const { data: dup } = await supabaseAdmin
    .from("customer_payments")
    .select("id")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (dup) {
    return { ok: true, duplicate: true };
  }

  const { data: row, error: uerr } = await supabaseAdmin
    .from("customer_users")
    .select("subscription_ends_at")
    .eq("id", userId)
    .maybeSingle();
  if (uerr || !row) {
    return { ok: false, reason: "user_not_found" };
  }

  const newEnd = computeNewSubscriptionEnd(row.subscription_ends_at, plan.durationDays);
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id || null;

  const { error: upErr } = await supabaseAdmin
    .from("customer_users")
    .update({
      subscription_plan_id: planId,
      subscription_ends_at: newEnd,
      ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);
  if (upErr) {
    return { ok: false, reason: upErr.message };
  }

  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  const { error: payErr } = await supabaseAdmin.from("customer_payments").insert({
    customer_user_id: userId,
    plan_id: planId,
    stripe_checkout_session_id: sessionId,
    stripe_payment_intent_id: pi,
    amount_cents: plan.amountCents,
    currency: "eur",
    period_days: plan.durationDays,
    subscription_end_after: newEnd
  });
  if (payErr) {
    return { ok: false, reason: payErr.message };
  }

  await insertPurchaseNotification({
    customerId: userId,
    planLabel: plan.label,
    newEnd,
    dedupKey: `system:purchase:checkout:${sessionId}`
  });

  await sendInvoiceForPayment({
    customerId: userId,
    plan,
    amountCents: plan.amountCents,
    currency: "eur",
    periodDays: plan.durationDays,
    paymentRef: pi || sessionId,
    createdAt: new Date().toISOString(),
    subscriptionEnd: newEnd
  });

  // Auto-assign a Twilio virtual number + create bot config (best-effort).
  try {
    const assigned = await assignNumberToCustomer(userId);
    if (!assigned.ok && assigned.reason !== "no_numbers_available") {
      console.warn("[stripeSync] twilio assign failed:", assigned.reason);
    }
  } catch (e) {
    console.warn("[stripeSync] twilio assign error:", e?.message || e);
  }
  try {
    const { data: existingCfg } = await supabaseAdmin
      .from("bot_configs").select("id").eq("scope", "customer").eq("customer_user_id", userId).maybeSingle();
    if (!existingCfg) {
      await supabaseAdmin.from("bot_configs").insert({ scope: "customer", customer_user_id: userId });
    }
  } catch (e) {
    console.warn("[stripeSync] bot_config create error:", e?.message || e);
  }

  return { ok: true, planId, subscription_ends_at: newEnd };
}

/** Metadata on PaymentIntents created from the customer panel (embedded Elements). */
export const OMNIRA_PAYMENT_INTENT_FLOW = "panel_embedded";

/**
 * Idempotent: applies succeeded PaymentIntent (panel embedded card flow) to customer_users + customer_payments.
 */
export async function applyPaidPaymentIntent(pi) {
  if (!pi || pi.status !== "succeeded") {
    return { ok: false, reason: "not_succeeded" };
  }
  if (String(pi.metadata?.omnira_flow || "").trim() !== OMNIRA_PAYMENT_INTENT_FLOW) {
    return { ok: false, reason: "not_omnira_intent" };
  }
  const userId = String(pi.metadata?.customer_user_id || "").trim();
  const planId = String(pi.metadata?.plan_id || "").trim();
  if (!userId) {
    return { ok: false, reason: "bad_metadata" };
  }
  const plan = await getCheckoutPlan(planId);
  if (!plan) {
    return { ok: false, reason: "bad_metadata" };
  }
  if (Number(pi.amount) !== plan.amountCents || String(pi.currency || "").toLowerCase() !== "eur") {
    return { ok: false, reason: "amount_mismatch" };
  }

  const piId = pi.id;
  const { data: dup } = await supabaseAdmin
    .from("customer_payments")
    .select("id")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle();
  if (dup) {
    return { ok: true, duplicate: true };
  }

  const { data: row, error: uerr } = await supabaseAdmin
    .from("customer_users")
    .select("subscription_ends_at")
    .eq("id", userId)
    .maybeSingle();
  if (uerr || !row) {
    return { ok: false, reason: "user_not_found" };
  }

  const newEnd = computeNewSubscriptionEnd(row.subscription_ends_at, plan.durationDays);
  const stripeCustomerId =
    typeof pi.customer === "string" ? pi.customer : pi.customer?.id || null;

  const { error: upErr } = await supabaseAdmin
    .from("customer_users")
    .update({
      subscription_plan_id: planId,
      subscription_ends_at: newEnd,
      ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);
  if (upErr) {
    return { ok: false, reason: upErr.message };
  }

  const { error: payErr } = await supabaseAdmin.from("customer_payments").insert({
    customer_user_id: userId,
    plan_id: planId,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: piId,
    amount_cents: plan.amountCents,
    currency: "eur",
    period_days: plan.durationDays,
    subscription_end_after: newEnd
  });
  if (payErr) {
    return { ok: false, reason: payErr.message };
  }

  await insertPurchaseNotification({
    customerId: userId,
    planLabel: plan.label,
    newEnd,
    dedupKey: `system:purchase:pi:${piId}`
  });

  await sendInvoiceForPayment({
    customerId: userId,
    plan,
    amountCents: plan.amountCents,
    currency: "eur",
    periodDays: plan.durationDays,
    paymentRef: piId,
    createdAt: new Date().toISOString(),
    subscriptionEnd: newEnd
  });

  // Auto-assign a Twilio virtual number + create bot config (best-effort).
  try {
    const assigned = await assignNumberToCustomer(userId);
    if (!assigned.ok && assigned.reason !== "no_numbers_available") {
      console.warn("[stripeSync] twilio assign failed:", assigned.reason);
    }
  } catch (e) {
    console.warn("[stripeSync] twilio assign error:", e?.message || e);
  }
  try {
    const { data: existingCfg } = await supabaseAdmin
      .from("bot_configs").select("id").eq("scope", "customer").eq("customer_user_id", userId).maybeSingle();
    if (!existingCfg) {
      await supabaseAdmin.from("bot_configs").insert({ scope: "customer", customer_user_id: userId });
    }
  } catch (e) {
    console.warn("[stripeSync] bot_config create error:", e?.message || e);
  }

  return { ok: true, planId, subscription_ends_at: newEnd };
}

/**
 * Called on invoice.payment_succeeded for a subscription invoice.
 * Handles both initial payment (billing_reason=subscription_create) and renewals.
 */
export async function applySubscriptionInvoicePaid(invoice) {
  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id || null;
  if (!subscriptionId) return { ok: false, reason: "no_subscription_id" };

  const stripe = getStripe();
  if (!stripe) return { ok: false, reason: "no_stripe" };

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = String(sub.metadata?.customer_user_id || "").trim();
  const planId = String(sub.metadata?.plan_id || "").trim();

  let customerId = userId;
  if (!customerId) {
    const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (stripeCustomerId) {
      const { data: cu } = await supabaseAdmin
        .from("customer_users").select("id").eq("stripe_customer_id", stripeCustomerId).maybeSingle();
      customerId = cu?.id || "";
    }
  }
  if (!customerId) return { ok: false, reason: "customer_not_found" };

  const newEnd = new Date(sub.current_period_end * 1000).toISOString();
  const invoiceId = invoice.id;
  const piId = typeof invoice.payment_intent === "string"
    ? invoice.payment_intent
    : invoice.payment_intent?.id || null;

  const dedupKey = piId || invoiceId;
  const { data: dup } = await supabaseAdmin
    .from("customer_payments").select("id")
    .eq("stripe_payment_intent_id", dedupKey).maybeSingle();
  if (dup) return { ok: true, duplicate: true };

  const { error: upErr } = await supabaseAdmin
    .from("customer_users")
    .update({
      ...(planId ? { subscription_plan_id: planId } : {}),
      subscription_ends_at: newEnd,
      stripe_subscription_id: subscriptionId,
      updated_at: new Date().toISOString()
    })
    .eq("id", customerId);
  if (upErr) return { ok: false, reason: upErr.message };

  await supabaseAdmin.from("customer_payments").insert({
    customer_user_id: customerId,
    plan_id: planId || null,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: piId,
    amount_cents: invoice.amount_paid || 0,
    currency: String(invoice.currency || "eur").toLowerCase(),
    period_days: null,
    subscription_end_after: newEnd
  });

  if (invoice.billing_reason === "subscription_cycle") {
    await insertPurchaseNotification({
      customerId,
      planLabel: planId || null,
      newEnd,
      dedupKey: `system:renewal:inv:${invoiceId}`
    });
  }

  return { ok: true, subscription_ends_at: newEnd };
}

/**
 * Called on customer.subscription.deleted — clears stripe_subscription_id but
 * leaves subscription_ends_at so the customer keeps access until period end.
 */
export async function applySubscriptionDeleted(subscription) {
  const subscriptionId = subscription.id;
  if (!subscriptionId) return { ok: false, reason: "no_id" };

  const userId = String(subscription.metadata?.customer_user_id || "").trim();
  let customerId = userId;
  if (!customerId) {
    const stripeCustomerId = typeof subscription.customer === "string"
      ? subscription.customer : subscription.customer?.id;
    if (stripeCustomerId) {
      const { data: cu } = await supabaseAdmin
        .from("customer_users").select("id").eq("stripe_customer_id", stripeCustomerId).maybeSingle();
      customerId = cu?.id || "";
    }
  }
  if (!customerId) return { ok: false, reason: "customer_not_found" };

  await supabaseAdmin
    .from("customer_users")
    .update({ stripe_subscription_id: null, updated_at: new Date().toISOString() })
    .eq("id", customerId)
    .eq("stripe_subscription_id", subscriptionId);

  return { ok: true };
}
