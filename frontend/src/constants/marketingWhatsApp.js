/** Marketing line (Omnira site): opens WhatsApp with the verified business number. */

const DEFAULT_E164_DIGITS = '34682497790';

function digitsOnly(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .trim();
}

/** E.164 digits without + (for wa.me). Override with VITE_MARKETING_WHATSAPP_PHONE. */
export function getMarketingWhatsAppDigits() {
  const fromEnv = digitsOnly(import.meta.env.VITE_MARKETING_WHATSAPP_PHONE);
  return fromEnv || DEFAULT_E164_DIGITS;
}

const DEFAULT_PREFILL =
  'Hola, vengo desde la web de Omnira. Quiero información sobre planes y el agente de WhatsApp para mi negocio.';

/** https://wa.me/… deep link for the floating launcher. */
export function getMarketingWhatsAppUrl() {
  const phone = getMarketingWhatsAppDigits();
  const text = String(import.meta.env.VITE_MARKETING_WHATSAPP_TEXT || '').trim() || DEFAULT_PREFILL;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
