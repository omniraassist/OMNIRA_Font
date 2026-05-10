/** Stripe Checkout: one-time payment per Omnira pack (EUR). */

export const CHECKOUT_PLANS = {
  monthly: { amountCents: 4900, durationDays: 30, label: "1 mes" },
  quarterly: { amountCents: 12900, durationDays: 90, label: "3 meses" },
  semiannual: { amountCents: 22900, durationDays: 180, label: "6 meses" },
  annual: { amountCents: 39900, durationDays: 365, label: "12 meses" }
};

export function isValidPlanId(id) {
  return Boolean(id && CHECKOUT_PLANS[id]);
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
