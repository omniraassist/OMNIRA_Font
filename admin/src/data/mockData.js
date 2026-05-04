/** Rich mock data for admin UI — replace with API calls later */

export const dashboardKpis = [
  { id: 'mrr', label: 'MRR', value: '€24,180', change: '+12.4%', up: true, hint: 'Recurring from active subscriptions' },
  { id: 'subs', label: 'Active subscribers', value: '186', change: '+8', up: true, hint: 'Paying bot owners' },
  { id: 'conv', label: 'WhatsApp threads (24h)', value: '3,942', change: '+18%', up: true, hint: 'Unique user conversations' },
  { id: 'book', label: 'Bookings today', value: '214', change: '−3%', up: false, hint: 'Confirmed appointments' },
];

export const analyticsSeries = [
  { label: 'Mon', bookings: 42, messages: 820, newLeads: 28 },
  { label: 'Tue', bookings: 55, messages: 910, newLeads: 31 },
  { label: 'Wed', bookings: 48, messages: 880, newLeads: 24 },
  { label: 'Thu', bookings: 61, messages: 1020, newLeads: 36 },
  { label: 'Fri', bookings: 72, messages: 1180, newLeads: 41 },
  { label: 'Sat', bookings: 38, messages: 640, newLeads: 19 },
  { label: 'Sun', bookings: 33, messages: 590, newLeads: 17 },
];

export const funnelStages = [
  { stage: 'Widget opens', count: 12840, pct: 100 },
  { stage: 'First message', count: 8420, pct: 65.6 },
  { stage: 'Qualified intent', count: 5120, pct: 39.9 },
  { stage: 'Slot proposed', count: 3980, pct: 31.0 },
  { stage: 'Booking confirmed', count: 2140, pct: 16.7 },
];

export const paidClients = [
  {
    id: 'c1',
    businessName: 'Glow Estética Madrid',
    ownerName: 'Laura Méndez',
    email: 'laura@glowestetica.es',
    plan: 'Growth',
    mrr: 149,
    status: 'active',
    renewsAt: '2026-06-12',
    whatsappDisplay: '+34 612 *** 881',
    waBusinessId: 'waba_8f2a…c91',
    sheetConnected: true,
    emailsEnabled: true,
    deployedSite: 'glowestetica.omnira.app',
    agentStatus: 'live',
    messagesThisMonth: 8420,
    bookingsThisMonth: 312,
  },
  {
    id: 'c2',
    businessName: 'Fisio Centro Valencia',
    ownerName: 'Carlos Ruiz',
    email: 'carlos@fisiocentro.es',
    plan: 'Pro',
    mrr: 79,
    status: 'active',
    renewsAt: '2026-05-28',
    whatsappDisplay: '+34 644 *** 102',
    waBusinessId: 'waba_1d9e…a04',
    sheetConnected: true,
    emailsEnabled: true,
    deployedSite: 'fisiocentro.omnira.app',
    agentStatus: 'live',
    messagesThisMonth: 5210,
    bookingsThisMonth: 198,
  },
  {
    id: 'c3',
    businessName: 'Clínica Dental Norte',
    ownerName: 'Ana Gómez',
    email: 'ana@dentalnorte.com',
    plan: 'Growth',
    mrr: 149,
    status: 'past_due',
    renewsAt: '2026-04-22',
    whatsappDisplay: '+34 677 *** 445',
    waBusinessId: 'waba_3c11…b77',
    sheetConnected: false,
    emailsEnabled: true,
    deployedSite: 'dentalnorte.omnira.app',
    agentStatus: 'paused',
    messagesThisMonth: 1200,
    bookingsThisMonth: 44,
  },
  {
    id: 'c4',
    businessName: 'Skin Lab Barcelona',
    ownerName: 'Marina Vidal',
    email: 'marina@skinlabbcn.cat',
    plan: 'Pro',
    mrr: 79,
    status: 'trialing',
    renewsAt: '2026-05-18',
    whatsappDisplay: '+34 699 *** 203',
    waBusinessId: '—',
    sheetConnected: false,
    emailsEnabled: false,
    deployedSite: '—',
    agentStatus: 'setup',
    messagesThisMonth: 0,
    bookingsThisMonth: 0,
  },
  {
    id: 'c5',
    businessName: 'Reform Pilates Sevilla',
    ownerName: 'Elena Soto',
    email: 'elena@reformpilates.es',
    plan: 'Growth',
    mrr: 149,
    status: 'active',
    renewsAt: '2026-07-01',
    whatsappDisplay: '+34 622 *** 990',
    waBusinessId: 'waba_9aa0…d12',
    sheetConnected: true,
    emailsEnabled: true,
    deployedSite: 'reformpilates.omnira.app',
    agentStatus: 'live',
    messagesThisMonth: 3890,
    bookingsThisMonth: 156,
  },
];

export const sessions = [
  { id: 's1', user: 'laura@glowestetica.es', client: 'Glow Estética Madrid', role: 'Owner', ip: '88.12.***.44', device: 'Chrome · macOS', lastSeen: '2 min ago', currentPage: 'WhatsApp · Numbers' },
  { id: 's2', user: 'carlos@fisiocentro.es', client: 'Fisio Centro Valencia', role: 'Owner', ip: '81.45.***.12', device: 'Safari · iOS', lastSeen: '14 min ago', currentPage: 'Bookings' },
  { id: 's3', user: 'admin@omnira.app', client: '—', role: 'Superadmin', ip: '10.0.***.2', device: 'Firefox · Windows', lastSeen: 'Now', currentPage: 'Analytics' },
  { id: 's4', user: 'recepcion@glowestetica.es', client: 'Glow Estética Madrid', role: 'Staff', ip: '88.12.***.90', device: 'Chrome · Windows', lastSeen: '1 h ago', currentPage: 'Dashboard' },
  { id: 's5', user: 'marina@skinlabbcn.cat', client: 'Skin Lab Barcelona', role: 'Owner', ip: '79.116.***.3', device: 'Edge · Windows', lastSeen: '3 h ago', currentPage: 'Onboarding · WhatsApp' },
  { id: 's6', user: 'ana@dentalnorte.com', client: 'Clínica Dental Norte', role: 'Owner', ip: '83.56.***.1', device: 'Chrome · Android', lastSeen: '6 h ago', currentPage: 'Billing' },
];

export const platformWhatsApp = {
  metaAppId: '••••••••4821',
  metaAppSecret: '••••••••••••••••••••',
  systemUserToken: 'EAAG…(rotated every 60 days)',
  webhookUrl: 'https://api.omnira.app/v1/whatsapp/webhook',
  verifyToken: 'omn_verify_********',
  defaultPhoneNumberId: '105928******',
  graphVersion: 'v21.0',
};

export const emailTemplates = [
  { id: 't1', name: 'Booking confirmed — end customer', trigger: 'After WA confirmation', lastEdited: '2026-04-28' },
  { id: 't2', name: 'Booking confirmed — business owner', trigger: 'Same + CC owner', lastEdited: '2026-04-28' },
  { id: 't3', name: 'Payment failed — dunning', trigger: 'Stripe invoice.failed', lastEdited: '2026-03-10' },
];

export function getClientById(id) {
  return paidClients.find((c) => c.id === id) ?? null;
}

export const defaultBotContext = `You are the official WhatsApp assistant for the business. Tone: warm, professional, concise Spanish.

Services: facials, massage, body treatments. Never invent prices — use the price list in context.

Booking rules:
- Offer 2–3 time slots near the user's preference.
- Confirm name, service, and phone before finalizing.
- After confirmation, write one row to the connected Google Sheet and trigger confirmation emails.

If the user asks for medical advice, politely decline and suggest speaking to a professional in-clinic.`;
