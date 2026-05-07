/** Subscription packages — post-login selection & landing alignment */

export const OMNIRA_PLANS = [
  {
    id: 'monthly',
    name: 'Mensual',
    priceNum: '129',
    period: '/mes',
    totalRow: 'Sin permanencia',
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
    name: '3 Meses',
    priceNum: '109',
    period: '/mes',
    totalRow: 'Total: 327€ · En lugar de 387€',
    savings: '✦ Ahorras 60€',
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
    name: '6 Meses',
    priceNum: '99',
    period: '/mes',
    totalRow: 'Total: 594€ · En lugar de 774€',
    savings: '✦ Mejor precio/mes',
    featured: true,
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
    name: 'Anual',
    priceNum: '79',
    period: '/mes',
    totalRow: 'Total: 948€ · En lugar de 1.548€',
    savings: '🔥 Máximo ahorro — 600€',
    savingsHot: true,
    featured: false,
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

export const PLAN_STORAGE_KEY = 'omnira_selected_plan';
export const ONBOARDING_DONE_KEY = 'omnira_onboarding_done';
