import Stripe from "stripe";
import { supabaseAdmin } from "./config/supabase.js";
import { CHECKOUT_PLANS, computeNewSubscriptionEnd, isValidPlanId } from "./billing.js";

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
  if (!userId || !isValidPlanId(planId)) {
    return { ok: false, reason: "bad_metadata" };
  }
  const plan = CHECKOUT_PLANS[planId];
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
  if (!userId || !isValidPlanId(planId)) {
    return { ok: false, reason: "bad_metadata" };
  }
  const plan = CHECKOUT_PLANS[planId];
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

  return { ok: true, planId, subscription_ends_at: newEnd };
}
