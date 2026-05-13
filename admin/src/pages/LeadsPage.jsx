import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
];

const STATUS_BADGE_CLASS = {
  new: 'active',
  contacted: 'active',
  qualified: 'active',
  converted: 'active',
  lost: 'paused',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

function ConfidenceBar({ value }) {
  const pct = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 80 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: pct >= 70 ? '#22c55e' : pct >= 40 ? '#eab308' : '#94a3b8',
          }}
        />
      </div>
      <span className="adm-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{pct}%</span>
    </div>
  );
}

export function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [statusDraft, setStatusDraft] = useState('new');
  const [notesDraft, setNotesDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (search) params.set('search', search);
      const res = await apiCall(`/api/admin/leads?${params.toString()}`);
      setLeads(res.leads || []);
    } catch (e) {
      setLeads([]);
      setError(e?.message || 'Could not load leads');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (lead) => {
    setSelectedId(lead.id);
    setSelected(lead);
    setStatusDraft(lead.status || 'new');
    setNotesDraft(lead.notes || '');
    setMessages([]);
    try {
      const res = await apiCall(`/api/admin/leads/${lead.id}`);
      setSelected(res.lead || lead);
      setMessages(res.messages || []);
    } catch {
      // detail load failed; keep summary view
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setSelected(null);
    setMessages([]);
  };

  const saveLead = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await apiCall(`/api/admin/leads/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusDraft, notes: notesDraft }),
      });
      setSelected(res.lead || selected);
      await load();
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const acc = { total: leads.length, new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };
    for (const l of leads) {
      if (acc[l.status] !== undefined) acc[l.status] += 1;
    }
    return acc;
  }, [leads]);

  return (
    <>
      <header className="adm-page-head">
        <h1>WhatsApp leads</h1>
        <p>Every prospect that talks to the Omnira WhatsApp agent. Leads are auto-extracted from conversations and updated on each new message.</p>
      </header>

      <div className="adm-grid-kpi" style={{ marginBottom: 16 }}>
        {[
          { id: 'total', label: 'Total leads', value: stats.total, hint: 'In current view' },
          { id: 'new', label: 'New', value: stats.new, hint: 'Awaiting first action' },
          { id: 'qualified', label: 'Qualified', value: stats.qualified, hint: 'Buyer intent' },
          { id: 'converted', label: 'Converted', value: stats.converted, hint: 'Paid customers' },
        ].map((s) => (
          <article key={s.id} className="adm-card">
            <span className="adm-stat-label">{s.label}</span>
            <span className="adm-stat-value">{s.value}</span>
            <span className="adm-stat-delta">{s.hint}</span>
          </article>
        ))}
      </div>

      <div className="adm-toolbar">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="adm-search-input"
            style={{ minWidth: 260 }}
            placeholder="Search name / email / phone / number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="adm-btn adm-btn-ghost" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button type="button" className="adm-btn adm-btn-ghost" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <span className="adm-mono" style={{ color: 'var(--muted)' }}>
          {loading ? 'Loading…' : `${leads.length} records`}
        </span>
      </div>

      {error ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Error:</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{error}</span>
        </div>
      ) : null}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>WhatsApp</th>
              <th>Email</th>
              <th>Intent</th>
              <th>Lang</th>
              <th>Confidence</th>
              <th>Msgs</th>
              <th>Last msg</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td>{l.name || '—'}</td>
                <td className="adm-mono">+{l.wa_from}</td>
                <td className="adm-mono">{l.email || '—'}</td>
                <td>{l.intent || '—'}</td>
                <td className="adm-mono">{l.language || '—'}</td>
                <td><ConfidenceBar value={l.confidence} /></td>
                <td className="adm-mono">{l.message_count ?? 0}</td>
                <td className="adm-mono">{formatDate(l.last_message_at)}</td>
                <td>
                  <span className={`adm-badge ${STATUS_BADGE_CLASS[l.status] || 'paused'}`}>
                    {l.status}
                  </span>
                </td>
                <td>
                  <button type="button" className="adm-btn adm-btn-ghost" onClick={() => openDetail(l)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {!leads.length && !loading && (
              <tr>
                <td colSpan={10} style={{ color: 'var(--muted)' }}>
                  No leads yet. When users WhatsApp the Omnira number, they appear here automatically.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedId && selected ? (
        <section className="adm-card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h2 className="adm-card-title">{selected.name || `Lead +${selected.wa_from}`}</h2>
              <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
                +{selected.wa_from} · {selected.intent || 'unknown intent'} · {selected.language || '—'}
              </p>
            </div>
            <button type="button" className="adm-btn adm-btn-ghost" onClick={closeDetail}>Close</button>
          </div>

          <div className="adm-form-grid" style={{ marginTop: 14 }}>
            <div className="adm-field">
              <label>Email</label>
              <input className="adm-mono" value={selected.email || ''} readOnly />
            </div>
            <div className="adm-field">
              <label>Extra phone</label>
              <input className="adm-mono" value={selected.phone || ''} readOnly />
            </div>
            <div className="adm-field">
              <label>Status</label>
              <select className="adm-btn adm-btn-ghost" value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
                {STATUS_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label>Confidence</label>
              <ConfidenceBar value={selected.confidence} />
            </div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea
                rows={3}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  padding: 10,
                  color: 'inherit',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="button" className="adm-btn adm-btn-primary" onClick={saveLead} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>

          <h3 style={{ marginTop: 18, marginBottom: 8 }}>Conversation</h3>
          <div
            style={{
              maxHeight: 360,
              overflowY: 'auto',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 12,
              background: 'rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {messages.length === 0 ? (
              <span style={{ color: 'var(--muted)' }}>No messages stored yet.</span>
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
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>
                    {m.direction === 'outbound' ? 'Omnira agent' : `+${selected.wa_from}`} · {formatDate(m.created_at)}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
