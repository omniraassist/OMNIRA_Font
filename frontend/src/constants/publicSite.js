/** Public site origin for legal/contact links (no trailing slash). */
export function getPublicSiteOrigin() {
  const fromEnv = typeof import.meta.env.VITE_PUBLIC_SITE_URL === 'string' ? import.meta.env.VITE_PUBLIC_SITE_URL.trim() : '';
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return '';
}
