import { useState } from 'react';
import { apiCall } from '../../api/client.js';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';

export function AuthForgot() {
  const { closeClientPanel, showLogin } = usePanel();
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [step, setStep] = useState('verify');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    setLoading(true);
    const form = new FormData(e.target);
    try {
      if (step === 'verify') {
        const enteredEmail = String(form.get('forgotEmail') || '').trim().toLowerCase();
        const res = await apiCall('/api/customer/reset/request', {
          method: 'POST',
          body: JSON.stringify({ email: enteredEmail }),
        });
        setEmail(enteredEmail);
        setResetToken(res.reset_token || '');
        setStep('reset');
        setOk('Email verificado. Ahora crea nueva contraseña.');
        return;
      }

      const newPassword = String(form.get('newPassword') || '');
      const confirmPassword = String(form.get('confirmPassword') || '');
      if (newPassword.length < 8) {
        throw new Error('La nueva contraseña debe tener al menos 8 caracteres.');
      }
      if (newPassword !== confirmPassword) {
        throw new Error('Las contraseñas no coinciden.');
      }
      if (!resetToken) {
        throw new Error('La sesión de restablecimiento ha caducado. Verifica el correo de nuevo.');
      }
      await apiCall('/api/customer/reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      setOk('Contraseña restablecida correctamente. Redirigiendo al inicio de sesión…');
      setTimeout(() => {
        showLogin();
      }, 600);
    } catch (ex) {
      setErr(ex.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="forgotScreen" className="auth-screen notranslate" translate="no">
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={showLogin}>
            <span className="auth-header-mini-icon">
              <LogoMark size={38} alt="" />
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
                    <LogoMark size={60} alt="" />
                  </div>
                  <span className="auth-logo-text">Omnira</span>
                </div>
                <h1 className="auth-title">Recuperar contraseña</h1>
                <p className="auth-subtitle">
                  {step === 'verify'
                    ? 'Introduce tu correo para verificar tu cuenta.'
                    : `Cuenta verificada (${email}). Crea tu nueva contraseña.`}
                </p>
                <div className={`auth-error ${err ? 'show' : ''}`}>{err}</div>
                <div className={`auth-msg-success ${ok ? 'show' : ''}`}>{ok}</div>
                <form onSubmit={onSubmit} translate="no" className="notranslate">
                  {step === 'verify' ? (
                    <div className="form-group">
                      <label className="form-label" htmlFor="forgotEmail">
                        Email
                      </label>
                      <input className="form-input" type="email" id="forgotEmail" name="forgotEmail" placeholder="tu@negocio.com" required />
                    </div>
                  ) : (
                    <>
                      <div className="form-group">
                        <label className="form-label" htmlFor="newPassword">
                          Crear nueva contraseña
                        </label>
                        <div style={{ position: 'relative' }}>
                          <input
                            className="form-input"
                            type={showNewPassword ? 'text' : 'password'}
                            id="newPassword"
                            name="newPassword"
                            placeholder="Mínimo 8 caracteres"
                            minLength={8}
                            required
                            style={{ paddingRight: 44 }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword((v) => !v)}
                            aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                          >
                            <i className={`fa-solid ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                          </button>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="confirmPassword">
                          Confirmar contraseña
                        </label>
                        <div style={{ position: 'relative' }}>
                          <input
                            className="form-input"
                            type={showConfirmPassword ? 'text' : 'password'}
                            id="confirmPassword"
                            name="confirmPassword"
                            placeholder="Vuelve a escribir la contraseña"
                            minLength={8}
                            required
                            style={{ paddingRight: 44 }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                          >
                            <i className={`fa-solid ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <button type="submit" className="panel-btn-primary" id="forgotBtn" disabled={loading}>
                    {loading ? (
                      <div className="p-spinner" style={{ width: 20, height: 20 }} />
                    ) : (
                      <span className="panel-btn-primary-inner">
                        <span>{step === 'verify' ? 'Verificar correo' : 'Restablecer contraseña'}</span>
                        <i className="fa-solid fa-paper-plane" aria-hidden />
                      </span>
                    )}
                  </button>
                </form>
                {step === 'reset' && (
                  <p className="auth-switch">
                    <button
                      type="button"
                      onClick={() => {
                        setStep('verify');
                        setResetToken('');
                        setOk('');
                        setErr('');
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--em)', cursor: 'pointer', font: 'inherit', fontWeight: 600 }}
                    >
                      Usar otro correo
                    </button>
                  </p>
                )}
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
