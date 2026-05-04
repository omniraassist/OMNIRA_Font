export function HowItWorksSection() {
  return (
    <section id="como-funciona" className="section" style={{ background: 'var(--ink2)' }}>
      <div className="container">
        <div className="section-header reveal">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> Cómo funciona
          </div>
          <h2>
            Automatización en <span className="gradient-text">4 pasos simples</span>
          </h2>
          <p>Sin instalaciones complicadas. Configuración completa en menos de 30 minutos desde cero.</p>
        </div>

        <div className="steps-grid">
          <div className="steps-connector" />
          <div className="glass step-card reveal reveal-d1" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="step-num-wrap">
              <div className="step-icon">
                <i className="fa-brands fa-whatsapp" />
              </div>
              <div className="step-num">01</div>
            </div>
            <h3>El cliente escribe</h3>
            <p>Tu cliente envía un mensaje a tu número de WhatsApp Business como siempre, sin instalar nada nuevo.</p>
          </div>
          <div className="glass step-card reveal reveal-d2" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="step-num-wrap">
              <div className="step-icon">
                <i className="fa-solid fa-bolt" />
              </div>
              <div className="step-num">02</div>
            </div>
            <h3>Omnira responde al instante</h3>
            <p>Detecta la intención del mensaje y responde automáticamente con información correcta en menos de 2 segundos.</p>
          </div>
          <div className="glass step-card reveal reveal-d3" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="step-num-wrap">
              <div className="step-icon">
                <i className="fa-solid fa-clipboard-list" />
              </div>
              <div className="step-num">03</div>
            </div>
            <h3>Recoge los datos</h3>
            <p>Guía al cliente para elegir servicio, fecha y hora disponible de forma conversacional y completamente natural.</p>
          </div>
          <div className="glass step-card reveal reveal-d4" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="step-num-wrap">
              <div className="step-icon">
                <i className="fa-solid fa-circle-check" />
              </div>
              <div className="step-num">04</div>
            </div>
            <h3>Confirma la cita</h3>
            <p>La cita queda en tu calendario, el cliente recibe su confirmación y tú la notificación. Todo sin intervención.</p>
          </div>
        </div>

        <div className="glass-em setup-banner reveal" style={{ borderRadius: 'var(--r-xl)' }}>
          <div className="setup-left">
            <div className="setup-icon">🚀</div>
            <div className="setup-text">
              <h3>Empieza en menos de 30 minutos</h3>
              <p>Conecta tu WhatsApp Business, configura tus servicios y empieza a recibir reservas automáticas hoy mismo.</p>
            </div>
          </div>
          <a href="#precios" className="btn-primary btn-lg" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            Empezar ahora <i className="fa-solid fa-arrow-right" />
          </a>
        </div>
      </div>
    </section>
  );
}
