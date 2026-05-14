import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { IconBot } from '../components/icons.jsx';

const STYLES = `
  .lg-wrap {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      radial-gradient(50% 50% at 80% 0%, rgba(0,229,160,0.10), transparent 60%),
      radial-gradient(60% 60% at 20% 100%, rgba(96,165,250,0.08), transparent 65%),
      var(--ink);
    position: relative; overflow: hidden;
  }
  .lg-grid::before, .lg-grid::after {
    content: ''; position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: radial-gradient(60% 60% at 50% 50%, #000 0%, transparent 80%);
    pointer-events: none;
  }
  .lg-card {
    position: relative;
    width: 100%;
    max-width: 440px;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: 22px;
    padding: 36px;
    box-shadow: var(--shadow), 0 0 60px rgba(0,229,160,0.12);
    z-index: 1;
  }
  @media (max-width: 480px) {
    .lg-card { padding: 28px 22px; border-radius: 18px; }
  }
  .lg-card::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(60% 40% at 50% 0%, rgba(0,229,160,0.12), transparent 70%);
    border-radius: inherit;
    pointer-events: none;
  }
  .lg-logo {
    width: 64px; height: 64px;
    border-radius: 18px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    display: inline-flex; align-items: center; justify-content: center;
    color: #00120a;
    margin-bottom: 18px;
    box-shadow: 0 10px 30px rgba(0,229,160,0.30);
  }
  .lg-title { margin: 0 0 6px; font-family: var(--font-display); font-size: 28px; color: var(--text); }
  .lg-lead { margin: 0 0 24px; color: var(--soft); font-size: 13px; line-height: 1.6; }

  .lg-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .lg-field label { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .lg-field input {
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 14px;
    color: var(--text);
    font-size: 14px;
    transition: border-color .15s ease, background .15s ease;
  }
  .lg-field input:focus { outline: none; border-color: var(--em); background: rgba(0,0,0,0.45); }

  .lg-pw-wrap { position: relative; }
  .lg-pw-toggle {
    position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
    background: none; border: 0; color: var(--muted); cursor: pointer;
    width: 36px; height: 36px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 8px;
    transition: color .12s ease, background .12s ease;
  }
  .lg-pw-toggle:hover { color: var(--em); background: rgba(255,255,255,0.04); }

  .lg-btn {
    width: 100%;
    background: linear-gradient(180deg, var(--em) 0%, var(--em2) 100%);
    color: #00120a; font-weight: 700;
    border: 0; border-radius: 12px;
    padding: 14px;
    font-size: 14px; letter-spacing: .02em;
    cursor: pointer;
    transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
    margin-top: 8px;
  }
  .lg-btn:disabled { filter: grayscale(.6) brightness(.7); cursor: not-allowed; }
  .lg-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(0,229,160,0.35); }

  .lg-err {
    margin-top: 12px;
    padding: 10px 12px;
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.30);
    border-radius: 10px;
    color: #fecaca;
    font-size: 12px;
  }

  .lg-foot {
    margin-top: 18px;
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: .02em;
  }
  .lg-foot strong { color: var(--soft); }
`;

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
    <div className="lg-wrap lg-grid">
      <style>{STYLES}</style>
      <div className="lg-card">
        <div className="lg-logo">
          <IconBot style={{ width: 30, height: 30 }} />
        </div>
        <h1 className="lg-title">Omnira · administración</h1>
        <p className="lg-lead">
          Inicia sesión para gestionar clientes de pago, prompts del agente de WhatsApp, planes, leads y secretos de la plataforma.
        </p>
        <form onSubmit={submit} autoComplete="off">
          <div className="lg-field">
            <label htmlFor="adm-email">Correo de trabajo</label>
            <input
              id="adm-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="admin@omnira.app"
            />
          </div>
          <div className="lg-field">
            <label htmlFor="adm-password">Contraseña</label>
            <div className="lg-pw-wrap">
              <input
                id="adm-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="current-password"
                style={{ paddingRight: 48, width: '100%' }}
                placeholder="Mínimo 8 caracteres"
              />
              <button
                type="button"
                className="lg-pw-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.06-5.94M9.9 4.24A10 10 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {error ? <div className="lg-err">{error}</div> : null}
          <button type="submit" className="lg-btn" disabled={loading || !email || password.length < 8}>
            {loading ? 'Entrando…' : 'Entrar al centro de control'}
          </button>
        </form>
        <div className="lg-foot">
          Omnira · <strong>Acceso de superadministrador</strong>
        </div>
      </div>
    </div>
  );
}
