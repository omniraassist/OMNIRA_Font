/** Public logo URL (favicon + navbar) */
export const SITE_LOGO_URL = 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png';

/** Deployed Express API (Vercel). Empty `VITE_API_BASE` falls back here — never rely on localhost in production builds. */
const DEFAULT_BACKEND = 'https://omnira-backend.vercel.app';

function trimOrEmpty(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Primary backend origin (browser `apiCall`). Set `VITE_API_BASE` in `.env.local` / Vercel.
 * Default: deployed Vercel API.
 */
export const API_BASE = trimOrEmpty(import.meta.env.VITE_API_BASE) || DEFAULT_BACKEND;

/**
 * Fallback when the primary host fails (CORS/network/5xx on auth routes). Default: local Express.
 * Set `VITE_API_FALLBACK_BASE` empty to disable second hop.
 */
export const API_FALLBACK_BASE = trimOrEmpty(import.meta.env.VITE_API_FALLBACK_BASE) || 'http://localhost:5000';

