import { CountUp } from '../CountUp.jsx';

export function BenefitsSection() {
  return (
    <section id="beneficios" className="section section-light">
      <div className="container">
        <div className="section-header reveal">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> Beneficios
          </div>
          <h2>Todo lo que ganas con Omnira</h2>
          <p>Resultados reales desde el primer día de uso en más de 120 negocios de toda España.</p>
        </div>

        <div className="ben-grid">
          <div className="glass ben-card reveal reveal-d1" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="ben-card-glow" />
            <span className="ben-num">001</span>
            <div className="ben-icon"><i className="fa-solid fa-calendar-check" /></div>
            <div className="ben-metric"><CountUp target={42} prefix="+" suffix="%" /></div>
            <div className="ben-sub">más citas al mes</div>
            <h3>Más citas sin esfuerzo</h3>
            <p>Tu agenda se llena sola. Los clientes reservan a cualquier hora y el sistema lo gestiona todo automáticamente.</p>
          </div>
          <div className="glass ben-card reveal reveal-d2" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="ben-card-glow" />
            <span className="ben-num">002</span>
            <div className="ben-icon"><i className="fa-solid fa-globe" /></div>
            <div className="ben-metric">24/7</div>
            <div className="ben-sub">disponibilidad total</div>
            <h3>Atención automática</h3>
            <p>Nunca pierdas un cliente por estar ocupado o dormido. Omnira siempre está disponible para responder.</p>
          </div>
          <div className="glass ben-card reveal reveal-d3" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="ben-card-glow" />
            <span className="ben-num">003</span>
            <div className="ben-icon"><i className="fa-solid fa-bolt" /></div>
            <div className="ben-metric"><CountUp target={8} suffix="h" /></div>
            <div className="ben-sub">ahorradas a la semana</div>
            <h3>Ahorro real de tiempo</h3>
            <p>Elimina horas de mensajes repetitivos. Céntrate en tus pacientes y en hacer crecer tu negocio.</p>
          </div>
          <div className="glass ben-card reveal reveal-d4" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="ben-card-glow" />
            <span className="ben-num">004</span>
            <div className="ben-icon"><i className="fa-solid fa-gem" /></div>
            <div className="ben-metric"><CountUp target={4.9} suffix="★" decimals={1} /></div>
            <div className="ben-sub">satisfacción media</div>
            <h3>Mejor experiencia</h3>
            <p>Respuestas instantáneas, confirmaciones claras y recordatorios automáticos mejoran cada interacción.</p>
          </div>
        </div>

        <div className="testi-grid">
          <div className="glass testi-card testi-card-v2 reveal reveal-d1" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="testi-v2-head">
              <div className="testi-av-sq">
                <img
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop&crop=face"
                  alt="Carla M."
                  loading="lazy"
                />
              </div>
              <div>
                <div className="testi-name">Carla M.</div>
                <div className="testi-role">Centro de Estética · Madrid</div>
              </div>
            </div>
            <div className="testi-stars">
              <i className="fa-solid fa-star" /><i className="fa-solid fa-star" />
              <i className="fa-solid fa-star" /><i className="fa-solid fa-star" />
              <i className="fa-solid fa-star" />
            </div>
            <p className="testi-quote">
              Desde que uso Omnira, mi agenda está siempre llena. No puedo creer que antes lo hacía todo a mano. El tiempo
              que he recuperado es increíble.
            </p>
          </div>
          <div className="glass testi-card testi-card-v2 reveal reveal-d2" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="testi-v2-head">
              <div className="testi-av-sq">
                <img
                  src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face"
                  alt="David R."
                  loading="lazy"
                />
              </div>
              <div>
                <div className="testi-name">David R.</div>
                <div className="testi-role">Fisioterapeuta · Barcelona</div>
              </div>
            </div>
            <div className="testi-stars">
              <i className="fa-solid fa-star" /><i className="fa-solid fa-star" />
              <i className="fa-solid fa-star" /><i className="fa-solid fa-star" />
              <i className="fa-solid fa-star" />
            </div>
            <p className="testi-quote">
              Los clientes me dicen que adoran la rapidez. Reservan a las 11 de la noche y todo funciona solo. Ha
              transformado completamente mi clínica.
            </p>
          </div>
          <div className="glass testi-card testi-card-v2 reveal reveal-d3" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="testi-v2-head">
              <div className="testi-av-sq">
                <img
                  src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&h=80&fit=crop&crop=face"
                  alt="Sofía L."
                  loading="lazy"
                />
              </div>
              <div>
                <div className="testi-name">Sofía L.</div>
                <div className="testi-role">Clínica Dental · Valencia</div>
              </div>
            </div>
            <div className="testi-stars">
              <i className="fa-solid fa-star" /><i className="fa-solid fa-star" />
              <i className="fa-solid fa-star" /><i className="fa-solid fa-star" />
              <i className="fa-solid fa-star" />
            </div>
            <p className="testi-quote">
              He recuperado 2 horas al día que antes perdía respondiendo siempre lo mismo. Ahora me centro en mis
              pacientes. Increíble herramienta.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
