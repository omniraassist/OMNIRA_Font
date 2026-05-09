import { useCallback, useEffect, useRef, useState } from 'react';
import { sendPublicChat } from '../../api/publicChat.js';

const WA_HREF = 'https://wa.me/34682497790?text=Hola%2C%20vengo%20desde%20la%20web%20de%20Omnira';
const WELCOME =
  'Hola, soy el asistente de Omnira. Pregúntame por automatización de WhatsApp, reservas o planes — o abre WhatsApp abajo para hablar con el equipo.';

export function WhatsAppFloat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([{ id: 'w', role: 'assistant', content: WELCOME }]);
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const stackRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDoc = (e) => {
      if (stackRef.current && !stackRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, open, busy]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg = { id: `u-${Date.now()}`, role: 'user', content: text };
    const next = [...msgs, userMsg];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const thread = next.filter((x) => x.role === 'user' || x.role === 'assistant').map(({ role, content }) => ({ role, content }));
      const j = await sendPublicChat(thread);
      setMsgs((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: j.message.content }]);
    } catch (e) {
      const msg = e?.message || 'Error';
      setMsgs((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: `No pude obtener respuesta (${msg}). Prueba otra vez o escríbenos por WhatsApp.`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, msgs]);

  return (
      <div ref={stackRef} className="wa-stack">
        {open ? (
          <div className="wa-chat-panel" role="dialog" aria-modal="true" aria-label="Asistente Omnira">
            <div className="wa-chat-head">
              <div className="wa-chat-head-text">
                <span className="wa-chat-title">Omnira</span>
                <span className="wa-chat-sub">Asistente · respuesta en segundos</span>
              </div>
              <button type="button" className="wa-chat-close" onClick={() => setOpen(false)} aria-label="Cerrar chat">
                ×
              </button>
            </div>
            <div ref={listRef} className="wa-chat-messages">
              {msgs.map((m) => (
                <div key={m.id} className={`wa-bubble wa-bubble--${m.role}`}>
                  {m.content}
                </div>
              ))}
              {busy ? (
                <div className="wa-bubble wa-bubble--assistant wa-bubble--typing" aria-live="polite">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
            </div>
            <div className="wa-chat-foot">
              <textarea
                ref={inputRef}
                className="wa-chat-input"
                rows={1}
                placeholder="Escribe un mensaje…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={busy}
              />
              <button type="button" className="wa-chat-send" onClick={send} disabled={busy || !input.trim()} aria-label="Enviar">
                <i className="fa-solid fa-paper-plane" />
              </button>
            </div>
            <a className="wa-chat-human" href={WA_HREF} target="_blank" rel="noopener noreferrer">
              <i className="fa-brands fa-whatsapp" /> Hablar por WhatsApp con el equipo
            </a>
          </div>
        ) : null}

        <div className="wa-float">
          {!open ? <div className="wa-tooltip">¿Tienes dudas? ¡Chatea o escríbenos!</div> : null}
          <button
            type="button"
            className="wa-btn"
            aria-label={open ? 'Cerrar asistente' : 'Abrir asistente Omnira'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <i className="fa-brands fa-whatsapp" />
          </button>
        </div>

        {!open ? <div className="wa-pulse" aria-hidden /> : null}
      </div>
  );
}
