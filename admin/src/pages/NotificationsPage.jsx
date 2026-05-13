import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const STYLES = `
  .n-grid { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 18px; align-items: flex-start; }
  @media (max-width: 980px) { .n-grid { grid-template-columns: 1fr; } }

  .n-card {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 22px;
  }
  .n-card.em { border-color: var(--border-em); }
  .n-card h3 { margin: 0 0 4px; font-family: var(--font-display); font-size: 15px; color: var(--text); letter-spacing: .04em; text-transform: uppercase; }
  .n-card p.sub { margin: 0 0 18px; color: var(--soft); font-size: 13px; line-height: 1.5; }

  .n-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .n-field label { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .n-field input, .n-field textarea, .n-field select {
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 11px 12px;
    color: var(--text);
    font-size: 14px;
    font-family: inherit;
    transition: border-color .15s ease, background .15s ease;
  }
  .n-field input:focus, .n-field textarea:focus, .n-field select:focus {
    outline: none; border-color: var(--em); background: rgba(0,0,0,0.45);
  }
  .n-field textarea { min-height: 120px; resize: vertical; line-height: 1.5; }
  .n-counter { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; align-self: flex-end; }

  .n-btn {
    background: linear-gradient(180deg, var(--em) 0%, var(--em2) 100%);
    color: #00120a; font-weight: 700;
    border: 0; border-radius: 10px;
    padding: 12px 22px;
    cursor: pointer; transition: filter .15s ease, transform .15s ease;
    width: 100%;
  }
  .n-btn:disabled { filter: grayscale(.6) brightness(.7); cursor: not-allowed; }
  .n-btn:not(:disabled):hover { filter: brightness(1.08); }

  .n-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; margin-bottom: 14px; }
  .n-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .n-banner.ok  { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }

  .n-list-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
  .n-list-head h3 { margin: 0; font-family: var(--font-display); font-size: 15px; color: var(--text); letter-spacing: .04em; text-transform: uppercase; }
  .n-list-head span { color: var(--muted); font-size: 12px; }

  .n-search-row {
    display: flex; gap: 8px; margin-bottom: 14px;
  }
  .n-search-row input, .n-search-row select {
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    color: var(--text);
    font-size: 13px;
  }
  .n-search-row input { flex: 1; }
  .n-search-row input:focus, .n-search-row select:focus { outline: none; border-color: var(--em); }

  .n-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    padding: 16px;
    background: var(--surf2);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 10px;
    transition: border-color .15s ease;
  }
  .n-row:hover { border-color: rgba(255,255,255,0.12); }
  .n-row.disabled { opacity: 0.55; }
  .n-row .body { min-width: 0; }
  .n-row .title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .n-row .msg { font-size: 13px; color: var(--soft); line-height: 1.55; margin-bottom: 8px; word-wrap: break-word; }
  .n-row .meta { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
  .n-row .target {
    background: rgba(0,229,160,0.10);
    color: var(--em);
    padding: 2px 8px;
    border-radius: 999px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
  }
  .n-row .target.all { background: rgba(96,165,250,0.12); color: #93c5fd; }
  .n-row .actions { display: flex; gap: 6px; flex-shrink: 0; align-items: flex-start; }

  .n-icon-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
    width: 32px; height: 32px;
    border-radius: 8px;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: all .15s ease;
    font-size: 14px;
  }
  .n-icon-btn:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }
  .n-icon-btn.toggle.active { color: var(--em); border-color: var(--border-em); background: rgba(0,229,160,0.10); }
  .n-icon-btn.danger:hover { color: #fca5a5; border-color: rgba(239,68,68,0.40); background: rgba(239,68,68,0.10); }

  .n-empty { padding: 28px; text-align: center; color: var(--muted); font-size: 13px; }
`;

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsPage() {
  const { user } = useAdminAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  // compose form
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/notifications');
      setList(res.notifications || []);
    } catch (e) {
      setError(e?.message || 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setError('Title and message are required.');
      return;
    }
    setSending(true);
    setError(''); setInfo('');
    try {
      await apiCall('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          target_email: targetEmail.trim() || '',
          created_by: user?.email || 'admin',
        }),
      });
      setTitle(''); setMessage(''); setTargetEmail('');
      setInfo(
        targetEmail.trim()
          ? `Notification sent to ${targetEmail.trim()}.`
          : 'Notification posted to all customers.'
      );
      await load();
    } catch (e) {
      setError(e?.message || 'Could not send notification');
    } finally {
      setSending(false);
    }
  };

  const toggleActive = async (n) => {
    try {
      await apiCall(`/api/admin/notifications/${n.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !n.is_active }),
      });
      await load();
    } catch (e) {
      setError(e?.message || 'Could not toggle');
    }
  };

  const remove = async (n) => {
    if (!window.confirm(`Delete notification "${n.title}"? This cannot be undone.`)) return;
    try {
      await apiCall(`/api/admin/notifications/${n.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e?.message || 'Could not delete');
    }
  };

  const filtered = useMemo(() => {
    let arr = list;
    if (filter === 'active') arr = arr.filter((n) => n.is_active !== false);
    if (filter === 'inactive') arr = arr.filter((n) => n.is_active === false);
    if (filter === 'targeted') arr = arr.filter((n) => n.target_email);
    if (filter === 'broadcast') arr = arr.filter((n) => !n.target_email);
    if (search.trim()) {
      const needle = search.toLowerCase();
      arr = arr.filter(
        (n) =>
          String(n.title || '').toLowerCase().includes(needle) ||
          String(n.message || '').toLowerCase().includes(needle) ||
          String(n.target_email || '').toLowerCase().includes(needle)
      );
    }
    return arr;
  }, [list, search, filter]);

  const stats = useMemo(() => {
    const total = list.length;
    const active = list.filter((n) => n.is_active !== false).length;
    const targeted = list.filter((n) => n.target_email).length;
    return { total, active, broadcast: total - targeted };
  }, [list]);

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>Notifications</h1>
        <p>
          Send a notification to all customers or to a specific email. Active notifications appear in each
          customer's dashboard (bell icon). Inactive ones are kept for history but not delivered. All counts and
          dates below come straight from <code>user_notifications</code>.
        </p>
      </header>

      {error ? <div className="n-banner err"><strong>Error:</strong> {error}</div> : null}
      {info ? <div className="n-banner ok"><strong>OK:</strong> {info}</div> : null}

      <div className="n-grid">
        <section className="n-card em">
          <h3>Compose</h3>
          <p className="sub">Plain text. Markdown is not parsed. Customer sees this exactly as written.</p>
          <form onSubmit={submit}>
            <div className="n-field">
              <label>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                placeholder="Maintenance window tonight"
                maxLength={200}
                required
              />
              <span className="n-counter">{title.length} / 200</span>
            </div>
            <div className="n-field">
              <label>Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
                placeholder="We will deploy a database update tonight from 23:00 to 23:30 UTC. The agent may be unavailable for ~5 minutes."
                maxLength={4000}
                required
              />
              <span className="n-counter">{message.length} / 4000</span>
            </div>
            <div className="n-field">
              <label>Target email <span style={{ textTransform: 'none', color: 'var(--muted)' }}>(optional · leave empty to broadcast)</span></label>
              <input
                type="email"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                placeholder="customer@example.com"
                autoComplete="off"
              />
            </div>
            <button type="submit" className="n-btn" disabled={sending || !title.trim() || !message.trim()}>
              {sending ? 'Sending…' : targetEmail.trim() ? `Send to ${targetEmail.trim()}` : 'Broadcast to all customers'}
            </button>
          </form>
        </section>

        <section className="n-card">
          <div className="n-list-head">
            <h3>Sent</h3>
            <span>
              {stats.total} total · {stats.active} active · {stats.broadcast} broadcast · {stats.total - stats.broadcast} targeted
            </span>
          </div>

          <div className="n-search-row">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, message, target…"
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="broadcast">Broadcast</option>
              <option value="targeted">Targeted</option>
            </select>
            <button type="button" className="n-icon-btn" title="Refresh" onClick={load} disabled={loading}>↻</button>
          </div>

          {filtered.length === 0 && !loading ? (
            <div className="n-empty">No notifications match the current filter.</div>
          ) : null}

          {filtered.map((n) => (
            <div key={n.id} className={`n-row ${n.is_active === false ? 'disabled' : ''}`}>
              <div className="body">
                <div className="title">{n.title}</div>
                <div className="msg">{n.message}</div>
                <div className="meta">
                  <span className={`target ${n.target_email ? '' : 'all'}`}>
                    {n.target_email || 'all customers'}
                  </span>
                  <span>by {n.created_by || 'admin'}</span>
                  <span>·</span>
                  <span>{formatRelative(n.created_at)}</span>
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className={`n-icon-btn toggle ${n.is_active !== false ? 'active' : ''}`}
                  title={n.is_active !== false ? 'Disable' : 'Enable'}
                  onClick={() => toggleActive(n)}
                >
                  {n.is_active !== false ? '●' : '○'}
                </button>
                <button
                  type="button"
                  className="n-icon-btn danger"
                  title="Delete"
                  onClick={() => remove(n)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
