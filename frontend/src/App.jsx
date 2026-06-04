import { lazy, Suspense, useEffect } from 'react';
import { PanelProvider, usePanel } from './context/PanelContext.jsx';
import { useReveal } from './hooks/useReveal.js';
import { usePathname } from './hooks/usePathname.js';
import { Navbar } from './components/layout/Navbar.jsx';
import { Footer } from './components/layout/Footer.jsx';
import { WhatsAppFloat } from './components/layout/WhatsAppFloat.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { PrivacyPage } from './pages/PrivacyPage.jsx';
import { TermsPage } from './pages/TermsPage.jsx';

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

  if (path === '/privacidad') {
    return <PrivacyPage />;
  }
  if (path === '/terminos') {
    return <TermsPage />;
  }

  return <LandingShell />;
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
