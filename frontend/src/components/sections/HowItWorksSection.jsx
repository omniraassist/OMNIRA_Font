export function HowItWorksSection() {
  return (
    <section id="como-funciona" className="section" style={{ background: 'var(--ink2)' }}>
      <div className="container">
        <div className="section-header reveal">
          <h2>
            Automatización en <span className="gradient-text">4 pasos simples</span>
          </h2>
          <p>Sin instalaciones complicadas. Tus clientes reservan cita directamente por WhatsApp.</p>
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

        {/* New registration flow */}
        <div className="section-header reveal" style={{ marginTop: '80px' }}>
          <h2>
            Empieza en <span className="gradient-text">3 pasos</span>
          </h2>
          <p>Sin configuraciones técnicas. Sin conectar cuentas de Meta. El bot está activo desde el primer pago.</p>
        </div>

        <div className="steps-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="steps-connector" />
          <div className="glass step-card reveal reveal-d1" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="step-num-wrap">
              <div className="step-icon">
                <i className="fa-solid fa-user-plus" />
              </div>
              <div className="step-num">01</div>
            </div>
            <h3>Crea tu cuenta</h3>
            <p>Regístrate con tu email y nombre de negocio. En segundos tienes acceso a tu cuenta.</p>
          </div>
          <div className="glass step-card reveal reveal-d2" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="step-num-wrap">
              <div className="step-icon">
                <i className="fa-solid fa-credit-card" />
              </div>
              <div className="step-num">02</div>
            </div>
            <h3>Elige tu plan y paga</h3>
            <p>Selecciona el plan que mejor se adapta a tu negocio y completa el pago de forma segura con Stripe.</p>
          </div>
          <div className="glass step-card reveal reveal-d3" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="step-num-wrap">
              <div className="step-icon">
                <i className="fa-solid fa-rocket" />
              </div>
              <div className="step-num">03</div>
            </div>
            <h3>Bot activo y panel listo</h3>
            <p>Al confirmar el pago, se te asigna un número de WhatsApp exclusivo y el bot queda operativo de inmediato.</p>
          </div>
        </div>

        <div className="glass-em setup-banner reveal" style={{ borderRadius: 'var(--r-xl)', marginTop: '32px' }}>
          <div className="setup-left">
            <div className="setup-icon"><i className="fa-solid fa-rocket" style={{ color: 'var(--em)', fontSize: '24px' }} /></div>
            <div className="setup-text">
              <h3>Activo en menos de 5 minutos</h3>
              <p>Sin pasos manuales, sin configurar Meta ni Twilio. Regístrate, paga y empieza a recibir reservas automáticas hoy mismo.</p>
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
