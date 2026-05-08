import { API_BASE } from '../constants/site.js';

function isAuthEndpoint(endpoint) {
  return (
    endpoint.startsWith('/api/customer/') ||
    endpoint.startsWith('/api/admin/') ||
    endpoint.startsWith('/api/auth/')
  );
}

export async function apiCall(endpoint, opts = {}) {
  const sess = JSON.parse(localStorage.getItem('omnira_session') || '{}');
  const headers = { 'Content-Type': 'application/json' };
  if (sess.token) headers.Authorization = `Bearer ${sess.token}`;

  let r;
  try {
    r = await fetch(API_BASE + endpoint, {
      ...opts,
      headers: { ...headers, ...(opts.headers || {}) },
    });
  } catch {
    if (isAuthEndpoint(endpoint)) {
      throw new Error('Auth server unavailable. Please try again.');
    }
    return localFallback(endpoint, opts);
  }

  let j = {};
  try {
    const text = await r.text();
    j = text ? JSON.parse(text) : {};
  } catch {
    if (!r.ok && !isAuthEndpoint(endpoint)) return localFallback(endpoint, opts);
    throw new Error('Respuesta inválida del servidor');
  }

  if (!r.ok) {
    throw new Error(j.message || `Error ${r.status}`);
  }
  return j;
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
      recentConversations: [],
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
