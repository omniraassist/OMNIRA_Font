const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://omnira-backend.vercel.app';
const API_FALLBACK_BASE = import.meta.env.VITE_API_FALLBACK_BASE ?? 'http://localhost:5000';

export async function apiCall(endpoint, opts = {}) {
  const sess = JSON.parse(sessionStorage.getItem('omnira_admin_session') || '{}');
  const headers = { 'Content-Type': 'application/json' };
  if (sess.token) headers.Authorization = `Bearer ${sess.token}`;

  const requestInit = {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
  };

  let r;
  try {
    r = await fetch(API_BASE + endpoint, requestInit);
  } catch {
    r = await fetch(API_FALLBACK_BASE + endpoint, requestInit);
  }

  let j = {};
  try {
    const text = await r.text();
    j = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Invalid server response');
  }

  if (!r.ok) throw new Error(j.message || `Error ${r.status}`);
  return j;
}
