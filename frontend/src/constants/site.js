/** Public logo URL (favicon + navbar) */
export const SITE_LOGO_URL = 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png';

/**
 * Default to deployed backend API.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://omnira-backend.vercel.app';
export const API_FALLBACK_BASE = import.meta.env.VITE_API_FALLBACK_BASE ?? 'http://localhost:5000';

