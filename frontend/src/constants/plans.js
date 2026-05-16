/**
 * Subscription packages. Features, copy, and featured flags are static (design-
 * controlled). Prices come from /api/public/pricing at runtime — admins edit them
 * in /pricing on the admin panel. The fallback amounts here match server billing
 * fallbacks so checkout still works if the API briefly fails.
 */

export const OMNIRA_PLANS = [
  {
    id: 'monthly',
    name: '1 mes',
    period: '/mes',
    durationDays: 30,
    fallbackAmountCents: 4900,
    sort_order: 1,
    featured: false,
    features: [
      'Bot con IA 24/7',
      'Reservas automáticas',
      'Conexión con calendario',
      'Recordatorios automáticos',
      'Activación inmediata',
      'Soporte incluido',
    ],
    totalSuffix: 'Sin permanencia',
  },
  {
    id: 'quarterly',
    name: '3 meses',
    period: '/mes',
    durationDays: 90,
    fallbackAmountCents: 12900,
    sort_order: 2,
    featured: false,
    features: [
      'Todo del plan mensual',
      'Activación automática',
      'Reservas ilimitadas',
      'Conexión con calendario',
      'Recordatorios automáticos',
      'Soporte prioritario',
    ],
  },
  {
    id: 'semiannual',
    name: '6 meses',
    period: '/mes',
    durationDays: 180,
    fallbackAmountCents: 22900,
    sort_order: 3,
    featured: false,
    features: [
      'Todo del plan mensual',
      'Activación automática',
      'Reservas ilimitadas',
      'Conexión con calendario',
      'Recordatorios automáticos',
      'Soporte prioritario VIP',
    ],
  },
  {
    id: 'annual',
    name: '12 meses',
    period: '/mes',
    durationDays: 365,
    fallbackAmountCents: 39900,
    sort_order: 4,
    featured: true,
    features: [
      'Todo del plan mensual',
      'Activación automática',
      'Reservas ilimitadas',
      'Conexión con calendario',
      'Recordatorios automáticos',
      'Soporte prioritario VIP',
      'Consultoría mensual 1h',
    ],
  },
];

/** EUR cents per pack — used by clients/widgets that can't hit /api/public/pricing yet. */
export const PLAN_TOTAL_CENTS = Object.fromEntries(
  OMNIRA_PLANS.map((p) => [p.id, p.fallbackAmountCents])
);

/**
 * Merge a static OMNIRA_PLANS row with a live row from /api/public/pricing and
 * compute display strings (`priceNum`, `totalRow`, `savings`) so consumers can
 * keep the same shape they used before the dynamic-pricing migration. Savings
 * are computed against the live monthly price so they update when the admin
 * changes pricing.
 */
export function mergePlanDisplay(staticPlan, live) {
  const amountCents = Number(live?.amount_cents ?? staticPlan.fallbackAmountCents);
  const durationDays = Number(live?.duration_days ?? staticPlan.durationDays);
  const months = Math.max(1, Math.round(durationDays / 30));
  const perMonthCents = Math.round(amountCents / months);
  const priceNum = String(Math.round(perMonthCents / 100));
  const totalEuro = (amountCents / 100).toFixed(0);

  // Savings: only meaningful for packs ≥ 3 months; compare to N × monthly_total.
  let savings = null;
  let savingsHot = false;
  if (months > 1) {
    const monthly = OMNIRA_PLANS.find((p) => p.id === 'monthly');
    const monthlyAmount = Number(monthly?.fallbackAmountCents || 4900);
    const monthlyLive = live?.id !== 'monthly' && live ? null : null; // never override monthly here
    const baselineCents = (monthlyLive?.amount_cents ?? monthlyAmount) * months;
    const savedCents = Math.max(0, baselineCents - amountCents);
    if (savedCents > 0) {
      const savedEuro = Math.round(savedCents / 100);
      savings = staticPlan.id === 'annual' ? `🔥 Mejor valor — ahorras ${savedEuro}€` : `✦ Ahorras ${savedEuro}€`;
      savingsHot = staticPlan.id === 'annual';
    }
  }

  const totalRow =
    months === 1
      ? `Precio total: ${totalEuro}€ · ${staticPlan.totalSuffix || 'Sin permanencia'}`
      : savings
        ? `Precio total: ${totalEuro}€ · ${savings.replace(/^[^A-Za-z]+/, '')}`
        : `Precio total: ${totalEuro}€`;

  return {
    ...staticPlan,
    amount_cents: amountCents,
    duration_days: durationDays,
    period: live?.period_text || staticPlan.period || '/mes',
    name: live?.label || staticPlan.name,
    priceNum,
    totalRow,
    savings,
    savingsHot,
    sort_order: live?.sort_order ?? staticPlan.sort_order ?? 0,
  };
}

/** Default order used by the static plan picker before /api/public/pricing resolves. */
export const OMNIRA_PLANS_CHECKOUT_ORDER = [...OMNIRA_PLANS]
  .map((p) => mergePlanDisplay(p, null))
  .sort((a, b) => (a.amount_cents || 0) - (b.amount_cents || 0));

/** Nivel para bloqueo de secciones del panel (1 = básico … 4 = anual) */
export const PLAN_TIER = {
  monthly: 1,
  quarterly: 2,
  semiannual: 3,
  annual: 4,
};

export function planTier(planId) {
  return planId ? PLAN_TIER[planId] || 0 : 0;
}

/** Página del dashboard → tier mínimo requerido */
const PAGE_MIN_TIER = {
  dash: 1,
  calendar: 1,
  booking: 1,
  convs: 1,
  negocio: 1,
  bot: 1,
  stats: 2,
  factura: 2,
  knowledge: 3,
};

/**
 * Dashboard access. Every paying customer — regardless of which package
 * they bought — gets the COMPLETE dashboard with no section locks. The
 * tier tables above are kept only for legacy/admin reference.
 */
export function canAccessDashboardPage() {
  return true;
}

export const PLAN_STORAGE_KEY = 'omnira_selected_plan';
export const ONBOARDING_DONE_KEY = 'omnira_onboarding_done';
