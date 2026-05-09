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
    totalRow: 'Precio total: 229€ · Ahorras 65€ · Equiv. a 294€ en 1 mes × 6',
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

export const PLAN_STORAGE_KEY = 'omnira_selected_plan';
export const ONBOARDING_DONE_KEY = 'omnira_onboarding_done';
