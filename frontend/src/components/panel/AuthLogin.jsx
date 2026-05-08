import { useState } from 'react';
import { apiCall } from '../../api/client.js';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';

export function AuthLogin() {
  const { closeClientPanel, showRegister, showForgot, enterPlanHome } = usePanel();
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const email = e.target.loginEmail.value;
    const password = e.target.loginPass.value;
    try {
      const res = await apiCall('/api/customer/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('omnira_session', JSON.stringify(res));
      enterPlanHome(res.user);
    } catch (ex) {
      setErr(ex.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="loginScreen" className="auth-screen notranslate" translate="no">
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
            <span className="auth-header-mini-icon">
              <LogoMark size={22} alt="" />
            </span>
            Omni<span>ra</span>
          </button>
          <div className="auth-header-actions">
            <button type="button" className="auth-header-link" onClick={closeClientPanel}>
              <i className="fa-solid fa-house" />
              <span> Volver al sitio</span>
            </button>
          </div>
        </div>
      </header>
      <div className="auth-body">
        <div className="auth-layout">
          <div className="auth-form-col">
            <div className="auth-card-wrap">
              <div className="auth-card">
                <div className="auth-logo-row">
                  <div className="auth-logo-icon">
                    <LogoMark size={36} alt="" />
                  </div>
                  <span className="auth-logo-text">Omnira</span>
                </div>
                <h1 className="auth-title">Bienvenido de vuelta</h1>
                <p className="auth-subtitle">Accede al panel de tu negocio</p>
                <div className={`auth-error ${err ? 'show' : ''}`}>{err}</div>
                <form onSubmit={onSubmit} translate="no" className="notranslate">
                  <div className="form-group">
                    <label className="form-label" htmlFor="loginEmail">
                      Email
                    </label>
                    <input
                      className="form-input"
                      type="email"
                      id="loginEmail"
                      name="loginEmail"
                      placeholder="tu@negocio.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="loginPass">
                      Contraseña
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="form-input"
                        type={showPassword ? 'text' : 'password'}
                        id="loginPass"
                        name="loginPass"
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
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
                  <button type="submit" className="panel-btn-primary" id="loginBtn" disabled={loading}>
                    {loading ? (
                      <div className="p-spinner" style={{ width: 20, height: 20 }} />
                    ) : (
                      <span className="panel-btn-primary-inner">
                        <span>Iniciar sesión</span>
                        <i className="fa-solid fa-arrow-right" aria-hidden />
                      </span>
                    )}
                  </button>
                </form>
                <p className="auth-switch" style={{ marginTop: 10, fontSize: 13 }}>
                  <button type="button" className="link-like" onClick={showForgot} style={{ color: 'var(--soft)', cursor: 'pointer', background: 'none', border: 'none', font: 'inherit' }}>
                    ¿Olvidaste tu contraseña?
                  </button>
                </p>
                <p className="auth-switch">
                  ¿No tienes cuenta?{' '}
                  <button type="button" onClick={showRegister} style={{ color: 'var(--em)', cursor: 'pointer', background: 'none', border: 'none', font: 'inherit', fontWeight: 600 }}>
                    Regístrate gratis
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <footer className="auth-footer">
        <div className="auth-footer-inner">
          <p>© Omnira</p>
          <span className="auth-footer-badge">
            <i className="fa-solid fa-shield-halved" /> Conexión cifrada
          </span>
          <button type="button" onClick={closeClientPanel} style={{ background: 'none', border: 'none', color: 'var(--em)', cursor: 'pointer', fontWeight: 600 }}>
            Salir al sitio web
          </button>
        </div>
      </footer>
    </div>
  );
}
