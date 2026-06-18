import { useEffect, useState } from 'react';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';
import { apiCall } from '../../api/client.js';

const STYLES = `
  .twr-screen {
    min-height: 100dvh;
    background:
      radial-gradient(60% 60% at 80% 0%, rgba(0,229,160,0.08), transparent 60%),
      radial-gradient(60% 60% at 20% 100%, rgba(96,165,250,0.06), transparent 65%);
    display: flex; flex-direction: column;
  }
  .twr-card {
    background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
    border: 1px solid rgba(0,229,160,0.18);
    border-radius: 22px;
    padding: 36px 32px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.35);
    text-align: center;
  }
  @media (max-width: 560px) { .twr-card { padding: 28px 18px; border-radius: 18px; } }

  .twr-ring {
    width: 110px; height: 110px;
    margin: 0 auto 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--em) 0%, #34d399 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 50px;
    box-shadow: 0 16px 48px rgba(0,229,160,0.45);
    animation: twr-pop .55s cubic-bezier(.34,1.56,.64,1);
  }
  @keyframes twr-pop {
    0% { transform: scale(0.3); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }

  .twr-title {
    font-family: var(--font-display, 'Syne', sans-serif);
    font-size: 30px; color: var(--text);
    margin: 0 0 10px; line-height: 1.2;
  }
  .twr-title .grad {
    background: linear-gradient(90deg, var(--em) 0%, #93c5fd 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .twr-sub {
    color: var(--soft); font-size: 15px;
    line-height: 1.6; max-width: 480px;
    margin: 0 auto 28px;
  }

  .twr-number-box {
    background: rgba(0,229,160,0.06);
    border: 1px solid rgba(0,229,160,0.30);
    border-radius: 16px;
    padding: 20px 24px;
    margin: 0 auto 24px;
    max-width: 360px;
  }
  .twr-number-label {
    font-size: 11px; font-weight: 700;
    letter-spacing: .08em; text-transform: uppercase;
    color: var(--em); margin-bottom: 8px;
  }
  .twr-number {
    font-family: monospace;
    font-size: 28px; font-weight: 700;
    color: var(--text);
    letter-spacing: .04em;
  }
  .twr-number-hint {
    font-size: 12px; color: var(--muted);
    margin-top: 6px; line-height: 1.5;
  }

  .twr-pills {
    display: flex; flex-wrap: wrap;
    gap: 8px; justify-content: center;
    margin-bottom: 28px;
  }
  .twr-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 14px;
    background: rgba(0,229,160,0.10);
    border: 1px solid rgba(0,229,160,0.25);
    border-radius: 999px;
    color: var(--em); font-size: 12px; font-weight: 600;
  }

  .twr-steps {
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px 20px;
    margin: 0 auto 28px;
    max-width: 420px;
    text-align: left;
  }
  .twr-steps-title {
    font-size: 11px; font-weight: 700;
    letter-spacing: .06em; text-transform: uppercase;
    color: var(--soft); margin-bottom: 12px;
  }
  .twr-step {
    display: flex; gap: 12px; align-items: flex-start;
    margin-bottom: 10px;
  }
  .twr-step:last-child { margin-bottom: 0; }
  .twr-step-num {
    width: 22px; height: 22px; flex-shrink: 0;
    border-radius: 50%;
    background: var(--em); color: #00120a;
    font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .twr-step-text { font-size: 13px; color: var(--soft); line-height: 1.5; padding-top: 2px; }
  .twr-step-text strong { color: var(--text); }

  .twr-btn {
    width: 100%; max-width: 360px;
    background: linear-gradient(180deg, var(--em) 0%, var(--em2, #00c87a) 100%);
    color: #00120a; font-weight: 700;
    border: 0; border-radius: 12px;
    padding: 15px; font-size: 15px;
    cursor: pointer;
    transition: filter .15s ease, transform .15s ease;
    margin: 0 auto;
    display: block;
    letter-spacing: .01em;
  }
  .twr-btn:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(0,229,160,0.30); filter: brightness(1.06); }

  .twr-loading {
    color: var(--soft); font-size: 14px;
    padding: 40px 0; text-align: center;
  }

  .twr-pipe {
    display: flex; align-items: center; gap: 8px;
    margin: 24px 0 32px;
    overflow-x: auto; justify-content: center;
  }
  .twr-pipe-step { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .twr-pipe-step .num {
    width: 26px; height: 26px; border-radius: 999px;
    background: rgba(255,255,255,0.06); color: var(--soft);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
  }
  .twr-pipe-step.done .num { background: var(--em); color: #00120a; }
  .twr-pipe-step .lbl { font-size: 12px; color: var(--soft); white-space: nowrap; }
  .twr-pipe-step.done .lbl { color: var(--text); font-weight: 600; }
  .twr-pipe-line { flex: 1; height: 1px; background: var(--border); min-width: 20px; }
`;

export function PostLoginTwilioReady({ previewMode = false }) {
  const { closeClientPanel, completeWhatsAppSetup, user } = usePanel();
  const [number, setNumber] = useState(previewMode ? { phone_number: '+34 911 000 001' } : null);
  const [loading, setLoading] = useState(!previewMode);

  useEffect(() => {
    if (previewMode) return;
    apiCall('/api/customer/twilio-number')
      .then(res => setNumber(res.number || null))
      .catch(() => setNumber(null))
      .finally(() => setLoading(false));
  }, [previewMode]);

  const firstName = user?.first_name || user?.businessName || 'cliente';

  return (
    <div className="auth-screen twr-screen">
      <style>{STYLES}</style>
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
            <span className="auth-header-mini-icon"><LogoMark size={38} alt="" /></span>
            Omni<span>ra</span>
          </button>
        </div>
      </header>

      <main className="panel-payment-main" style={{ padding: '24px 16px', flex: 1 }}>
        <div className="panel-plan-inner" style={{ maxWidth: 640, margin: '0 auto' }}>

          {/* Pipeline */}
          <div className="twr-pipe">
            <div className="twr-pipe-step done"><span className="num">✓</span><span className="lbl">Plan</span></div>
            <div className="twr-pipe-line" />
            <div className="twr-pipe-step done"><span className="num">✓</span><span className="lbl">Pago</span></div>
            <div className="twr-pipe-line" />
            <div className="twr-pipe-step done"><span className="num">✓</span><span className="lbl">WhatsApp listo</span></div>
            <div className="twr-pipe-line" />
            <div className="twr-pipe-step done"><span className="num">✓</span><span className="lbl">Dashboard</span></div>
          </div>

          <div className="twr-card">
            {loading ? (
              <div className="twr-loading">Asignando tu número…</div>
            ) : (
              <>
                <div className="twr-ring">🚀</div>

                <h1 className="twr-title">
                  ¡Listo, {firstName}! Tu agente está<br />
                  <span className="grad">activo ahora mismo</span>
                </h1>

                <p className="twr-sub">
                  Te hemos asignado un número de WhatsApp Business exclusivo.
                  Tu bot responde automáticamente 24/7 — no necesitas configurar nada más.
                </p>

                {number ? (
                  <div className="twr-number-box">
                    <div className="twr-number-label">Tu número de WhatsApp</div>
                    <div className="twr-number">{number.phone_number}</div>
                    <div className="twr-number-hint">
                      Comparte este número con tus clientes. Los mensajes que reciba serán respondidos por tu agente Omnira.
                    </div>
                  </div>
                ) : (
                  <div className="twr-number-box">
                    <div className="twr-number-label">Tu número de WhatsApp</div>
                    <div className="twr-number" style={{ fontSize: 16, color: 'var(--soft)' }}>
                      Asignando número… lo verás en tu dashboard en breve.
                    </div>
                  </div>
                )}

                <div className="twr-pills">
                  <span className="twr-pill">● Bot activo 24/7</span>
                  <span className="twr-pill">🤖 IA integrada</span>
                  <span className="twr-pill">📊 Leads automáticos</span>
                </div>

                <div className="twr-steps">
                  <div className="twr-steps-title">¿Qué puedes hacer ahora?</div>
                  <div className="twr-step">
                    <span className="twr-step-num">1</span>
                    <div className="twr-step-text">
                      <strong>Personaliza tu bot</strong> — añade el nombre de tu negocio, servicios y preguntas frecuentes en el panel.
                    </div>
                  </div>
                  <div className="twr-step">
                    <span className="twr-step-num">2</span>
                    <div className="twr-step-text">
                      <strong>Comparte el número</strong> — ponlo en tu web, Instagram o tarjeta de visita.
                    </div>
                  </div>
                  <div className="twr-step">
                    <span className="twr-step-num">3</span>
                    <div className="twr-step-text">
                      <strong>Revisa los leads</strong> — cada conversación genera un lead automático con nombre, intención y datos de contacto.
                    </div>
                  </div>
                </div>

                <button type="button" className="twr-btn" onClick={completeWhatsAppSetup}>
                  Entrar al dashboard →
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
