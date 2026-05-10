import { useEffect } from 'react';
import { usePanel } from '../../context/PanelContext.jsx';
import { AuthForgot } from './AuthForgot.jsx';
import { AuthLogin } from './AuthLogin.jsx';
import { AuthRegister } from './AuthRegister.jsx';
import { Dashboard } from './Dashboard.jsx';
import { PostLoginPaymentStep } from './PostLoginPaymentStep.jsx';
import { PostLoginPlanHome } from './PostLoginPlanHome.jsx';
import { PostLoginWhatsAppSetup } from './PostLoginWhatsAppSetup.jsx';

export function ClientPanel() {
  const { open, view, setView, user } = usePanel();

  useEffect(() => {
    if (open && view === 'whatsAppSetup' && user && user.subscriptionActive === false) {
      setView('paymentStep');
    }
  }, [open, view, user, setView]);

  if (!open) return null;

  return (
    <div id="clientPanel" className="active" translate="no">
      <div className="panel-bg-glow panel-glow-1" />
      <div className="panel-bg-glow panel-glow-2" />
      {view === 'login' && <AuthLogin />}
      {view === 'register' && <AuthRegister />}
      {view === 'forgot' && <AuthForgot />}
      {view === 'planHome' && <PostLoginPlanHome />}
      {view === 'paymentStep' && <PostLoginPaymentStep />}
      {view === 'whatsAppSetup' && <PostLoginWhatsAppSetup />}
      {view === 'dashboard' && <Dashboard />}
    </div>
  );
}
