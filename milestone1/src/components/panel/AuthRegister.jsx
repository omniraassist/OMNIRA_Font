import { useState } from 'react';
import { apiCall } from '../../api/client.js';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';

export function AuthRegister() {
  const { closeClientPanel, showLogin, enterDashboard } = usePanel();
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const fd = new FormData(e.target);
    try {
      const res = await apiCall('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          businessName: fd.get('regBusiness'),
          email: fd.get('regEmail'),
          phone: fd.get('regPhone'),
          password: fd.get('regPass'),
        }),
      });
      localStorage.setItem('omnira_session', JSON.stringify(res));
      enterDashboard(res.user);
    } catch (ex) {
      setErr(ex.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="registerScreen" className="auth-screen">
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
                <h1 className="auth-title">Crea tu cuenta</h1>
                <p className="auth-subtitle">Empieza a automatizar tu agenda en minutos</p>
                <div className={`auth-error ${err ? 'show' : ''}`}>{err}</div>
                <form onSubmit={onSubmit}>
                  <div className="form-group">
                    <label className="form-label">Nombre del negocio</label>
                    <input className="form-input" type="text" name="regBusiness" placeholder="Clínica Dental Sonrisas" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" name="regEmail" placeholder="tu@negocio.com" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">WhatsApp</label>
                    <input className="form-input" type="tel" name="regPhone" placeholder="+34 600 000 000" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña</label>
                    <input className="form-input" type="password" name="regPass" placeholder="Mínimo 8 caracteres" required minLength={8} />
                  </div>
                  <button type="submit" className="panel-btn-primary" id="regBtn" disabled={loading}>
                    {loading ? <div className="p-spinner" style={{ width: 20, height: 20 }} /> : <>Crear cuenta gratis <i className="fa-solid fa-arrow-right" /></>}
                  </button>
                </form>
                <p className="auth-switch">
                  ¿Ya tienes cuenta?{' '}
                  <button type="button" onClick={showLogin} style={{ color: 'var(--em)', cursor: 'pointer', background: 'none', border: 'none', font: 'inherit', fontWeight: 600 }}>
                    Inicia sesión
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
