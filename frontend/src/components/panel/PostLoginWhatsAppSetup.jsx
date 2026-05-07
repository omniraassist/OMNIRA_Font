import { useState } from 'react';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';

export function PostLoginWhatsAppSetup() {
  const { closeClientPanel, completeWhatsAppSetup } = usePanel();
  const [metaPhone, setMetaPhone] = useState('+34 ');
  const [metaBusinessId, setMetaBusinessId] = useState('');
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');

  function onSubmit(e) {
    e.preventDefault();
    try {
      localStorage.setItem(
        'omnira_channel_setup',
        JSON.stringify({
          metaPhone,
          metaBusinessId,
          twilioSid,
          twilioToken: twilioToken ? 'configured' : '',
          configuredAt: new Date().toISOString(),
        })
      );
    } catch {
      /* ignore */
    }
    completeWhatsAppSetup();
  }

  return (
    <div className="auth-screen panel-wa-screen">
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
            <span className="auth-header-mini-icon">
              <LogoMark size={22} alt="" />
            </span>
            Omni<span>ra</span>
          </button>
        </div>
      </header>

      <main className="panel-payment-main">
        <div className="panel-plan-inner">
          <div className="panel-plan-pipeline reveal visible" aria-label="Flujo de onboarding">
            <div className="panel-plan-step done">
              <span className="panel-plan-step-num">
                <i className="fa-solid fa-check" />
              </span>
              <span className="panel-plan-step-label">Plan</span>
            </div>
            <span className="panel-plan-step-line" aria-hidden />
            <div className="panel-plan-step done">
              <span className="panel-plan-step-num">
                <i className="fa-solid fa-check" />
              </span>
              <span className="panel-plan-step-label">Pago</span>
            </div>
            <span className="panel-plan-step-line" aria-hidden />
            <div className="panel-plan-step is-active">
              <span className="panel-plan-step-num">3</span>
              <span className="panel-plan-step-label">Meta / Twilio</span>
            </div>
          </div>

          <form className="glass panel-payment-card reveal visible panel-wa-form" onSubmit={onSubmit}>
            <h1 className="panel-plan-title">
              Configura tus canales
              <br />
              <span className="gradient-text">WhatsApp + Twilio</span>
            </h1>
            <p className="panel-plan-lead">
              Conecta tu número de WhatsApp Business y tus credenciales de Twilio para enrutar mensajes, OTP y
              fallback de entrega.
            </p>

            <div className="panel-wa-grid">
              <div className="form-group">
                <label className="form-label">WhatsApp Business Number</label>
                <input
                  className="form-input"
                  type="text"
                  value={metaPhone}
                  onChange={(e) => setMetaPhone(e.target.value)}
                  placeholder="+34 600 000 000"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Meta Business ID</label>
                <input
                  className="form-input"
                  type="text"
                  value={metaBusinessId}
                  onChange={(e) => setMetaBusinessId(e.target.value)}
                  placeholder="123456789012345"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Twilio Account SID</label>
                <input
                  className="form-input"
                  type="text"
                  value={twilioSid}
                  onChange={(e) => setTwilioSid(e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Twilio Auth Token</label>
                <input
                  className="form-input"
                  type="password"
                  value={twilioToken}
                  onChange={(e) => setTwilioToken(e.target.value)}
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button type="submit" className="btn-primary panel-plan-cta">
              Guardar y entrar al panel
              <i className="fa-solid fa-check" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
