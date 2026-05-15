import { usePricing } from '../../hooks/usePricing.js';
import { usePanel } from '../../context/PanelContext.jsx';
import { PLAN_STORAGE_KEY } from '../../constants/plans.js';

export function PricingSection() {
  const { plansByCheapest } = usePricing();
  const { openClientPanel } = usePanel();

  /** Pre-select the plan, then open the auth panel → login → payment. */
  function choosePlan(plan) {
    try {
      localStorage.setItem(
        PLAN_STORAGE_KEY,
        JSON.stringify({
          id: plan.id,
          name: plan.name,
          priceNum: plan.priceNum,
          period: plan.period,
          totalRow: plan.totalRow,
          chosenAt: new Date().toISOString(),
        })
      );
    } catch {
      /* ignore */
    }
    openClientPanel('login');
  }

  return (
    <section id="precios" className="section">
      <div className="price-glow" />
      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="section-header reveal">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> Planes y precios
          </div>
          <h2>
            Empieza a automatizar
            <br />
            <span className="gradient-text">en minutos</span>
          </h2>
          <p>Sin configuración manual, sin costes iniciales. Activación automática en todos los planes.</p>
        </div>

        <div className="plans-grid reveal">
          {plansByCheapest.map((plan) => {
            const months = Math.max(1, Math.round((plan.duration_days || 30) / 30));
            const noteByLen = {
              1: '🔒 Pago seguro · Cancela cuando quieras',
              3: '🔒 Pago único trimestral',
              6: '🔒 Pago único semestral',
              12: '🔒 Pago único anual',
            };
            const cardClass = `plan-card${plan.featured ? ' featured' : ''}`;
            return (
              <div key={plan.id} className={cardClass}>
                {plan.featured ? <div className="plan-ribbon">⚡ Mejor valor</div> : null}
                <div className={`plan-header${plan.featured ? ' with-ribbon' : ''}`}>
                  <div className="plan-top-meta" aria-hidden={!plan.savings}>
                    {plan.savings ? (
                      <span className={`plan-saving${plan.savingsHot ? ' hot' : ''}`}>{plan.savings}</span>
                    ) : null}
                  </div>
                  <div className="plan-name">{plan.name}</div>
                  <div className="plan-price-row">
                    <span className="plan-cur">€</span>
                    <span className={`plan-num${plan.featured ? ' featured-num' : ''}`}>{plan.priceNum}</span>
                    <span className="plan-period">{plan.period}</span>
                  </div>
                  <div className="plan-total-row">{plan.totalRow}</div>
                </div>
                <div className="plan-body">
                  <div className="plan-divider" />
                  <div className="plan-feats">
                    {plan.features.map((t) => (
                      <div key={t} className="plan-feat">
                        <div className={`feat-check${t.includes('Consultoría') ? ' gold-check' : ''}`}>
                          <i className="fa-solid fa-check" />
                        </div>
                        <span className={t.includes('Consultoría') ? 'gold-feat' : undefined}>{t}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`plan-cta${plan.featured ? ' primary-cta' : ''}`}
                    onClick={() => choosePlan(plan)}
                  >
                    Empezar ahora →
                  </button>
                  <p className="plan-note">{noteByLen[months] || '🔒 Pago seguro'}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="glass-em reveal"
          style={{
            borderRadius: 'var(--r-xl)',
            marginTop: '32px',
            padding: '28px 36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ fontSize: '28px', flexShrink: 0 }}>⚡</div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '5px', fontFamily: "'Outfit',sans-serif" }}>
                Incluido en todos los planes
              </div>
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Bot con IA · Respuestas 24/7 · Reservas automáticas · Calendario ·{' '}
                <strong style={{ color: 'var(--em)' }}>Activación inmediata</strong> · Sin conocimientos técnicos
              </p>
            </div>
          </div>
          <a href="#cta-final" className="btn-ghost" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            Ver demo gratis →
          </a>
        </div>

        <div className="guarantee-wrap reveal">
          <div className="guarantee-pill">
            <span className="guarantee-icon">🛡️</span>
            <span className="guarantee-text">
              <strong>14 días de prueba gratuita en cualquier plan.</strong> Si no ves resultados, te devolvemos el dinero.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
