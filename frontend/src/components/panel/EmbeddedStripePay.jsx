import { useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { apiCall } from '../../api/client.js';

const stripeCache = new Map();

function getStripe(publishableKey) {
  if (!publishableKey) return null;
  if (!stripeCache.has(publishableKey)) {
    stripeCache.set(publishableKey, loadStripe(publishableKey));
  }
  return stripeCache.get(publishableKey);
}

function InnerPayForm({ clientSecret, fallbackPaymentIntentId, onPaid, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setMsg('');
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
      const { error } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: 'if_required',
      });
      if (error) {
        setMsg(error.message || 'Error de pago');
        onError?.(error.message);
        return;
      }
      const pi = await stripe.retrievePaymentIntent(clientSecret);
      const id = pi?.id || fallbackPaymentIntentId;
      if (!id) {
        setMsg('No se pudo verificar el pago.');
        return;
      }
      if (pi?.status !== 'succeeded') {
        setMsg(`Estado del pago: ${pi?.status || 'desconocido'}`);
        return;
      }
      const r = await apiCall('/api/customer/stripe/payment-intent/sync', {
        method: 'POST',
        body: JSON.stringify({ payment_intent_id: id }),
      });
      if (r.user) {
        onPaid(r.user);
      } else {
        setMsg('Pago ok pero no se pudo cargar el perfil. Recarga el panel.');
      }
    } catch (err) {
      const m = err.message || 'Error al confirmar';
      setMsg(m);
      onError?.(m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="embedded-stripe-form" onSubmit={handleSubmit}>
      <div className="embedded-stripe-element-wrap">
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>
      {msg ? (
        <div className="auth-error show" style={{ marginTop: 12 }}>
          {msg}
        </div>
      ) : null}
      <button type="submit" className="btn-primary panel-plan-cta" style={{ marginTop: 18, width: '100%' }} disabled={!stripe || !elements || busy}>
        {busy ? 'Procesando…' : 'Confirmar y pagar'}
        {!busy ? <i className="fa-solid fa-lock" style={{ marginLeft: 8, opacity: 0.85 }} /> : null}
      </button>
    </form>
  );
}

/**
 * Embedded Stripe Payment Element — same server flow as test.js (PaymentIntent + confirm).
 */
export function EmbeddedStripePay({ publishableKey, clientSecret, paymentIntentId, onPaid, onError }) {
  const stripePromise = useMemo(() => getStripe(publishableKey), [publishableKey]);
  const elementsOptions = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#c8a96e',
          colorBackground: '#12121a',
          colorText: '#f0ede8',
          colorDanger: '#e05c6a',
          borderRadius: '12px',
          fontFamily: 'system-ui, sans-serif',
        },
      },
    }),
    [clientSecret]
  );

  if (!stripePromise || !clientSecret) {
    return <div className="auth-error show">Configuración de pago incompleta.</div>;
  }

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <InnerPayForm
        clientSecret={clientSecret}
        fallbackPaymentIntentId={paymentIntentId}
        onPaid={onPaid}
        onError={onError}
      />
    </Elements>
  );
}
