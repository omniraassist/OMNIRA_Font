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
