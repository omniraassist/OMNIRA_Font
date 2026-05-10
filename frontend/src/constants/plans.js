/** Subscription packages — post-login selection & landing alignment */

export const OMNIRA_PLANS = [
  {
    id: 'monthly',
    name: '1 mes',
    priceNum: '49',
    period: '/mes',
    totalRow: 'Precio total: 49€ · Sin permanencia',
    savings: null,
    featured: false,
    features: [
      'Bot con IA 24/7',
      'Reservas automáticas',
      'Conexión con calendario',
      'Recordatorios automáticos',
      'Activación inmediata',
      'Soporte incluido',
    ],
  },
  {
    id: 'quarterly',
    name: '3 meses',
    priceNum: '43',
    period: '/mes',
    totalRow: 'Precio total: 129€ · Ahorras 18€',
    savings: '✦ Ahorras 18€',
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
    priceNum: '38',
    period: '/mes',
    totalRow: 'Precio total: 229€ · Ahorras 65€',
    savings: '✦ Ahorras 65€',
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
    priceNum: '33',
    period: '/mes',
    totalRow: 'Precio total: 399€ · Ahorras 189€',
    savings: '🔥 Mejor valor — ahorras 189€',
    savingsHot: true,
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

/** Total prepago en céntimos (alineado con server/billing.js) */
export const PLAN_TOTAL_CENTS = {
  monthly: 4900,
  quarterly: 12900,
  semiannual: 22900,
  annual: 39900,
};

/** Barato → caro para el flujo de selección */
export const OMNIRA_PLANS_CHECKOUT_ORDER = [...OMNIRA_PLANS].sort(
  (a, b) => (PLAN_TOTAL_CENTS[a.id] || 0) - (PLAN_TOTAL_CENTS[b.id] || 0)
);

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

export function canAccessDashboardPage(planId, page) {
  const need = PAGE_MIN_TIER[page] ?? 1;
  if (!planId) return need <= 1;
  return planTier(planId) >= need;
}

export const PLAN_STORAGE_KEY = 'omnira_selected_plan';
export const ONBOARDING_DONE_KEY = 'omnira_onboarding_done';
