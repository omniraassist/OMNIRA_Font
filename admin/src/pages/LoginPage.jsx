import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { IconBot } from '../components/icons.jsx';

export function LoginPage() {
  const { login, isAuthenticated } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
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
          context.
        </p>
        <form onSubmit={submit}>
          <div className="adm-field" style={{ marginBottom: 18 }}>
            <label htmlFor="adm-email">Work email</label>
            <input id="adm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="adm-field" style={{ marginBottom: 18 }}>
            <label htmlFor="adm-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="adm-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>
          {error && <p className="adm-field-hint" style={{ color: '#ff7272' }}>{error}</p>}
          <button type="submit" className="adm-btn adm-btn-primary" style={{ width: '100%', padding: '14px' }}>
            {loading ? 'Signing in...' : 'Enter control center'}
          </button>
        </form>
      </div>
    </div>
  );
}
