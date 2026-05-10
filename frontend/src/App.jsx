import { useEffect } from 'react';
import { PanelProvider, usePanel } from './context/PanelContext.jsx';
import { useReveal } from './hooks/useReveal.js';
import { Navbar } from './components/layout/Navbar.jsx';
import { Footer } from './components/layout/Footer.jsx';
import { WhatsAppFloat } from './components/layout/WhatsAppFloat.jsx';
import { ClientPanel } from './components/panel/ClientPanel.jsx';
import { LandingPage } from './pages/LandingPage.jsx';

function AppInner() {
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
      <ClientPanel />
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
