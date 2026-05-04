import { usePanel } from '../../context/PanelContext.jsx';
import { AuthForgot } from './AuthForgot.jsx';
import { AuthLogin } from './AuthLogin.jsx';
import { AuthRegister } from './AuthRegister.jsx';
import { Dashboard } from './Dashboard.jsx';

export function ClientPanel() {
  const { open, view } = usePanel();
  if (!open) return null;

  return (
    <div id="clientPanel" className="active">
      <div className="panel-bg-glow panel-glow-1" />
      <div className="panel-bg-glow panel-glow-2" />
      {view === 'login' && <AuthLogin />}
      {view === 'register' && <AuthRegister />}
      {view === 'forgot' && <AuthForgot />}
      {view === 'dashboard' && <Dashboard />}
    </div>
  );
}
