/** Stripe Checkout: one-time payment per Omnira pack (EUR).
 *
 * Prices live in the `pricing_plans` Supabase table — admins edit them via
 * /api/admin/pricing and Stripe reads the live row at checkout time. We keep a
 * small in-process cache so high-traffic endpoints don't hit Supabase per call;
 * cache invalidates on PATCH and after PRICING_CACHE_TTL_MS.
 */
import { supabaseAdmin, isSupabaseConfigured } from "./config/supabase.js";

const PRICING_CACHE_TTL_MS = 30_000;

let _cache = null;
let _cacheAt = 0;

export function invalidatePricingCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Returns an object keyed by plan id, same shape callers used to import as
 * CHECKOUT_PLANS: { [id]: { amountCents, durationDays, label, periodText, currency } }.
 * Falls back to the seed values if Supabase is unconfigured (so local dev never
 * 503s when pricing_plans is empty — Phase-1 customers still flow through).
 */
const FALLBACK_PLANS = {
  monthly:    { amountCents: 4900,  durationDays: 30,  label: "1 mes",   periodText: "/mes", currency: "eur" },
  quarterly:  { amountCents: 12900, durationDays: 90,  label: "3 meses", periodText: "/mes", currency: "eur" },
  semiannual: { amountCents: 22900, durationDays: 180, label: "6 meses", periodText: "/mes", currency: "eur" },
  annual:     { amountCents: 39900, durationDays: 365, label: "12 meses", periodText: "/mes", currency: "eur" }
};

export async function getCheckoutPlans() {
  if (_cache && Date.now() - _cacheAt < PRICING_CACHE_TTL_MS) return _cache;
  if (!isSupabaseConfigured()) {
    _cache = { ...FALLBACK_PLANS };
    _cacheAt = Date.now();
    return _cache;
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("pricing_plans")
      .select("id, label, period_text, amount_cents, duration_days, currency, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      _cache = { ...FALLBACK_PLANS };
      _cacheAt = Date.now();
      return _cache;
    }
    const map = {};
    for (const row of data) {
      map[row.id] = {
        amountCents: Number(row.amount_cents),
        durationDays: Number(row.duration_days),
        label: String(row.label),
        periodText: String(row.period_text || ""),
        currency: String(row.currency || "eur"),
        sortOrder: Number(row.sort_order || 0)
      };
    }
    _cache = map;
    _cacheAt = Date.now();
    return map;
  } catch (e) {
    console.warn("[billing] getCheckoutPlans fell back to defaults:", e?.message || e);
    return FALLBACK_PLANS;
  }
}

export async function getCheckoutPlan(id) {
  if (!id) return null;
  const plans = await getCheckoutPlans();
  return plans[id] || null;
}

export async function isValidPlanId(id) {
  if (!id) return false;
  const plans = await getCheckoutPlans();
  return Object.prototype.hasOwnProperty.call(plans, id);
}

export function computeNewSubscriptionEnd(currentEndsAtIso, durationDays) {
  const now = Date.now();
  let baseMs = now;
  if (currentEndsAtIso) {
    const cur = new Date(currentEndsAtIso).getTime();
    if (!Number.isNaN(cur) && cur > now) baseMs = cur;
  }
  return new Date(baseMs + Number(durationDays) * 86400000).toISOString();
}
