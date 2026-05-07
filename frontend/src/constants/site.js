/** Public logo URL (favicon + navbar) */
export const SITE_LOGO_URL = 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png';

/**
 * In dev, default to same-origin `/api` so Vite can proxy (avoids CORS on localhost).
 * In production, call the API host unless VITE_API_BASE overrides.
 */
export const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? '' : 'https://remarkable-emotion-production-605f.up.railway.app');

/** When false (default), login skips the API and password — frontend preview only. Set `VITE_USE_AUTH_API=true` to use real backend auth. */
export const USE_REMOTE_AUTH_API = import.meta.env.VITE_USE_AUTH_API === 'true';
