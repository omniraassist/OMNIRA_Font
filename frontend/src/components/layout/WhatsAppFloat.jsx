import { getMarketingWhatsAppUrl } from '../../constants/marketingWhatsApp.js';

export function WhatsAppFloat() {
  const href = getMarketingWhatsAppUrl();

  return (
    <div className="wa-stack">
      <div className="wa-float">
        <div className="wa-tooltip" role="note">
          <strong>Asistente Omnira en WhatsApp</strong>, activo 24/7: planes, precios y cómo automatizar reservas.
          Para <strong>tu propio</strong> agente en tu número, regístrate y conecta{' '}
          <strong>WhatsApp Business verificado con Meta</strong>.
        </div>
        <a
          className="wa-btn"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir conversación en WhatsApp con Omnira"
        >
          <i className="fa-brands fa-whatsapp" aria-hidden />
        </a>
      </div>
      <div className="wa-pulse" aria-hidden />
    </div>
  );
}
