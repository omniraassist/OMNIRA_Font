import { API_BASE } from '../constants/site.js';

/**
 * Public site assistant (no auth). Body: { messages: { role, content }[] }
 *
 * - **Development:** same-origin `/api/public/chat` → Vite proxy → local server.
 * - **Production:** always `API_BASE` (defaults to https://omnira-backend.vercel.app), never localhost.
 */
export function resolvePublicChatUrl() {
  if (import.meta.env.DEV) {
    return '/api/public/chat';
  }
  const base = API_BASE.replace(/\/$/, '');
  return `${base}/api/public/chat`;
}

export async function sendPublicChat(messages) {
  const url = resolvePublicChatUrl();
  const body = JSON.stringify({ messages });
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await r.text();
  let j = {};
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Respuesta inválida del servidor');
  }
  if (!r.ok) {
    throw new Error(j.message || `Error ${r.status}`);
  }
  if (!j.ok || !j.message?.content) {
    throw new Error(j.message || 'Respuesta incompleta');
  }
  return j;
}
