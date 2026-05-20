import { useState, useCallback } from 'react';
import { LogoMark } from '../brand/LogoMark.jsx';
import { PLAN_STORAGE_KEY } from '../../constants/plans.js';
import { apiCall } from '../../api/client.js';
import { usePanel } from '../../context/PanelContext.jsx';
import { EmbeddedStripePay } from './EmbeddedStripePay.jsx';

export function PostLoginPaymentStep() {
  const { closeClientPanel, completePaymentStep, refreshCustomerUser } = usePanel();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [embed, setEmbed] = useState(null);

  let plan = null;
  try {
    plan = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || 'null');
  } catch {
    plan = null;
  }

  const persistUser = useCallback(
    async (user) => {
      try {
        const sess = JSON.parse(localStorage.getItem('omnira_session') || '{}');
        if (sess.token) {
          localStorage.setItem('omnira_session', JSON.stringify({ ...sess, user }));
        }
      } catch {
        /* ignore */
      }
      await refreshCustomerUser();
      if (user) completePaymentStep();
    },
    [completePaymentStep, refreshCustomerUser]
  );

  /** Embedded card pay (PaymentIntent + Elements) — same pattern as test.js */
  async function startEmbeddedPay() {
    if (!plan?.id) return;
    setErr('');
    setBusy(true);
    setEmbed(null);
    try {
      const keyRes = await apiCall('/api/public/stripe-publishable-key');
      const pk = keyRes.publishableKey;
      if (!pk) {
        throw new Error('El servidor no tiene STRIPE_PUBLISHABLE_KEY configurada.');
      }
      const piRes = await apiCall('/api/customer/stripe/payment-intent', {
        method: 'POST',
        body: JSON.stringify({ plan_id: plan.id }),
      });
      if (!piRes.clientSecret || !piRes.paymentIntentId) {
        throw new Error('No se pudo crear el pago.');
      }
      setEmbed({
        publishableKey: pk,
        clientSecret: piRes.clientSecret,
        paymentIntentId: piRes.paymentIntentId,
      });
    } catch (e) {
      setErr(e.message || 'Error al iniciar el pago embebido');
    } finally {
      setBusy(false);
    }
  }

  /** Stripe-hosted Checkout (redirect) */
  async function startStripeRedirect() {
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

  function handleEmbeddedPaid(user) {
    setEmbed(null);
    void persistUser(user);
  }

  return (
    <div className="auth-screen panel-payment-screen">
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
            <span className="auth-header-mini-icon">
              <LogoMark size={38} alt="" />
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
              Pago seguro con <strong>Stripe</strong>. Tras pagar podrás configurar{' '}
              <strong>WhatsApp Business + Twilio</strong> y usar el panel.
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

            {!embed ? (
              <>
                <button
                  type="button"
                  className="btn-primary panel-plan-cta"
                  onClick={startEmbeddedPay}
                  disabled={busy || !plan?.id}
                >
                  {busy ? 'Preparando pago…' : 'Pagar con tarjeta (aquí)'}
                  <i className="fa-solid fa-credit-card" style={{ marginLeft: 8 }} />
                </button>
                <p className="panel-plan-lead" style={{ marginTop: 14, fontSize: 13, opacity: 0.85 }}>
                  También puedes abrir el checkout de Stripe en una nueva página.
                </p>
                <button type="button" className="btn-ghost" style={{ width: '100%', marginTop: 6 }} onClick={startStripeRedirect} disabled={busy || !plan?.id}>
                  Abrir Stripe Checkout (redirección)
                </button>
              </>
            ) : (
              <EmbeddedStripePay
                publishableKey={embed.publishableKey}
                clientSecret={embed.clientSecret}
                paymentIntentId={embed.paymentIntentId}
                onPaid={handleEmbeddedPaid}
                onError={(m) => setErr(m || 'Error de pago')}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
