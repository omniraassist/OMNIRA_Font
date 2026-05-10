import { useState } from 'react';
import { LogoMark } from '../brand/LogoMark.jsx';
import { PLAN_STORAGE_KEY } from '../../constants/plans.js';
import { apiCall } from '../../api/client.js';
import { usePanel } from '../../context/PanelContext.jsx';

export function PostLoginPaymentStep() {
  const { closeClientPanel, completePaymentStep, refreshCustomerUser } = usePanel();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  let plan = null;
  try {
    plan = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || 'null');
  } catch {
    plan = null;
  }

  async function startStripe() {
    if (!plan?.id) return;
    setErr('');
    setBusy(true);
    try {
      const res = await apiCall('/api/customer/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan_id: plan.id }),
      });
      if (res.url) {
        window.location.assign(res.url);
        return;
      }
      setErr('No se pudo iniciar el pago.');
    } catch (e) {
      setErr(e.message || 'Error al conectar con el pago');
    } finally {
      setBusy(false);
    }
  }

  async function simulateLocal() {
    if (!plan?.id) return;
    setErr('');
    setBusy(true);
    try {
      const r = await apiCall('/api/customer/subscription/simulate', {
        method: 'POST',
        body: JSON.stringify({ plan_id: plan.id }),
      });
      if (r.user) {
        const sess = JSON.parse(localStorage.getItem('omnira_session') || '{}');
        if (sess.token) {
          localStorage.setItem('omnira_session', JSON.stringify({ ...sess, user: r.user }));
        }
        await refreshCustomerUser();
        completePaymentStep();
        return;
      }
      setErr('No se pudo simular el plan.');
    } catch (e) {
      setErr(e.message || 'Simulación no disponible (OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE=true en el servidor).');
    } finally {
      setBusy(false);
    }
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
              Pago seguro con <strong>Stripe</strong>. Tras completar el checkout volverás aquí para configurar{' '}
              <strong>WhatsApp Business + Twilio</strong>.
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

            {err ? <div className="auth-error show" style={{ marginBottom: 14 }}>{err}</div> : null}

            <button type="button" className="btn-primary panel-plan-cta" onClick={startStripe} disabled={busy || !plan?.id}>
              {busy ? 'Redirigiendo a Stripe…' : 'Pagar con tarjeta (Stripe)'}
              <i className="fa-solid fa-arrow-right" />
            </button>
            <p className="panel-plan-lead" style={{ marginTop: 16, fontSize: 13, opacity: 0.85 }}>
              Solo desarrollo: si Stripe no está configurado, usa el botón de abajo.
            </p>
            <button type="button" className="btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={simulateLocal} disabled={busy}>
              Simular pago (requiere OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE en servidor)
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
