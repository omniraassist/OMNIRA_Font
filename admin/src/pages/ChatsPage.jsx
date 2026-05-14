import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-ES'); } catch { return '—'; }
}

const CHAT_STATUS_LABEL_ES = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Cualificado',
  converted: 'Convertido',
  lost: 'Perdido',
};
function chatStatusLabel(s) { return CHAT_STATUS_LABEL_ES[s] || s || '—'; }
function shortPreview(text, len = 110) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > len ? `${s.slice(0, len)}…` : s;
}

const STYLES = `
  .c-page { display: flex; flex-direction: column; gap: 14px; }

  .c-toolbar {
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    padding: 12px 14px;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
  }
  .c-search {
    flex: 1; min-width: 200px;
    display: flex; align-items: center; gap: 8px;
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 12px;
  }
  .c-search:focus-within { border-color: var(--em); }
  .c-search input { flex: 1; background: transparent; border: 0; color: var(--text); font-size: 13px; outline: none; }
  .c-refresh {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--soft);
    padding: 8px 14px; border-radius: 10px; cursor: pointer; font-size: 13px;
    display: inline-flex; align-items: center; gap: 6px; transition: all .15s ease;
  }
  .c-refresh:hover { color: var(--em); border-color: var(--border-em); }
  .c-counter { color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 11px; margin-left: auto; }

  .c-grid {
    display: grid;
    grid-template-columns: minmax(300px, 360px) 1fr;
    gap: 14px;
    align-items: stretch;
  }

  /* List pane */
  .c-list {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 0;
    max-height: 720px;
    overflow-y: auto;
    display: flex; flex-direction: column;
  }
  .c-list-empty { padding: 20px; color: var(--muted); font-size: 13px; }

  .c-row {
    text-align: left;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--border);
    padding: 13px 14px;
    cursor: pointer;
    color: inherit;
    font: inherit;
    display: flex; flex-direction: column; gap: 5px;
    transition: background .15s ease;
  }
  .c-row:hover { background: rgba(255,255,255,0.03); }
  .c-row.active { background: rgba(0,229,160,0.05); border-left: 3px solid var(--em); padding-left: 11px; }
  .c-row-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .c-row-top strong { font-size: 13.5px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c-row-top .ts { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--muted); flex-shrink: 0; }
  .c-row-mid { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
  .c-row-prev { font-size: 12.5px; color: var(--soft); line-height: 1.45; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .c-row-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .c-tag { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; letter-spacing: .04em; text-transform: uppercase; }
  .c-tag.green { background: rgba(0,229,160,0.12); color: var(--em); }
  .c-tag.blue { background: rgba(96,165,250,0.14); color: #93c5fd; }
  .c-tag.amber { background: rgba(251,191,36,0.12); color: #fde68a; }
  .c-tag.grey { background: rgba(148,163,184,0.12); color: var(--soft); }
  .c-tag.intent { background: rgba(192,132,252,0.14); color: #c4b5fd; }
  .c-row .em { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }

  /* Thread pane */
  .c-thread {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    display: flex; flex-direction: column;
    min-height: 480px;
    max-height: 720px;
  }
  .c-thread-empty {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: var(--muted); font-size: 13px;
    padding: 24px; text-align: center;
  }

  .c-thread-head {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center; gap: 10px;
    flex-wrap: wrap;
  }
  .c-thread-head .who { font-weight: 700; color: var(--text); font-size: 14px; }
  .c-thread-head .sub { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); margin-top: 2px; }
  .c-back {
    display: none; /* desktop hidden */
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
    padding: 7px 12px;
    border-radius: 10px;
    cursor: pointer; font-size: 12px; font-weight: 600;
    align-items: center; gap: 6px;
  }
  .c-back:hover { color: var(--em); border-color: var(--border-em); }
  .c-thread-lead-link {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px;
    background: rgba(0,229,160,0.08);
    border: 1px solid var(--border-em);
    border-radius: 10px;
    color: var(--em);
    text-decoration: none;
    font-size: 12px; font-weight: 600;
    transition: all .15s ease;
  }
  .c-thread-lead-link:hover { background: rgba(0,229,160,0.12); }

  .c-msgs {
    flex: 1; overflow-y: auto;
    padding: 14px 16px;
    display: flex; flex-direction: column; gap: 8px;
    background: rgba(0,0,0,0.18);
  }
  .c-msg {
    max-width: 78%;
    padding: 9px 12px;
    border-radius: 12px;
    border: 1px solid var(--border);
    animation: c-rise .2s ease-out both;
  }
  @keyframes c-rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .c-msg.in { align-self: flex-start; background: rgba(255,255,255,0.04); }
  .c-msg.out { align-self: flex-end; background: rgba(0,229,160,0.10); border-color: rgba(0,229,160,0.22); }
  .c-msg .who { font-size: 10px; color: var(--muted); margin-bottom: 3px; }
  .c-msg .body { white-space: pre-wrap; word-wrap: break-word; font-size: 13px; color: var(--text); line-height: 1.5; }

  .c-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; }
  .c-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }

  /* ============================ MOBILE ============================ */
  @media (max-width: 880px) {
    .c-grid {
      grid-template-columns: 1fr;
      position: relative;
    }
    .c-list { max-height: calc(100dvh - 230px); }
    .c-thread {
      max-height: none;
      min-height: calc(100dvh - 160px);
    }
    /* On mobile, hide the list when a chat is open and show only the thread */
    .c-grid.mobile-detail .c-list { display: none; }
    .c-grid.mobile-detail .c-back { display: inline-flex; }
    /* When no chat is open, hide the empty-thread placeholder to avoid wasted space */
    .c-grid:not(.mobile-detail) .c-thread { display: none; }
  }
`;

export function ChatsPage() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/wa-conversations?limit=300');
      setConversations(res.conversations || []);
    } catch (e) {
      setConversations([]);
      setError(e?.message || 'No se pudieron cargar las conversaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadThread = useCallback(async (c) => {
    setActive(c);
    setMessages([]);
    setMessagesLoading(true);
    try {
      const res = await apiCall(`/api/admin/wa-messages?from=${encodeURIComponent(c.wa_from)}&limit=500`);
      setMessages((res.messages || []).slice().reverse());
    } catch (e) {
      setError(e?.message || 'No se pudo cargar la conversación');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const closeThread = () => setActive(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const needle = search.trim().toLowerCase();
    return conversations.filter((c) => {
      const lead = c.lead || {};
      return (
        c.wa_from.toLowerCase().includes(needle) ||
        String(c.last_body || '').toLowerCase().includes(needle) ||
        String(lead.name || '').toLowerCase().includes(needle) ||
        String(lead.email || '').toLowerCase().includes(needle)
      );
    });
  }, [conversations, search]);

  const isMobile = typeof window !== 'undefined' ? window.matchMedia('(max-width: 880px)').matches : false;

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>Chats de WhatsApp</h1>
        <p>Todas las conversaciones del número de WhatsApp de Omnira. Pulsa una para ver el ida y vuelta completo entre el usuario y el agente.</p>
      </header>

      <div className="c-page">
        <div className="c-toolbar">
          <label className="c-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ color: 'var(--muted)' }}>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Buscar por número / nombre / email / mensaje…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button type="button" className="c-refresh" onClick={load} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M3 12a9 9 0 0 1 15.5-6.3M21 4v6h-6M21 12a9 9 0 0 1-15.5 6.3M3 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
          <span className="c-counter">{filtered.length} / {conversations.length}</span>
        </div>

        {error ? <div className="c-banner err"><strong>Error:</strong> {error}</div> : null}

        <div className={`c-grid${active ? ' mobile-detail' : ''}`}>
          {/* LIST */}
          <aside className="c-list">
            {!filtered.length && !loading ? (
              <div className="c-list-empty">
                Aún no hay conversaciones. Cuando los usuarios escriban al número de WhatsApp de Omnira, las conversaciones aparecerán aquí.
              </div>
            ) : null}
            {filtered.map((c) => {
              const isActive = active && active.wa_from === c.wa_from && active.phone_number_id === c.phone_number_id;
              return (
                <button
                  key={`${c.phone_number_id || ''}|${c.wa_from}`}
                  type="button"
                  className={`c-row${isActive ? ' active' : ''}`}
                  onClick={() => loadThread(c)}
                >
                  <div className="c-row-top">
                    <strong>{c.lead?.name || `+${c.wa_from}`}</strong>
                    <span className="ts">{formatDate(c.last_at)}</span>
                  </div>
                  <div className="c-row-mid">
                    <span>+{c.wa_from}</span>
                    <span>{c.message_count} msjs</span>
                  </div>
                  <div className="c-row-prev">{shortPreview(c.last_body)}</div>
                  {c.lead ? (
                    <div className="c-row-tags">
                      <span className={`c-tag ${c.lead.status === 'lost' ? 'grey' : c.lead.status === 'qualified' ? 'amber' : c.lead.status === 'converted' ? 'green' : 'blue'}`}>
                        {chatStatusLabel(c.lead.status)}
                      </span>
                      {c.lead.intent ? <span className="c-tag intent">{c.lead.intent}</span> : null}
                      {c.lead.email ? <span className="em">{c.lead.email}</span> : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </aside>

          {/* THREAD */}
          <section className="c-thread">
            {!active ? (
              <div className="c-thread-empty">Selecciona una conversación a la izquierda para ver el chat completo.</div>
            ) : (
              <>
                <div className="c-thread-head">
                  <button type="button" className="c-back" onClick={closeThread}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Atrás
                  </button>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="who">{active.lead?.name || `+${active.wa_from}`}</div>
                    <div className="sub">+{active.wa_from} · {active.message_count} mensajes · {formatDate(active.last_at)}</div>
                  </div>
                  {active.lead ? (
                    <a href="/leads" className="c-thread-lead-link" onClick={(e) => e.stopPropagation()}>Abrir lead →</a>
                  ) : null}
                </div>

                <div className="c-msgs">
                  {messagesLoading ? (
                    <span style={{ color: 'var(--muted)' }}>Cargando mensajes…</span>
                  ) : messages.length === 0 ? (
                    <span style={{ color: 'var(--muted)' }}>No hay mensajes guardados para esta conversación.</span>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`c-msg ${m.direction === 'outbound' ? 'out' : 'in'}`}>
                        <div className="who">
                          {m.direction === 'outbound' ? 'Agente Omnira' : `+${active.wa_from}`} · {formatDate(m.created_at)}
                        </div>
                        <div className="body">{m.body}</div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
