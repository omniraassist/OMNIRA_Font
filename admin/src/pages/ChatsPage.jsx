import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

function shortPreview(text, len = 110) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > len ? `${s.slice(0, len)}…` : s;
}

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
      setError(e?.message || 'Could not load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadThread = useCallback(async (c) => {
    setActive(c);
    setMessages([]);
    setMessagesLoading(true);
    try {
      const res = await apiCall(`/api/admin/wa-messages?from=${encodeURIComponent(c.wa_from)}&limit=500`);
      const msgs = res.messages || [];
      setMessages(msgs.slice().reverse());
    } catch (e) {
      setError(e?.message || 'Could not load thread');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

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

  return (
    <>
      <header className="adm-page-head">
        <h1>WhatsApp chats</h1>
        <p>Every conversation on the Omnira WhatsApp number. Click a thread on the left to see the full back-and-forth between the user and the agent.</p>
      </header>

      <div className="adm-toolbar">
        <input
          className="adm-search-input"
          style={{ minWidth: 280 }}
          placeholder="Search number / name / email / message"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="adm-btn adm-btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span className="adm-mono" style={{ color: 'var(--muted)' }}>
          {filtered.length} of {conversations.length} threads
        </span>
      </div>

      {error ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Error:</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{error}</span>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 360px) 1fr',
          gap: 14,
          alignItems: 'stretch',
        }}
        className="adm-chats-grid"
      >
        <aside
          className="adm-card"
          style={{ padding: 0, maxHeight: 720, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        >
          {!filtered.length && !loading ? (
            <div style={{ padding: 16, color: 'var(--muted)' }}>
              No conversations yet. When users message the Omnira WhatsApp number, threads appear here.
            </div>
          ) : null}
          {filtered.map((c) => {
            const key = `${c.phone_number_id || ''}|${c.wa_from}`;
            const isActive = active && active.wa_from === c.wa_from && active.phone_number_id === c.phone_number_id;
            return (
              <button
                key={key}
                type="button"
                onClick={() => loadThread(c)}
                style={{
                  textAlign: 'left',
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  color: 'inherit',
                  font: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong>{c.lead?.name || `+${c.wa_from}`}</strong>
                  <span className="adm-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {formatDate(c.last_at)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
                  <span className="adm-mono">+{c.wa_from}</span>
                  <span className="adm-mono">{c.message_count} msg</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{shortPreview(c.last_body)}</div>
                {c.lead ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <span className={`adm-badge ${c.lead.status === 'lost' ? 'paused' : 'active'}`}>{c.lead.status}</span>
                    {c.lead.intent ? (
                      <span className="adm-badge" style={{ background: 'rgba(99,102,241,0.18)', color: '#c7d2fe' }}>
                        {c.lead.intent}
                      </span>
                    ) : null}
                    {c.lead.email ? (
                      <span className="adm-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{c.lead.email}</span>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </aside>

        <section
          className="adm-card"
          style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 480, maxHeight: 720 }}
        >
          {!active ? (
            <div style={{ padding: 20, color: 'var(--muted)' }}>
              Select a conversation on the left to see the full chat.
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{active.lead?.name || `+${active.wa_from}`}</div>
                  <div className="adm-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    +{active.wa_from} · {active.message_count} messages · {formatDate(active.last_at)}
                  </div>
                </div>
                {active.lead ? (
                  <a
                    href={`/leads`}
                    className="adm-btn adm-btn-ghost"
                    style={{ textDecoration: 'none' }}
                  >
                    Open lead
                  </a>
                ) : null}
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  background: 'rgba(0,0,0,0.18)',
                }}
              >
                {messagesLoading ? (
                  <span style={{ color: 'var(--muted)' }}>Loading messages…</span>
                ) : messages.length === 0 ? (
                  <span style={{ color: 'var(--muted)' }}>No stored messages for this thread.</span>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start',
                        maxWidth: '78%',
                        background: m.direction === 'outbound' ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10,
                        padding: '8px 12px',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
                        {m.direction === 'outbound' ? 'Omnira agent' : `+${active.wa_from}`} · {formatDate(m.created_at)}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
