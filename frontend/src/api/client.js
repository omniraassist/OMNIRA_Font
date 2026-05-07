import { API_BASE } from '../constants/site.js';

const DEMO_TOKEN = 'demo';

function demoUser(email) {
  const e = (email || 'demo@omnira.app').toLowerCase().trim();
  return {
    id: 'demo_user',
    email: e,
    businessName: 'Clínica demo',
    name: 'Usuario demo',
    plan: 'free',
    botActive: false,
  };
}

function allowDemoLogin() {
  return import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGIN === 'true';
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
    /* network / CORS / offline */
    return localFallback(endpoint, opts);
  }

  let j = {};
  try {
    const text = await r.text();
    j = text ? JSON.parse(text) : {};
  } catch {
    if (!r.ok) return localFallback(endpoint, opts);
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

  if (endpoint === '/api/auth/register') {
    const users = JSON.parse(localStorage.getItem('omnira_users') || '{}');
    const email = body.email.toLowerCase().trim();
    if (users[email]) throw new Error('Email ya registrado. Inicia sesión.');
    const user = {
      id: 'u_' + Date.now(),
      email,
      businessName: body.businessName,
      phone: body.phone || '',
      plan: 'free',
      botActive: false,
      createdAt: new Date().toISOString(),
    };
    users[email] = { ...user, password: body.password };
    localStorage.setItem('omnira_users', JSON.stringify(users));
    return { user, token: 'local_' + user.id };
  }

  if (endpoint === '/api/auth/login') {
    const users = JSON.parse(localStorage.getItem('omnira_users') || '{}');
    const email = (body.email || '').toLowerCase().trim();
    const u = users[email];
    if (u) {
      if (u.password !== body.password) throw new Error('Contraseña incorrecta.');
      const { password, ...user } = u;
      return { user, token: 'local_' + user.id };
    }
    if (allowDemoLogin()) {
      return { user: demoUser(body.email), token: DEMO_TOKEN };
    }
    throw new Error('No existe ninguna cuenta con ese email.');
  }

  if (endpoint === '/api/auth/me') {
    const sess = JSON.parse(localStorage.getItem('omnira_session') || '{}');
    if (!sess.user) throw new Error('Sin sesión');
    if (sess.token === DEMO_TOKEN) {
      return { user: sess.user };
    }
    const users = JSON.parse(localStorage.getItem('omnira_users') || '{}');
    const fresh = Object.values(users).find((u) => u.id === sess.user.id);
    if (!fresh) throw new Error('Sesión inválida');
    const { password, ...user } = fresh;
    return { user };
  }

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
