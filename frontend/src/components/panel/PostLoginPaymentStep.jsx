import { LogoMark } from '../brand/LogoMark.jsx';
import { PLAN_STORAGE_KEY } from '../../constants/plans.js';
import { usePanel } from '../../context/PanelContext.jsx';

export function PostLoginPaymentStep() {
  const { closeClientPanel, completePaymentStep } = usePanel();
  let plan = null;
  try {
    plan = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || 'null');
  } catch {
    plan = null;
  }

  return (
    <div className="auth-screen panel-payment-screen">
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
            <div className="panel-plan-step is-active">
              <span className="panel-plan-step-num">2</span>
              <span className="panel-plan-step-label">Pago</span>
            </div>
            <span className="panel-plan-step-line" aria-hidden />
            <div className="panel-plan-step">
              <span className="panel-plan-step-num">3</span>
              <span className="panel-plan-step-label">Meta / Twilio</span>
            </div>
          </div>

          <div className="glass panel-payment-card reveal visible">
            <h1 className="panel-plan-title">
              Pago del paquete
              <br />
              <span className="gradient-text">{plan?.name || 'Seleccionado'}</span>
            </h1>
            <p className="panel-plan-lead">
              Aquí irá Stripe/Checkout. Pulsa el botón para simular pago exitoso
              y continuar a configuración de <strong>WhatsApp Business + Twilio</strong>.
            </p>
            <div className="panel-payment-summary">
              <div>
                <span>Plan</span>
                <strong>{plan?.name || 'No definido'}</strong>
              </div>
              <div>
                <span>Precio</span>
                <strong>
                  €{plan?.priceNum || '--'}
                  {plan?.period || ''}
                </strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{plan?.totalRow || 'Pendiente'}</strong>
              </div>
            </div>

            <button type="button" className="btn-primary panel-plan-cta" onClick={completePaymentStep}>
              Simular pago exitoso
              <i className="fa-solid fa-arrow-right" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
