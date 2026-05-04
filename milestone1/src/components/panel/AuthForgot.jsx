import { useState } from 'react';
import { apiCall } from '../../api/client.js';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';

export function AuthForgot() {
  const { closeClientPanel, showLogin } = usePanel();
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    setLoading(true);
    const email = e.target.forgotEmail.value;
    try {
      await apiCall('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setOk('Te hemos enviado un enlace. Revisa tu bandeja de entrada (y spam).');
    } catch (ex) {
      setErr(ex.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="forgotScreen" className="auth-screen">
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={showLogin}>
            <span className="auth-header-mini-icon">
              <LogoMark size={22} alt="" />
            </span>
            Omni<span>ra</span>
          </button>
          <div className="auth-header-actions">
            <button type="button" className="auth-header-link" onClick={showLogin}>
              <i className="fa-solid fa-arrow-left" />
              <span> Volver al login</span>
            </button>
            <button type="button" className="auth-header-link" onClick={closeClientPanel}>
              <i className="fa-solid fa-house" />
              <span> Sitio web</span>
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
                <h1 className="auth-title">Recuperar contraseña</h1>
                <p className="auth-subtitle">Te enviaremos un enlace de recuperación a tu email.</p>
                <div className={`auth-error ${err ? 'show' : ''}`}>{err}</div>
                <div className={`auth-msg-success ${ok ? 'show' : ''}`}>{ok}</div>
                <form onSubmit={onSubmit}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="forgotEmail">
                      Email
                    </label>
                    <input className="form-input" type="email" id="forgotEmail" name="forgotEmail" placeholder="tu@negocio.com" required />
                  </div>
                  <button type="submit" className="panel-btn-primary" id="forgotBtn" disabled={loading}>
                    {loading ? <div className="p-spinner" style={{ width: 20, height: 20 }} /> : <>Enviar enlace <i className="fa-solid fa-paper-plane" /></>}
                  </button>
                </form>
                <p className="auth-switch">
                  <button type="button" onClick={showLogin} style={{ background: 'none', border: 'none', color: 'var(--em)', cursor: 'pointer', font: 'inherit', fontWeight: 600 }}>
                    ← Volver al inicio de sesión
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
            <i className="fa-solid fa-lock" /> Proceso seguro
          </span>
          <button type="button" onClick={showLogin} style={{ background: 'none', border: 'none', color: 'var(--em)', cursor: 'pointer', fontWeight: 600 }}>
            Volver al login
          </button>
        </div>
      </footer>
    </div>
  );
}
