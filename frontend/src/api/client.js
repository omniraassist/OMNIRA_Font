import { API_BASE, API_FALLBACK_BASE } from '../constants/site.js';

function isAuthEndpoint(endpoint) {
  return (
    endpoint.startsWith('/api/customer/') ||
    endpoint.startsWith('/api/admin/') ||
    endpoint.startsWith('/api/auth/')
  );
}

function normalizeBase(b) {
  return String(b || '')
    .trim()
    .replace(/\/$/, '');
}

/** Primary then fallback backend origins (deduped). */
function orderedApiBases() {
  const a = normalizeBase(API_BASE);
  const b = normalizeBase(API_FALLBACK_BASE);
  const out = [];
  if (a) out.push(a);
  if (b && b !== a) out.push(b);
  return out.length ? out : ['http://localhost:5000'];
}

function joinUrl(base, endpoint) {
  const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${ep}`;
}

export async function apiCall(endpoint, opts = {}) {
  const sess = JSON.parse(localStorage.getItem('omnira_session') || '{}');
  const headers = { 'Content-Type': 'application/json' };
  if (sess.token) headers.Authorization = `Bearer ${sess.token}`;

  const requestInit = {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) }
  };

  const bases = orderedApiBases();
  let lastNetworkError = null;

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    let r;
    try {
      r = await fetch(joinUrl(base, endpoint), requestInit);
    } catch (err) {
      lastNetworkError = err;
      continue;
    }

    let j = {};
    let text = '';
    try {
      text = await r.text();
      j = text ? JSON.parse(text) : {};
    } catch {
      if (!r.ok && !isAuthEndpoint(endpoint)) return localFallback(endpoint, opts);
      const retryableStatus = r.status >= 502 && r.status <= 504;
      if (retryableStatus && i < bases.length - 1 && isAuthEndpoint(endpoint)) continue;
      throw new Error('Respuesta inválida del servidor');
    }

    if (!r.ok) {
      const retryable = [500, 502, 503, 504].includes(r.status);
      if (retryable && i < bases.length - 1 && isAuthEndpoint(endpoint)) {
        continue;
      }
      throw new Error(j.message || `Error ${r.status}`);
    }

    return j;
  }

  if (isAuthEndpoint(endpoint)) {
    const hint =
      bases.length > 1
        ? ' No se pudo conectar con el API (Vercel ni local). Comprueba que el servidor esté en marcha y las URLs en .env (VITE_API_BASE / VITE_API_FALLBACK_BASE).'
        : ' No se pudo conectar con el servidor. Inténtalo de nuevo.';
    throw new Error((lastNetworkError && lastNetworkError.message) || `Auth server unavailable.${hint}`);
  }

  return localFallback(endpoint, opts);
}

function localFallback(endpoint, opts) {
  const body = opts.body ? JSON.parse(opts.body) : {};
  const uid = () => JSON.parse(localStorage.getItem('omnira_session') || '{}').user?.id || 'anon';

  if (endpoint === '/api/events' && (!opts.method || opts.method === 'GET')) {
    return JSON.parse(localStorage.getItem('omnira_events_' + uid()) || '[]');
  }
  if (endpoint === '/api/events' && opts.method === 'POST') {
    const all = JSON.parse(localStorage.getItem('omnira_events_' + uid()) || '[]');
    const ev = { ...body, id: 'ev_' + Date.now(), userId: uid(), createdAt: new Date().toISOString() };
    all.push(ev);
    localStorage.setItem('omnira_events_' + uid(), JSON.stringify(all));
    return ev;
  }
  if (endpoint.startsWith('/api/events/') && opts.method === 'PUT') {
    const id = endpoint.split('/').pop();
    let all = JSON.parse(localStorage.getItem('omnira_events_' + uid()) || '[]');
    all = all.map((e) => (e.id === id ? { ...e, ...body } : e));
    localStorage.setItem('omnira_events_' + uid(), JSON.stringify(all));
    return { success: true };
  }
  if (endpoint.startsWith('/api/events/') && opts.method === 'DELETE') {
    const id = endpoint.split('/').pop();
    let all = JSON.parse(localStorage.getItem('omnira_events_' + uid()) || '[]');
    all = all.filter((e) => e.id !== id);
    localStorage.setItem('omnira_events_' + uid(), JSON.stringify(all));
    return { success: true };
  }
  if (endpoint === '/api/dashboard') {
    const all = JSON.parse(localStorage.getItem('omnira_events_' + uid()) || '[]');
    const now = new Date();
    const res = all.filter((e) => {
      const d = new Date(e.datetime);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const upcoming = all
      .filter((e) => new Date(e.datetime) >= now)
      .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    return {
      stats: { reservas: res, mensajes: 0, respuesta: '2s' },
      recentReservations: upcoming.slice(0, 4),
      recentConversations: []
    };
  }
  if (endpoint.includes('/api/business')) {
    if (!opts.method || opts.method === 'GET')
      return JSON.parse(localStorage.getItem('omnira_biz_' + uid()) || '{}');
    localStorage.setItem('omnira_biz_' + uid(), JSON.stringify(body));
    return { success: true };
  }
  if (endpoint.includes('/api/bot')) {
    if (!opts.method || opts.method === 'GET')
      return JSON.parse(localStorage.getItem('omnira_bot_' + uid()) || '{}');
    localStorage.setItem('omnira_bot_' + uid(), JSON.stringify(body));
    return { success: true };
  }
  return {};
}
