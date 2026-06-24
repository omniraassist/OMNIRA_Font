import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const ACTION_COLORS = {
  'pricing.update':    { bg: 'rgba(96,165,250,0.10)',  text: '#93c5fd' },
  'user.block':        { bg: 'rgba(239,68,68,0.10)',   text: '#fca5a5' },
  'user.update':       { bg: 'rgba(251,191,36,0.10)',  text: '#fde68a' },
  'admin.login':       { bg: 'rgba(0,229,160,0.10)',   text: '#6ee7b7' },
  'invoice.resend':    { bg: 'rgba(167,139,250,0.10)', text: '#c4b5fd' },
  'notification.send': { bg: 'rgba(251,191,36,0.10)',  text: '#fde68a' },
};

function actionColor(action) {
  if (ACTION_COLORS[action]) return ACTION_COLORS[action];
  if (action?.includes('delete') || action?.includes('block')) return { bg: 'rgba(239,68,68,0.10)', text: '#fca5a5' };
  if (action?.includes('create') || action?.includes('send'))  return { bg: 'rgba(0,229,160,0.10)', text: '#6ee7b7' };
  if (action?.includes('update') || action?.includes('patch')) return { bg: 'rgba(251,191,36,0.10)', text: '#fde68a' };
  return { bg: 'rgba(148,163,184,0.10)', text: 'var(--soft)' };
}

const STYLES = `
  .al-page { display: flex; flex-direction: column; gap: 18px; }

  .al-hero {
    background:
      radial-gradient(80% 60% at 0% 0%, rgba(167,139,250,0.10), transparent 60%),
      radial-gradient(60% 50% at 100% 0%, rgba(96,165,250,0.08), transparent 65%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 22px 24px;
  }
  .al-hero h1 { margin: 0; font-family: var(--font-display); font-size: 22px; color: var(--text); }
  .al-hero h1 .grad { background: linear-gradient(90deg, #a78bfa, #93c5fd); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .al-hero p { margin: 6px 0 14px; font-size: 13px; color: var(--soft); line-height: 1.6; }
  .al-stats { display: flex; gap: 12px; flex-wrap: wrap; }
  .al-stat {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(0,0,0,0.30); border: 1px solid var(--border);
    border-radius: 999px; padding: 5px 13px;
    font-size: 12px; color: var(--soft);
  }
  .al-stat strong { color: var(--text); font-family: 'JetBrains Mono', monospace; }

  .al-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .al-search {
    flex: 1; min-width: 200px;
    background: rgba(0,0,0,0.30); border: 1px solid var(--border);
    border-radius: 10px; padding: 9px 13px;
    color: var(--text); font-size: 13px; outline: none;
    transition: border-color .15s;
  }
  .al-search:focus { border-color: var(--em); }
  .al-search::placeholder { color: var(--muted); }
  .al-btn {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    color: var(--soft); padding: 9px 14px; border-radius: 10px;
    cursor: pointer; font-size: 13px;
    display: inline-flex; align-items: center; gap: 6px;
    transition: all .15s;
  }
  .al-btn:hover { color: var(--em); border-color: var(--border-em); }
  .al-btn.spin svg { animation: al-spin .8s linear infinite; }
  @keyframes al-spin { to { transform: rotate(360deg); } }

  .al-table-wrap {
    border-radius: var(--r-lg); border: 1px solid var(--border);
    overflow: hidden;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
  }
  .al-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .al-table thead th {
    padding: 11px 14px; text-align: left;
    font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted); border-bottom: 1px solid var(--border);
    background: rgba(0,0,0,0.15);
  }
  .al-table tbody tr {
    border-bottom: 1px solid rgba(255,255,255,0.04);
    transition: background .12s;
    cursor: pointer;
  }
  .al-table tbody tr:last-child { border-bottom: none; }
  .al-table tbody tr:hover { background: rgba(255,255,255,0.025); }
  .al-table td { padding: 11px 14px; vertical-align: middle; }

  .al-badge {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700; letter-spacing: .02em;
    font-family: 'JetBrains Mono', monospace;
  }
  .al-entity { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); }
  .al-ip { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); }
  .al-time { font-size: 11px; color: var(--muted); white-space: nowrap; }
  .al-email { font-size: 12px; color: var(--soft); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .al-detail-panel {
    background: rgba(0,0,0,0.35); border: 1px solid var(--border);
    border-radius: var(--r-md); padding: 16px 18px;
    margin-top: 2px;
  }
  .al-detail-panel pre {
    margin: 0; font-family: 'JetBrains Mono', monospace;
    font-size: 12px; color: var(--soft); white-space: pre-wrap; word-break: break-all;
    line-height: 1.6;
  }
  .al-detail-close {
    float: right; background: none; border: none;
    color: var(--muted); cursor: pointer; font-size: 16px; line-height: 1;
    padding: 0 0 6px 6px;
  }
  .al-detail-close:hover { color: var(--text); }

  .al-empty { padding: 48px 24px; text-align: center; color: var(--muted); font-size: 14px; }
  .al-banner { padding: 11px 14px; border-radius: var(--r-md); font-size: 13px; margin-bottom: 4px; }
  .al-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
`;

export function AuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/audit-log');
      setEntries(res.entries || []);
    } catch (e) {
      setError(e?.message || 'No se pudo cargar el audit log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          e.action?.toLowerCase().includes(q) ||
          e.admin_email?.toLowerCase().includes(q) ||
          e.entity?.toLowerCase().includes(q) ||
          e.entity_id?.toLowerCase().includes(q) ||
          e.ip?.toLowerCase().includes(q)
      )
    : entries;

  const uniqueAdmins = [...new Set(entries.map((e) => e.admin_email).filter(Boolean))].length;

  return (
    <>
      <style>{STYLES}</style>

      <div className="al-page">
        <section className="al-hero">
          <h1>Audit <span className="grad">Log</span></h1>
          <p>
            Registro de todas las acciones administrativas: quién hizo qué, cuándo y desde qué IP.
            Se muestran los últimos 100 eventos.
          </p>
          <div className="al-stats">
            <span className="al-stat"><strong>{entries.length}</strong> eventos</span>
            <span className="al-stat"><strong>{uniqueAdmins}</strong> administradores</span>
            {entries[0] && (
              <span className="al-stat">último · <strong>{timeAgo(entries[0].created_at)}</strong></span>
            )}
          </div>
        </section>

        <div className="al-toolbar">
          <input
            type="search"
            className="al-search"
            placeholder="Filtrar por acción, admin, entidad o IP…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setExpanded(null); }}
          />
          <button type="button" className={`al-btn${loading ? ' spin' : ''}`} onClick={load} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M3 12a9 9 0 0 1 15.5-6.3M21 4v6h-6M21 12a9 9 0 0 1-15.5 6.3M3 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>

        {error && <div className="al-banner err"><strong>Error:</strong> {error}</div>}

        {expanded && (
          <div className="al-detail-panel">
            <button type="button" className="al-detail-close" onClick={() => setExpanded(null)}>×</button>
            <strong style={{ fontSize: 12, color: 'var(--soft)', display: 'block', marginBottom: 8 }}>
              {expanded.action} · {fmtDate(expanded.created_at)}
            </strong>
            <pre>{JSON.stringify(expanded.detail ?? {}, null, 2)}</pre>
          </div>
        )}

        <div className="al-table-wrap">
          {!filtered.length && !loading ? (
            <div className="al-empty">
              {search ? 'No hay resultados para ese filtro.' : 'El audit log está vacío.'}
            </div>
          ) : (
            <table className="al-table">
              <thead>
                <tr>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Admin</th>
                  <th>IP</th>
                  <th>Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const { bg, text } = actionColor(e.action);
                  const isOpen = expanded?.id === e.id;
                  return (
                    <tr key={e.id} onClick={() => setExpanded(isOpen ? null : e)} title="Click para ver detalle">
                      <td>
                        <span className="al-badge" style={{ background: bg, color: text }}>
                          {e.action || '—'}
                        </span>
                      </td>
                      <td>
                        {e.entity ? (
                          <span className="al-entity">
                            {e.entity}
                            {e.entity_id ? <> · <span style={{ color: 'var(--soft)' }}>{e.entity_id.slice(0, 12)}{e.entity_id.length > 12 ? '…' : ''}</span></> : ''}
                          </span>
                        ) : <span style={{ color: 'var(--border)' }}>—</span>}
                      </td>
                      <td><span className="al-email">{e.admin_email || <span style={{ color: 'var(--border)' }}>—</span>}</span></td>
                      <td><span className="al-ip">{e.ip || '—'}</span></td>
                      <td>
                        <span className="al-time" title={fmtDate(e.created_at)}>
                          {timeAgo(e.created_at)}
                          <span style={{ display: 'block', fontSize: 10, marginTop: 2 }}>{fmtDate(e.created_at)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
