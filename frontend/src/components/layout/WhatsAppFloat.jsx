import { getMarketingWhatsAppUrl } from '../../constants/marketingWhatsApp.js';

export function WhatsAppFloat() {
  const href = getMarketingWhatsAppUrl();

  return (
    <div className="wa-stack">
      <div className="wa-float">
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
