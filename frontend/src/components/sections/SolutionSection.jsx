export function SolutionSection() {
  return (
    <section id="solucion" className="section">
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: '900px',
          height: '500px',
          background: 'radial-gradient(ellipse,rgba(0,229,160,0.04),transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="sol-grid">
          <div className="reveal-left">
            <div className="eyebrow">
              <span className="eyebrow-dot" /> La solución
            </div>
            <h2
              style={{
                fontSize: 'clamp(30px,3.8vw,50px)',
                fontWeight: 800,
                color: '#fff',
                marginBottom: '16px',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}
            >
              Omnira trabaja mientras
              <br />
              <span className="gradient-text">tú atiendes</span>
            </h2>
            <p style={{ fontSize: '16px', color: 'var(--soft)', lineHeight: 1.75, maxWidth: '460px' }}>
              Un asistente inteligente conectado a tu WhatsApp Business que automatiza la atención al cliente, gestiona tu
              agenda y confirma citas las 24 horas del día.
            </p>
            <div className="feature-list">
              <div className="feature-item">
                <div className="feature-icon">
                  <i className="fa-solid fa-comments" />
                </div>
                <div>
                  <div className="feature-title">Respuestas automáticas inteligentes</div>
                  <p className="feature-desc">
                    Entiende el contexto y responde con precisión: horarios, precios, servicios disponibles y mucho más.
                  </p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <i className="fa-solid fa-calendar-plus" />
                </div>
                <div>
                  <div className="feature-title">Reservas sin intervención manual</div>
                  <p className="feature-desc">
                    Los clientes seleccionan servicio, fecha y hora directamente en el chat. La cita se confirma sola.
                  </p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <i className="fa-solid fa-bell" />
                </div>
                <div>
                  <div className="feature-title">Recordatorios automáticos</div>
                  <p className="feature-desc">
                    Envía recordatorios de cita por WhatsApp para reducir las cancelaciones de último minuto.
                  </p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <i className="fa-solid fa-chart-line" />
                </div>
                <div>
                  <div className="feature-title">Panel de control centralizado</div>
                  <p className="feature-desc">
                    Visualiza todas las conversaciones, citas y métricas en un dashboard claro e intuitivo.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="reveal-right">
            <div className="dash-mockup">
              <div className="dash-top-bar">
                <div className="dash-traffic">
                  <div className="dash-dot-red" />
                  <div className="dash-dot-yellow" />
                  <div className="dash-dot-green" />
                </div>
                <div className="dash-title-bar">Panel Omnira — Dashboard</div>
                <div className="dash-live">
                  <div className="dash-live-dot" /> En vivo
                </div>
              </div>
              <div className="dash-kpis">
                <div className="dash-kpi">
                  <div className="dash-kpi-val">12</div>
                  <div className="dash-kpi-lbl">Citas hoy</div>
                </div>
                <div className="dash-kpi">
                  <div className="dash-kpi-val">48</div>
                  <div className="dash-kpi-lbl">Mensajes</div>
                </div>
                <div className="dash-kpi">
                  <div className="dash-kpi-val">0</div>
                  <div className="dash-kpi-lbl">Sin leer</div>
                </div>
              </div>
              <div className="dash-body">
                <div className="dash-section-label">Últimas conversaciones</div>
                {[
                  ['M', 'María G.', 'Cita confirmada para el martes ✅', '14:32', 'green'],
                  ['C', 'Carlos R.', '¿Tenéis hueco mañana por la tarde?', '13:17', 'yellow'],
                  ['A', 'Ana P.', 'Recordatorio enviado automáticamente', '12:05', 'green'],
                  ['L', 'Luis M.', 'Cita reprogramada para el viernes', '11:48', 'blue'],
                  ['S', 'Sofía R.', '¿Cuánto cuesta la limpieza facial?', '11:02', 'green'],
                ].map(([av, name, msg, time, st]) => (
                  <div key={name} className="dash-row">
                    <div className="dash-av">{av}</div>
                    <div className="dash-info">
                      <div className="dash-name">{name}</div>
                      <div className="dash-msg">{msg}</div>
                    </div>
                    <div className="dash-meta">
                      <div className="dash-time">{time}</div>
                      <div className={`status-dot status-${st}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
