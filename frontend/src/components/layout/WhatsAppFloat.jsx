import { useEffect, useState } from 'react';
import { getMarketingWhatsAppUrl } from '../../constants/marketingWhatsApp.js';
import { apiCall } from '../../api/client.js';

/**
 * Floating WhatsApp button. Visibility is controlled by the admin from
 * /admin/whatsapp (toggle stored in platform_settings.OMNIRA_WIDGET_WHATSAPP_ENABLED).
 * We default to "enabled" until the fetch resolves so first-paint shows the CTA
 * for repeat visitors (the server caches the answer 30 s and we cache it for
 * the page lifetime here). If the lookup fails (offline, server down), we keep
 * the widget visible — the CTA matters more than a transient blip.
 */
export function WhatsAppFloat() {
  const [enabled, setEnabled] = useState(true);
  const href = getMarketingWhatsAppUrl();

  useEffect(() => {
    let cancelled = false;
    apiCall('/api/public/widget-settings')
      .then((res) => {
        if (cancelled) return;
        if (res && res.whatsapp_widget_enabled === false) setEnabled(false);
      })
      .catch(() => { /* fail open — keep widget visible */ });
    return () => { cancelled = true; };
  }, []);

  if (!enabled) return null;

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
