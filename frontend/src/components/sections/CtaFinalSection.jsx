import { usePricing } from '../../hooks/usePricing.js';
import { usePanel } from '../../context/PanelContext.jsx';
import { PLAN_STORAGE_KEY } from '../../constants/plans.js';

export function CtaFinalSection() {
  const { plansByCheapest } = usePricing();
  const { openClientPanel } = usePanel();
  const cheapest = plansByCheapest[0];
  const cheapestPriceText = cheapest ? `desde ${cheapest.priceNum}€${cheapest.period}` : 'desde 49€/mes';

  /** Pre-select the cheapest plan, then open the auth panel → login → payment. */
  function startCheckout() {
    if (cheapest) {
      try {
        localStorage.setItem(
          PLAN_STORAGE_KEY,
          JSON.stringify({
            id: cheapest.id,
            name: cheapest.name,
            priceNum: cheapest.priceNum,
            period: cheapest.period,
            totalRow: cheapest.totalRow,
            chosenAt: new Date().toISOString(),
          })
        );
      } catch {
        /* ignore */
      }
    }
    openClientPanel('login');
  }

  return (
    <section id="cta-final">
      <div className="cta-orb-1" />
      <div className="cta-orb-2" />
      <div className="cta-dots" />
      <div className="container">
        <div className="cta-inner">
          <div className="eyebrow reveal" style={{ display: 'inline-flex', marginBottom: '24px' }}>
            <span className="eyebrow-dot" /> Disponible ahora mismo
          </div>
          <h2 className="reveal">
            Empieza a automatizar tu
            <br />
            <span className="gradient-text">negocio hoy</span>
          </h2>
          <p className="reveal">
            Únete a más de 120 negocios que ya usan Omnira para llenar su agenda automáticamente. Configuración en 30 minutos.
            Sin complicaciones.
          </p>
          <div className="cta-btns reveal">
            <button type="button" onClick={startCheckout} className="btn-primary btn-lg">
              <i className="fa-solid fa-rocket" />
              Empezar · {cheapestPriceText}
            </button>
            <a
              href="https://wa.me/34682497790?text=Hola%2C%20me%20gustar%C3%ADa%20solicitar%20una%20demo%20de%20Omnira"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost btn-lg"
            >
              <i className="fa-brands fa-whatsapp" style={{ color: '#25D366', fontSize: '18px' }} />
              Demo por WhatsApp
            </a>
            <a href="mailto:ayuda@omnira.chat" className="btn-ghost btn-lg">
              <i className="fa-solid fa-envelope" />
              ayuda@omnira.chat
            </a>
          </div>
          <div className="cta-trust reveal">
            <div className="cta-trust-item">
              <i className="fa-solid fa-lock" /> Pago 100% seguro
            </div>
            <div className="cta-trust-item">
              <i className="fa-solid fa-rotate-left" /> 14 días de garantía
            </div>
            <div className="cta-trust-item">
              <i className="fa-solid fa-comments" /> Soporte en español
            </div>
            <div className="cta-trust-item">
              <i className="fa-solid fa-bolt" /> Activo en 30 minutos
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
