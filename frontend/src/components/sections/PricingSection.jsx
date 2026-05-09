export function PricingSection() {
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
          <div className="plan-card">
            <div className="plan-header">
              <div className="plan-top-meta" aria-hidden="true" />
              <div className="plan-name">1 mes</div>
              <div className="plan-price-row">
                <span className="plan-cur">€</span>
                <span className="plan-num">49</span>
                <span className="plan-period">/mes</span>
              </div>
              <div className="plan-total-row">Precio total: 49€ · Sin permanencia</div>
            </div>
            <div className="plan-body">
              <div className="plan-divider" />
              <div className="plan-feats">
                {[
                  'Bot con IA 24/7',
                  'Reservas automáticas',
                  'Conexión con calendario',
                  'Recordatorios automáticos',
                  'Activación inmediata',
                  'Soporte incluido',
                ].map((t) => (
                  <div key={t} className="plan-feat">
                    <div className="feat-check">
                      <i className="fa-solid fa-check" />
                    </div>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
              <a href="https://buy.stripe.com/REPLACE_1M" className="plan-cta">
                Empezar ahora →
              </a>
              <p className="plan-note">🔒 Pago seguro · Cancela cuando quieras</p>
            </div>
          </div>

          <div className="plan-card">
            <div className="plan-header">
              <div className="plan-top-meta">
                <span className="plan-saving">✦ Ahorras 18€</span>
              </div>
              <div className="plan-name">3 meses</div>
              <div className="plan-price-row">
                <span className="plan-cur">€</span>
                <span className="plan-num">43</span>
                <span className="plan-period">/mes</span>
              </div>
              <div className="plan-total-row">
                Total: <strong>129€</strong> · Equivalente mensual
              </div>
            </div>
            <div className="plan-body">
              <div className="plan-divider" />
              <div className="plan-feats">
                {[
                  'Todo del plan mensual',
                  'Activación automática',
                  'Reservas ilimitadas',
                  'Conexión con calendario',
                  'Recordatorios automáticos',
                  'Soporte prioritario',
                ].map((t) => (
                  <div key={t} className="plan-feat">
                    <div className="feat-check">
                      <i className="fa-solid fa-check" />
                    </div>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
              <a href="https://buy.stripe.com/REPLACE_3M" className="plan-cta">
                Empezar ahora →
              </a>
              <p className="plan-note">🔒 Pago único trimestral</p>
            </div>
          </div>

          <div className="plan-card">
            <div className="plan-header">
              <div className="plan-top-meta">
                <span className="plan-saving">✦ Ahorras 65€</span>
              </div>
              <div className="plan-name">6 meses</div>
              <div className="plan-price-row">
                <span className="plan-cur">€</span>
                <span className="plan-num">38</span>
                <span className="plan-period">/mes</span>
              </div>
              <div className="plan-total-row">
                Total: <strong>229€</strong> · Equivalente mensual
              </div>
            </div>
            <div className="plan-body">
              <div className="plan-divider" />
              <div className="plan-feats">
                {[
                  'Todo del plan mensual',
                  'Activación automática',
                  'Reservas ilimitadas',
                  'Conexión con calendario',
                  'Recordatorios automáticos',
                  'Soporte prioritario VIP',
                ].map((t) => (
                  <div key={t} className="plan-feat">
                    <div className="feat-check">
                      <i className="fa-solid fa-check" />
                    </div>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
              <a href="https://buy.stripe.com/REPLACE_6M" className="plan-cta">
                Empezar ahora →
              </a>
              <p className="plan-note">🔒 Pago único semestral</p>
            </div>
          </div>

          <div className="plan-card featured">
            <div className="plan-ribbon">⚡ Mejor valor</div>
            <div className="plan-header with-ribbon">
              <div className="plan-top-meta">
                <span className="plan-saving hot">🔥 Ahorras 189€</span>
              </div>
              <div className="plan-name">12 meses</div>
              <div className="plan-price-row">
                <span className="plan-cur">€</span>
                <span className="plan-num featured-num">33</span>
                <span className="plan-period">/mes</span>
              </div>
              <div className="plan-total-row">
                Total: <strong>399€</strong> · Equivalente mensual
              </div>
            </div>
            <div className="plan-body">
              <div className="plan-divider" />
              <div className="plan-feats">
                {[
                  'Todo del plan mensual',
                  'Activación automática',
                  'Reservas ilimitadas',
                  'Conexión con calendario',
                  'Recordatorios automáticos',
                  'Soporte prioritario VIP',
                ].map((t) => (
                  <div key={t} className="plan-feat">
                    <div className="feat-check">
                      <i className="fa-solid fa-check" />
                    </div>
                    <span>{t}</span>
                  </div>
                ))}
                <div className="plan-feat">
                  <div className="feat-check gold-check">
                    <i className="fa-solid fa-check" />
                  </div>
                  <span className="gold-feat">Consultoría mensual 1h</span>
                </div>
              </div>
              <a href="https://buy.stripe.com/REPLACE_12M" className="plan-cta primary-cta">
                Empezar ahora →
              </a>
              <p className="plan-note">🔒 Pago único anual</p>
            </div>
          </div>
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
