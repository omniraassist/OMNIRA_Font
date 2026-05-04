import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { IconBot } from '../components/icons.jsx';

export function LoginPage() {
  const { login, isAuthenticated } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@omnira.app');

  if (isAuthenticated) return <Navigate to="/" replace />;

  const submit = (e) => {
    e.preventDefault();
    login(email.trim() || 'admin@omnira.app');
    navigate('/', { replace: true });
  };

  return (
    <div className="adm-login">
      <div className="adm-login-card">
        <div className="adm-login-logo">
          <div className="adm-brand-mark" style={{ width: 56, height: 56, borderRadius: 16 }}>
            <IconBot style={{ width: 28, height: 28 }} />
          </div>
        </div>
        <h1>Omnira admin</h1>
        <p>
          Operate paid WhatsApp agents: subscribers, live sessions, Meta configuration, and per-client bot
          context. Frontend-only demo — wire your API later.
        </p>
        <form onSubmit={submit}>
          <div className="adm-field" style={{ marginBottom: 18 }}>
            <label htmlFor="adm-email">Work email</label>
            <input id="adm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="adm-field-hint">Any email works for this mock. Password step omitted on purpose.</p>
          </div>
          <button type="submit" className="adm-btn adm-btn-primary" style={{ width: '100%', padding: '14px' }}>
            Enter control center
          </button>
        </form>
      </div>
    </div>
  );
}
