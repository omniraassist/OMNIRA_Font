import { API_BASE, API_FALLBACK_BASE } from '../constants/site.js';

function uniqueBases() {
  return [...new Set([API_BASE, API_FALLBACK_BASE].filter(Boolean))];
}

/**
 * Public site assistant (no auth). Body: { messages: { role, content }[] }
 */
export async function sendPublicChat(messages) {
  const body = JSON.stringify({ messages });
  let lastErr = null;
  for (const base of uniqueBases()) {
    try {
      const r = await fetch(`${base.replace(/\/$/, '')}/api/public/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const text = await r.text();
      let j = {};
      try {
        j = text ? JSON.parse(text) : {};
      } catch {
        lastErr = new Error('Respuesta inválida del servidor');
        continue;
      }
      if (!r.ok) {
        lastErr = new Error(j.message || `Error ${r.status}`);
        continue;
      }
      if (!j.ok || !j.message?.content) {
        lastErr = new Error(j.message || 'Respuesta incompleta');
        continue;
      }
      return j;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No se pudo conectar al asistente.');
}
