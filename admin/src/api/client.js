const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? '' : 'http://localhost:5000');

export async function apiCall(endpoint, opts = {}) {
  const sess = JSON.parse(sessionStorage.getItem('omnira_admin_session') || '{}');
  const headers = { 'Content-Type': 'application/json' };
  if (sess.token) headers.Authorization = `Bearer ${sess.token}`;

  const r = await fetch(API_BASE + endpoint, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
  });

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
