import { lazy, Suspense, useEffect, useState } from 'react';
import { PanelProvider, usePanel } from './context/PanelContext.jsx';
import { useReveal } from './hooks/useReveal.js';
import { usePathname } from './hooks/usePathname.js';
import { Navbar } from './components/layout/Navbar.jsx';
import { Footer } from './components/layout/Footer.jsx';
import { WhatsAppFloat } from './components/layout/WhatsAppFloat.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { PrivacyPage } from './pages/PrivacyPage.jsx';
import { TermsPage } from './pages/TermsPage.jsx';
import { PostLoginTwilioReady } from './components/panel/PostLoginTwilioReady.jsx';
import { PostLoginTwilioAssigning } from './components/panel/PostLoginTwilioAssigning.jsx';
import { Dashboard } from './components/panel/Dashboard.jsx';

const PREVIEW_MOCK = {
  stats: { messagesMonth: 47, messagesTotal: 312, leadsTotal: 28, leadsMonth: 8, bookingsMonth: 14, bookingsTotal: 89 },
  twilioNumber: { phone_number: '+34 911 000 001' },
  twilioUsage: { ok: true, used: 87, limit: 300, plan: 'monthly' },
  twilioConversations: [
    { wa_from: '34600123456', phone_number_id: '+34911000001', last_body: 'Hola, ¿tenéis hueco el martes por la tarde?', last_at: new Date(Date.now() - 3600000).toISOString(), message_count: 4, inbound_count: 2, outbound_count: 2, lead: { name: 'María García', status: 'new', intent: 'reserva' } },
    { wa_from: '34611234567', phone_number_id: '+34911000001', last_body: 'Perfecto, os veo el jueves entonces', last_at: new Date(Date.now() - 7200000).toISOString(), message_count: 6, inbound_count: 3, outbound_count: 3, lead: { name: 'Carlos López', status: 'converted', intent: 'confirmación' } },
    { wa_from: '34622345678', phone_number_id: '+34911000001', last_body: '¿Cuánto cuesta una limpieza?', last_at: new Date(Date.now() - 86400000).toISOString(), message_count: 2, inbound_count: 1, outbound_count: 1, lead: { name: null, status: 'new', intent: 'precio' } },
  ],
  upcomingBookings: [
    { id: '1', name: 'Ana Martínez', service: 'Limpieza dental', datetime: new Date(Date.now() + 86400000).toISOString(), status: 'confirmed' },
    { id: '2', name: 'Juan Rodríguez', service: 'Consulta inicial', datetime: new Date(Date.now() + 172800000).toISOString(), status: 'pending' },
    { id: '3', name: 'Laura Sánchez', service: 'Revisión', datetime: new Date(Date.now() + 259200000).toISOString(), status: 'confirmed' },
  ],
  bot: { greeting: 'Hola, soy el asistente de Clínica Demo. ¿En qué puedo ayudarte?', instructions: '', knowledgeBaseText: '' },
};

/**
 * ClientPanel pulls in pdfjs-dist (~1.2 MB), xlsx, and mammoth — together
 * they triple the landing page bundle and on low-end phones the extra
 * download + parse time was crashing the tab before React even mounted
 * (page flashes then disappears). Lazy-loading the panel keeps the
 * landing experience fast and only pays the cost when the panel actually
 * opens. The Suspense fallback is null so visitors never see a spinner
 * before the panel even tries to render.
 */
const ClientPanel = lazy(() =>
  import('./components/panel/ClientPanel.jsx').then((mod) => ({ default: mod.ClientPanel }))
);

function normalizePath(pathname) {
  const p = pathname.replace(/\/$/, '') || '/';
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  if (base && base !== '/' && p.startsWith(base)) {
    return (p.slice(base.length) || '/').replace(/\/$/, '') || '/';
  }
  return p;
}

function AppInner() {
  const pathname = usePathname();
  const path = normalizePath(pathname);

  if (path === '/privacidad') return <PrivacyPage />;
  if (path === '/terminos')   return <TermsPage />;
  if (path === '/preview-twilio') return (
    <PanelProvider>
      <TwilioPreviewFlow />
    </PanelProvider>
  );
  if (path === '/preview-dashboard') return (
    <PanelProvider>
      <DashboardPreview />
    </PanelProvider>
  );

  return <LandingShell />;
}

function DashboardPreview() {
  const { setUser, setView, setOpen } = usePanel();
  useEffect(() => {
    setUser({
      id: 'preview',
      email: 'demo@omnira.es',
      first_name: 'Demo',
      businessName: 'Clínica Demo',
      subscription_plan_id: 'monthly',
      subscription_ends_at: '2027-01-01T00:00:00Z',
      subscriptionActive: true,
    });
    setView('dashboard');
    setOpen(true);
  }, [setUser, setView, setOpen]);

  return (
    <div id="clientPanel" className="active" translate="no">
      <div className="panel-bg-glow panel-glow-1" />
      <div className="panel-bg-glow panel-glow-2" />
      <Dashboard mockData={PREVIEW_MOCK} />
    </div>
  );
}

function TwilioPreviewFlow() {
  const [stage, setStage] = useState('assigning');
  if (stage === 'assigning') return <PostLoginTwilioAssigning onDone={() => setStage('ready')} />;
  return <PostLoginTwilioReady previewMode />;
}

function LandingShell() {
  useReveal();
  const { openClientPanel } = usePanel();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('panel');
    if (p === 'login' || p === 'register') {
      const nextPanel = p === 'register' ? 'login' : p;
      const t = setTimeout(() => openClientPanel(nextPanel), 100);
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash || ''}`);
      return () => clearTimeout(t);
    }
    // Preview mode: ?preview=twilio opens the panel directly on the Twilio ready screen.
    if (params.get('preview') === 'twilio') {
      window.history.replaceState({}, '', window.location.pathname);
      const t = setTimeout(() => openClientPanel('preview-twilio'), 100);
      return () => clearTimeout(t);
    }
  }, [openClientPanel]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const sessionId = params.get('session_id');
    if (checkout === 'success' && sessionId) {
      sessionStorage.setItem('omnira_pending_checkout', sessionId);
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash || ''}`);
      const t = setTimeout(() => openClientPanel('stripe-return'), 80);
      return () => clearTimeout(t);
    }
    if (checkout === 'canceled') {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash || ''}`);
      const t = setTimeout(() => openClientPanel('stripe-canceled'), 80);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [openClientPanel]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const panelParam = params.get('panel');
    if (panelParam) return;
    if (params.get('checkout')) return;

    try {
      const raw = localStorage.getItem('omnira_session');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data?.user && data?.token) {
        const t = setTimeout(() => openClientPanel(), 50);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore invalid session */
    }
  }, [openClientPanel]);

  return (
    <>
      <Navbar />
      <LandingPage />
      <Footer />
      <WhatsAppFloat />
      <Suspense fallback={null}>
        <ClientPanel />
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <PanelProvider>
      <AppInner />
    </PanelProvider>
  );
}
