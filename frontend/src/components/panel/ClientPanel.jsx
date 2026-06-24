import { useEffect } from 'react';
import { usePanel } from '../../context/PanelContext.jsx';
import { AuthForgot } from './AuthForgot.jsx';
import { AuthLogin } from './AuthLogin.jsx';
import { AuthRegister } from './AuthRegister.jsx';
import { Dashboard } from './Dashboard.jsx';
import { OnboardingWizard } from './OnboardingWizard.jsx';
import { PostLoginPaymentStep } from './PostLoginPaymentStep.jsx';
import { PostLoginPlanHome } from './PostLoginPlanHome.jsx';

export function ClientPanel() {
  const { open, view, setView, user } = usePanel();

  // Safety net: if somehow the dashboard is reached without a paid subscription,
  // redirect to planHome so the user can purchase a plan.
  useEffect(() => {
    if (view === 'dashboard' && user !== null && !user?.subscriptionActive) {
      setView('planHome');
    }
  }, [view, user, setView]);

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
      {view === 'onboarding' && <OnboardingWizard onDone={() => setView('dashboard')} />}
      {view === 'dashboard' && <Dashboard />}
    </div>
  );
}
