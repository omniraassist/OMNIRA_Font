import { useEffect, useState } from 'react';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/AuthContext.jsx';

const STEPS = [
  { label: 'Verificando tu pago…',              duration: 1200 },
  { label: 'Asignando tu número de teléfono…',  duration: 1800 },
  { label: 'Activando tu agente de IA…',        duration: 1400 },
  { label: '¡Tu bot está listo!',               duration: 600  },
];

const STYLES = `
  .twa-screen {
    min-height: 100dvh;
    background:
      radial-gradient(60% 60% at 80% 0%, rgba(0,229,160,0.08), transparent 60%),
      radial-gradient(60% 60% at 20% 100%, rgba(96,165,250,0.06), transparent 65%);
    display: flex; flex-direction: column;
  }
  .twa-main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px 16px; }
  .twa-card {
    background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
    border: 1px solid rgba(0,229,160,0.18);
    border-radius: 22px; padding: 48px 40px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.35);
    text-align: center; width: 100%; max-width: 480px;
  }
  @media (max-width: 560px) { .twa-card { padding: 36px 20px; border-radius: 18px; } }
  .twa-icon {
    width: 96px; height: 96px; margin: 0 auto 28px; border-radius: 50%;
    background: linear-gradient(135deg, var(--em) 0%, #34d399 100%);
    display: flex; align-items: center; justify-content: center; font-size: 44px;
    animation: twa-pulse 1.8s ease-in-out infinite;
  }
  @keyframes twa-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(0,229,160,0.5); }
    70%  { box-shadow: 0 0 0 18px rgba(0,229,160,0); }
    100% { box-shadow: 0 0 0 0 rgba(0,229,160,0); }
  }
  .twa-title { font-family: var(--font-display,'Geist',sans-serif); font-size: 26px; color: var(--text); margin: 0 0 8px; line-height: 1.2; }
  .twa-sub { color: var(--soft); font-size: 14px; line-height: 1.6; max-width: 360px; margin: 0 auto 36px; }
  .twa-steps { display: flex; flex-direction: column; gap: 12px; text-align: left; margin-bottom: 36px; }
  .twa-step { display: flex; align-items: center; gap: 12px; opacity: 0.35; transition: opacity .3s ease; }
  .twa-step.active { opacity: 1; }
  .twa-step.done   { opacity: 0.65; }
  .twa-step-dot {
    width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%;
    border: 2px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; transition: all .3s ease;
  }
  .twa-step.active .twa-step-dot { border-color: var(--em); background: rgba(0,229,160,0.12); color: var(--em); }
  .twa-step.done  .twa-step-dot  { border-color: var(--em); background: var(--em); color: #00120a; }
  .twa-step-label { font-size: 14px; color: var(--text); font-weight: 500; }
  .twa-step.active .twa-step-label { color: var(--em); font-weight: 600; }
  .twa-spinner { display: flex; align-items: center; gap: 6px; justify-content: center; color: var(--muted); font-size: 12px; }
  .twa-spinner-dots span {
    display: inline-block; width: 6px; height: 6px; background: var(--em); border-radius: 50%;
    animation: twa-bounce .9s ease-in-out infinite; margin: 0 2px;
  }
  .twa-spinner-dots span:nth-child(2) { animation-delay: .15s; }
  .twa-spinner-dots span:nth-child(3) { animation-delay: .30s; }
  @keyframes twa-bounce { 0%,80%,100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
  .twa-pipe { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 16px 20px; }
  .twa-pipe-step { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .twa-pipe-step .num {
    width: 26px; height: 26px; border-radius: 999px;
    background: rgba(255,255,255,0.06); color: var(--soft);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
  }
  .twa-pipe-step.done   .num { background: var(--em); color: #00120a; }
  .twa-pipe-step.active .num { background: linear-gradient(135deg,var(--em),#93c5fd); color: #00120a; box-shadow: 0 0 0 4px rgba(0,229,160,0.15); }
  .twa-pipe-step .lbl { font-size: 12px; color: var(--soft); white-space: nowrap; }
  .twa-pipe-step.done .lbl, .twa-pipe-step.active .lbl { color: var(--text); font-weight: 600; }
  .twa-pipe-line { flex: 1; height: 1px; background: var(--border); min-width: 16px; }
`;

export function TwilioAssigning() {
  const { closeClientPanel, completeWhatsAppSetup } = usePanel();
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timers = [];
    let step = 0;
    function advance() {
      if (step >= STEPS.length - 1) {
        timers.push(setTimeout(() => completeWhatsAppSetup(), 400));
        return;
      }
      step += 1;
      setCurrentStep(step);
      timers.push(setTimeout(advance, STEPS[step].duration));
    }
    timers.push(setTimeout(advance, STEPS[0].duration));
    return () => timers.forEach(clearTimeout);
  }, [completeWhatsAppSetup]);

  return (
    <div className="auth-screen twa-screen">
      <style>{STYLES}</style>
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
            <span className="auth-header-mini-icon"><LogoMark size={38} alt="" /></span>
            Omni<span>ra</span>
          </button>
        </div>
      </header>

      <div className="twa-pipe">
        <div className="twa-pipe-step done"><span className="num">✓</span><span className="lbl">Plan</span></div>
        <div className="twa-pipe-line" />
        <div className="twa-pipe-step done"><span className="num">✓</span><span className="lbl">Pago</span></div>
        <div className="twa-pipe-line" />
        <div className="twa-pipe-step active"><span className="num">3</span><span className="lbl">Activando bot</span></div>
        <div className="twa-pipe-line" />
        <div className="twa-pipe-step"><span className="num">4</span><span className="lbl">Panel</span></div>
      </div>

      <main className="twa-main">
        <div className="twa-card">
          <div className="twa-icon">📱</div>
          <h1 className="twa-title">Preparando tu cuenta</h1>
          <p className="twa-sub">
            Estamos asignando tu número y activando tu agente de IA. Tardará solo unos segundos.
          </p>
          <div className="twa-steps">
            {STEPS.map((s, i) => (
              <div key={i} className={`twa-step${i < currentStep ? ' done' : i === currentStep ? ' active' : ''}`}>
                <div className="twa-step-dot">{i < currentStep ? '✓' : i + 1}</div>
                <span className="twa-step-label">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="twa-spinner">
            <div className="twa-spinner-dots">
              <span /><span /><span />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
