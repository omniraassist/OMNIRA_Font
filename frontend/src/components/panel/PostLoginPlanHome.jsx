import { useMemo, useState } from 'react';
import { LogoMark } from '../brand/LogoMark.jsx';
import { PLAN_STORAGE_KEY } from '../../constants/plans.js';
import { usePanel } from '../../context/PanelContext.jsx';
import { usePricing } from '../../hooks/usePricing.js';

export function PostLoginPlanHome() {
  const { user, closeClientPanel, completePlanSelection } = usePanel();
  const { plans, plansByCheapest } = usePricing();
  const [selectedId, setSelectedId] = useState(() => {
    try {
      const raw = localStorage.getItem(PLAN_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.id) return p.id;
      }
    } catch {
      /* ignore */
    }
    return null;
  });

  const selected = useMemo(() => plans.find((p) => p.id === selectedId) ?? null, [plans, selectedId]);

  const biz = user?.businessName || user?.name;
  const greeting = biz ? `Configura tu agente para ${biz}` : 'Elige tu paquete para activar tu agente';

  function onContinue() {
    if (!selected) return;
    try {
      localStorage.setItem(
        PLAN_STORAGE_KEY,
        JSON.stringify({
          id: selected.id,
          name: selected.name,
          priceNum: selected.priceNum,
          period: selected.period,
          totalRow: selected.totalRow,
          chosenAt: new Date().toISOString(),
        })
      );
    } catch {
      /* ignore */
    }
    completePlanSelection();
  }

  return (
    <div id="planHomeScreen" className="auth-screen panel-plan-screen">
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
            <span className="auth-header-mini-icon">
              <LogoMark size={22} alt="" />
            </span>
            Omni<span>ra</span>
          </button>
          <div className="auth-header-actions">
            <button type="button" className="auth-header-link" onClick={closeClientPanel}>
              <i className="fa-solid fa-house" />
              <span> Volver al sitio</span>
            </button>
          </div>
        </div>
      </header>

      <main className="panel-plan-main">
        <div className="panel-plan-glow" aria-hidden />
        <div className="panel-plan-inner">
          <div className="panel-plan-hero reveal visible">
            <div className="eyebrow">
              <span className="eyebrow-dot" /> Tu espacio Omnira
            </div>
            <h1 className="panel-plan-title">
              {greeting}
              <br />
              <span className="gradient-text">WhatsApp con IA</span>
            </h1>
            <p className="panel-plan-lead">
              Tras elegir tu paquete, seguirás al <strong>pago seguro</strong> y al asistente de configuración:{' '}
              <strong>Meta Business</strong> (WhatsApp Cloud API) y, si lo necesitas, <strong>Twilio</strong> para
              mensajería y verificación. Todo enlazado con tu sitio y el widget flotante.
            </p>
          </div>

          <div className="panel-plan-pipeline reveal visible" aria-label="Pasos posteriores al pago">
            <div className="panel-plan-step is-active">
              <span className="panel-plan-step-num">1</span>
              <span className="panel-plan-step-label">Plan</span>
            </div>
            <span className="panel-plan-step-line" aria-hidden />
            <div className="panel-plan-step">
              <span className="panel-plan-step-num">2</span>
              <span className="panel-plan-step-label">Pago</span>
            </div>
            <span className="panel-plan-step-line" aria-hidden />
            <div className="panel-plan-step">
              <span className="panel-plan-step-num">3</span>
              <span className="panel-plan-step-label">Meta / Twilio</span>
            </div>
            <span className="panel-plan-step-line" aria-hidden />
            <div className="panel-plan-step">
              <span className="panel-plan-step-num">4</span>
              <span className="panel-plan-step-label">Agente en vivo</span>
            </div>
          </div>

          <div className="container panel-plan-cards-wrap">
            <div className="plans-grid panel-plan-cards-grid">
              {plansByCheapest.map((plan) => {
                const isSel = selectedId === plan.id;
                const cardClass = [
                  'plan-card',
                  'plan-card-selectable',
                  plan.featured ? 'featured' : '',
                  isSel ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={plan.id}
                    type="button"
                    className={cardClass}
                    onClick={() => setSelectedId(plan.id)}
                    aria-pressed={isSel}
                    aria-label={`Seleccionar plan ${plan.name}`}
                  >
                    {plan.featured ? <div className="plan-ribbon">⚡ Mejor valor</div> : null}
                    <div className={`plan-header${plan.featured ? ' with-ribbon' : ''}`}>
                      <div className="plan-top-meta">
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
                      <div className={`plan-select-hint ${isSel ? 'visible' : ''}`}>
                        <i className="fa-solid fa-circle-check" /> Seleccionado
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass-em panel-plan-trust reveal visible">
            <div className="panel-plan-trust-icon" aria-hidden>
              <i className="fa-brands fa-whatsapp" />
            </div>
            <div>
              <p className="panel-plan-trust-title">Siguiente fase (después del pago)</p>
              <p className="panel-plan-trust-text">
                Conectaremos tu <strong>número de WhatsApp Business</strong> vía Meta, opciones de entrega con{' '}
                <strong>Twilio</strong> donde aplique, y dejaremos listo el contexto del bot y tu hoja de reservas.
              </p>
            </div>
          </div>

          <div className="panel-plan-scroll-spacer" aria-hidden />
        </div>
      </main>

      <footer className="auth-footer">
        <div className="auth-footer-inner">
          <p>© Omnira</p>
          <span className="auth-footer-badge">
            <i className="fa-solid fa-shield-halved" /> Pago seguro con Stripe (próximo paso)
          </span>
          <button type="button" onClick={closeClientPanel} style={{ background: 'none', border: 'none', color: 'var(--em)', cursor: 'pointer', fontWeight: 600 }}>
            Salir al sitio web
          </button>
        </div>
      </footer>

      <div className="panel-plan-sticky" role="region" aria-label="Resumen de plan">
        <div className="panel-plan-sticky-inner">
          <div className="panel-plan-sticky-copy">
            {selected ? (
              <>
                <span className="panel-plan-sticky-label">Paquete elegido</span>
                <strong className="panel-plan-sticky-plan">
                  {selected.name} · €{selected.priceNum}
                  {selected.period}
                </strong>
              </>
            ) : (
              <>
                <span className="panel-plan-sticky-label">Selecciona un plan</span>
                <strong className="panel-plan-sticky-plan muted">Toca una tarjeta arriba</strong>
              </>
            )}
          </div>
          <button
            type="button"
            className="btn-primary panel-plan-cta"
            disabled={!selected}
            onClick={onContinue}
          >
            Continuar al pago y configuración
            <i className="fa-solid fa-arrow-right" />
          </button>
        </div>
      </div>
    </div>
  );
}
