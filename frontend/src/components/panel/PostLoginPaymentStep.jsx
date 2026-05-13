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
        await persistUser(r.user);
        return;
      }
      setErr('No se pudo simular el plan.');
    } catch (e) {
      setErr(e.message || 'Simulación no disponible (OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE=true en el servidor).');
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

            {/* ──────────────────────────────────────────────────────────────
                TEMP TEST BUTTON — bypasses the payment screen so the customer
                dashboard can be developed without a real Stripe transaction.
                Calls /api/customer/subscription/simulate which grants the
                subscription in the DB (requires OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE
                =true on the server). Real Stripe flows below are UNCHANGED.
                REMOVE this <section> when payment work resumes.
                ────────────────────────────────────────────────────────────── */}
            {!embed ? (
              <section
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: '1px dashed rgba(251,191,36,0.40)',
                  background: 'rgba(251,191,36,0.06)',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#fbbf24',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 14 }}>🧪</span> Dev mode · temporary
                </div>
                <p
                  style={{
                    margin: '0 0 12px',
                    color: 'rgba(255,255,255,0.78)',
                    fontSize: 13,
                    lineHeight: 1.55,
                  }}
                >
                  Skip the payment step so you can iterate on the customer dashboard. This grants the selected
                  plan ({plan?.name || 'first available'}) for its duration without charging Stripe. Remove
                  this button before going live.
                </p>
                <button
                  type="button"
                  onClick={simulateLocal}
                  disabled={busy || !plan?.id}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
                    color: '#1a1100',
                    fontWeight: 700,
                    border: 0,
                    borderRadius: 10,
                    padding: '12px 18px',
                    cursor: busy || !plan?.id ? 'not-allowed' : 'pointer',
                    opacity: busy || !plan?.id ? 0.6 : 1,
                    fontSize: 14,
                    letterSpacing: '0.01em',
                    transition: 'filter .15s ease, transform .15s ease',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
                >
                  {busy ? 'Simulando…' : '⚡ Test · skip payment & go to dashboard'}
                </button>
              </section>
            ) : null}

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

            {!embed ? (
              <>
                <p className="panel-plan-lead" style={{ marginTop: 16, fontSize: 13, opacity: 0.85 }}>
                  Solo desarrollo: si Stripe no está configurado, usa el botón de abajo.
                </p>
                <button type="button" className="btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={simulateLocal} disabled={busy}>
                  Simular pago (requiere OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE en servidor)
                </button>
              </>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
