export function CtaFinalSection() {
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
            <a href="https://buy.stripe.com/REPLACE" className="btn-primary btn-lg">
              <i className="fa-solid fa-rocket" />
              Empezar — desde 49€/mes
            </a>
            <a
              href="https://wa.me/34682497790?text=Hola%2C%20me%20gustar%C3%ADa%20solicitar%20una%20demo%20de%20Omnira"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost btn-lg"
            >
              <i className="fa-brands fa-whatsapp" style={{ color: '#25D366', fontSize: '18px' }} />
              Demo por WhatsApp
            </a>
            <a href="mailto:omniraassist@gmail.com" className="btn-ghost btn-lg">
              <i className="fa-solid fa-envelope" />
              omniraassist@gmail.com
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
