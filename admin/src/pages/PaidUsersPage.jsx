import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiCall } from '../api/client.js';

const STATUS_FILTERS = [
  { value: 'all',     label: 'Todos',       dot: 'all' },
  { value: 'active',  label: 'Habilitados', dot: 'green' },
  { value: 'blocked', label: 'Bloqueados',  dot: 'rose' },
];

const STYLES = `
  .u-page { display: flex; flex-direction: column; gap: 18px; }

  /* Hero */
  .u-hero {
    background:
      radial-gradient(80% 60% at 0% 0%, rgba(0,229,160,0.10), transparent 60%),
      radial-gradient(60% 50% at 100% 0%, rgba(96,165,250,0.10), transparent 65%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 22px 24px;
    animation: u-rise .35s ease-out both;
  }
  @keyframes u-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .u-hero h1 { margin: 0; font-family: var(--font-display); font-size: 22px; color: var(--text); }
  .u-hero h1 .grad { background: linear-gradient(90deg, var(--em) 0%, #93c5fd 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .u-hero p { margin: 6px 0 0; font-size: 13px; color: var(--soft); line-height: 1.6; }

  /* KPI strip */
  .u-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
  .u-kpi {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px 16px;
    transition: border-color .15s ease, transform .15s ease;
    animation: u-rise .35s ease-out both;
  }
  .u-kpi:nth-child(1) { animation-delay: .02s; }
  .u-kpi:nth-child(2) { animation-delay: .05s; }
  .u-kpi:nth-child(3) { animation-delay: .08s; }
  .u-kpi:nth-child(4) { animation-delay: .11s; }
  .u-kpi:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.12); }
  .u-kpi.em { border-color: var(--border-em); }
  .u-kpi .l { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .u-kpi .dot { width: 7px; height: 7px; border-radius: 999px; }
  .dot.green { background: #00e5a0; }
  .dot.rose  { background: #fb7185; }
  .dot.blue  { background: #60a5fa; }
  .dot.all   { background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%); }
  .u-kpi .v { font-family: var(--font-display); font-size: 26px; font-weight: 700; color: var(--text); margin-top: 4px; line-height: 1.1; }

  /* Toolbar */
  .u-toolbar {
    display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
    padding: 12px 14px;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
  }
  .u-search { flex: 1; min-width: 220px; display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.30); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; }
  .u-search:focus-within { border-color: var(--em); }
  .u-search input { flex: 1; min-width: 0; background: transparent; border: 0; color: var(--text); font-size: 13px; outline: none; }
  .u-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .u-chip { padding: 7px 14px; background: transparent; border: 1px solid var(--border); border-radius: 999px; color: var(--soft); font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s ease; display: inline-flex; align-items: center; gap: 6px; }
  .u-chip:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }
  .u-chip.active { background: rgba(0,229,160,0.10); border-color: var(--border-em); color: var(--em); }
  .u-chip .count { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 1px 6px; background: rgba(255,255,255,0.06); border-radius: 999px; }

  /* Cards */
  .u-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }

  .u-card {
    position: relative; overflow: hidden;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 18px;
    display: flex; flex-direction: column; gap: 12px;
    transition: all .2s ease;
    animation: u-rise .35s ease-out both;
  }
  .u-card::after { content: ''; position: absolute; right: -40px; top: -40px; width: 140px; height: 140px; background: radial-gradient(closest-side, rgba(0,229,160,0.06), transparent 70%); pointer-events: none; }
  .u-card:hover { transform: translateY(-2px); border-color: var(--border-em); box-shadow: 0 12px 28px rgba(0,229,160,0.06); }
  .u-card.editing { border-color: var(--em); box-shadow: 0 0 0 1px rgba(0,229,160,0.20), 0 16px 36px rgba(0,229,160,0.10); }
  .u-card.blocked { opacity: 0.7; }
  .u-card.blocked .u-av { filter: grayscale(0.5); }

  .u-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .u-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .u-av {
    width: 46px; height: 46px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    color: #00120a;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 700; font-size: 16px;
    flex-shrink: 0;
    box-shadow: 0 6px 16px rgba(0,229,160,0.20);
  }
  .u-name { font-weight: 700; color: var(--text); font-size: 14.5px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .u-email { font-size: 11.5px; color: var(--muted); font-family: 'JetBrains Mono', monospace; margin-top: 2px; word-break: break-all; }

  .u-badges { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
  .u-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
  .u-badge.paid    { background: rgba(0,229,160,0.12); color: var(--em); }
  .u-badge.free    { background: rgba(96,165,250,0.14); color: #93c5fd; }
  .u-badge.blocked { background: rgba(239,68,68,0.12); color: #fca5a5; }
  .u-badge.plan    { background: rgba(192,132,252,0.14); color: #c4b5fd; }

  .u-info { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 12px; padding-top: 4px; }
  .u-info div { color: var(--soft); }
  .u-info div strong { color: var(--text); font-family: 'JetBrains Mono', monospace; font-weight: 500; margin-left: 4px; }

  .u-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); }
  .u-foot .actions { display: flex; gap: 6px; }
  .u-icon-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
    width: 32px; height: 32px;
    border-radius: 8px;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all .15s ease;
  }
  .u-icon-btn:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }
  .u-icon-btn.warn:hover { color: #fde68a; border-color: rgba(251,191,36,0.40); background: rgba(251,191,36,0.06); }
  .u-icon-btn.danger:hover { color: #fca5a5; border-color: rgba(239,68,68,0.40); background: rgba(239,68,68,0.06); }
  .u-icon-btn.success:hover { color: var(--em); border-color: var(--border-em); background: rgba(0,229,160,0.06); }
  .u-icon-btn.active { color: var(--em); border-color: var(--border-em); }

  /* Edit panel (inline expand inside the card) */
  .u-edit {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    padding-top: 10px;
    border-top: 1px dashed rgba(255,255,255,0.10);
    animation: u-rise .25s ease-out both;
  }
  .u-row { display: flex; flex-direction: column; gap: 5px; }
  .u-row label { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .u-row input { background: rgba(0,0,0,0.30); border: 1px solid var(--border); border-radius: 10px; padding: 9px 11px; color: var(--text); font-size: 13px; outline: none; transition: border-color .15s ease; }
  .u-row input:focus { border-color: var(--em); background: rgba(0,0,0,0.45); }
  .u-edit-actions { display: flex; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; margin-top: 4px; }
  .u-btn { background: linear-gradient(180deg, var(--em) 0%, var(--em2) 100%); color: #00120a; font-weight: 700; border: 0; border-radius: 10px; padding: 9px 18px; cursor: pointer; font-size: 12.5px; transition: filter .15s ease; }
  .u-btn:hover { filter: brightness(1.08); }
  .u-btn-ghost { background: transparent; color: var(--soft); border: 1px solid var(--border); border-radius: 10px; padding: 9px 14px; cursor: pointer; font-size: 12.5px; transition: all .15s ease; }
  .u-btn-ghost:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }

  .u-empty { padding: 36px 20px; text-align: center; background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%); border: 1px dashed rgba(255,255,255,0.08); border-radius: var(--r-md); color: var(--muted); }
  .u-empty strong { display: block; font-family: var(--font-display); font-size: 16px; color: var(--soft); margin-bottom: 6px; }

  .u-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; }
  .u-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .u-banner.ok  { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }

  @media (max-width: 560px) {
    .u-hero { padding: 18px; }
    .u-hero h1 { font-size: 18px; }
    .u-card { padding: 14px; }
  }
`;

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'ahora mismo';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.round(diff / 3600_000)} h`;
  if (diff < 30 * 86_400_000) return `${Math.round(diff / 86_400_000)} d`;
  return new Date(iso).toLocaleDateString('es-ES');
}

export function PaidUsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall(
        `/api/admin/users?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`
      );
      setUsers(res.users || []);
    } catch (e) {
      setUsers([]);
      setError(e?.message || 'No se pudieron cargar las cuentas');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const all = users.length;
    const active = users.filter((u) => u.is_active).length;
    const blocked = all - active;
    const paid = users.filter((u) => u.subscription_active).length;
    return { all, active, blocked, paid };
  }, [users]);

  const openEdit = (u) => {
    setEditingId(u.id);
    setForm({
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      email: u.email || '',
      phone: u.phone || '',
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError(''); setInfo('');
    try {
      await apiCall(`/api/admin/users/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setEditingId(null);
      setInfo('Perfil guardado.');
      await load();
    } catch (e) {
      setError(e?.message || 'No se pudo guardar');
    }
  };

  const toggleBlock = async (u) => {
    setError(''); setInfo('');
    try {
      await apiCall(`/api/admin/users/${u.id}/block`, {
        method: 'PATCH',
        body: JSON.stringify({ blocked: u.is_active }),
      });
      setInfo(u.is_active ? `${u.email} bloqueado.` : `${u.email} desbloqueado.`);
      await load();
    } catch (e) {
      setError(e?.message || 'Operación fallida');
    }
  };

  const removeUser = async (u) => {
    if (!window.confirm(`¿Eliminar ${u.email}? Esta acción es permanente.`)) return;
    setError(''); setInfo('');
    try {
      await apiCall(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      setInfo(`${u.email} eliminado.`);
      await load();
    } catch (e) {
      setError(e?.message || 'No se pudo eliminar');
    }
  };

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head" style={{ marginBottom: 0, padding: 0, height: 0, overflow: 'hidden' }} aria-hidden>
        <h1>Suscriptores</h1>
      </header>

      <div className="u-page">
        {/* Hero */}
        <section className="u-hero">
          <h1>Suscriptores de <span className="grad">pago</span></h1>
          <p>
            Todos los clientes con cuenta Omnira. Filtra por estado, edita perfiles, bloquea el acceso o elimina
            permanentemente. El plan y la fecha de renovación se leen de <code>customer_users</code>.
          </p>
        </section>

        {/* KPIs */}
        <div className="u-kpis">
          <article className="u-kpi em">
            <div className="l"><span className="dot all" /> Cuentas totales</div>
            <div className="v">{stats.all}</div>
          </article>
          <article className="u-kpi">
            <div className="l"><span className="dot green" /> Habilitadas</div>
            <div className="v">{stats.active}</div>
          </article>
          <article className="u-kpi">
            <div className="l"><span className="dot rose" /> Bloqueadas</div>
            <div className="v">{stats.blocked}</div>
          </article>
          <article className="u-kpi em">
            <div className="l"><span className="dot blue" /> Pagando ahora</div>
            <div className="v">{stats.paid}</div>
          </article>
        </div>

        {/* Toolbar */}
        <div className="u-toolbar">
          <label className="u-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ color: 'var(--muted)' }}>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Buscar por email, nombre o teléfono…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="u-chips">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`u-chip${status === s.value ? ' active' : ''}`}
                onClick={() => setStatus(s.value)}
              >
                <span className={`dot ${s.dot}`} />
                {s.label}
                <span className="count">
                  {s.value === 'all' ? stats.all : s.value === 'active' ? stats.active : stats.blocked}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="u-banner err"><strong>Error:</strong> {error}</div> : null}
        {info ? <div className="u-banner ok"><strong>OK:</strong> {info}</div> : null}

        {users.length === 0 && !loading ? (
          <div className="u-empty">
            <strong>Ninguna cuenta coincide con los filtros actuales.</strong>
            Las nuevas altas aparecerán aquí automáticamente.
          </div>
        ) : (
          <div className="u-grid">
            {users.map((u) => {
              const isEditing = editingId === u.id;
              const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email.split('@')[0];
              const initials = fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              const planEndIso = u.subscription_ends_at;
              return (
                <article key={u.id} className={`u-card${isEditing ? ' editing' : ''}${!u.is_active ? ' blocked' : ''}`}>
                  <div className="u-head">
                    <div className="u-id">
                      <div className="u-av">{initials}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="u-name">{fullName}</div>
                        <div className="u-email">{u.email}</div>
                      </div>
                    </div>
                    <div className="u-badges">
                      {!u.is_active ? (
                        <span className="u-badge blocked">Bloqueado</span>
                      ) : u.subscription_active ? (
                        <span className="u-badge paid">● Pagando</span>
                      ) : (
                        <span className="u-badge free">Gratis</span>
                      )}
                      {u.plan ? <span className="u-badge plan">{u.plan}</span> : null}
                    </div>
                  </div>

                  <div className="u-info">
                    {u.phone ? <div>teléfono <strong>{u.phone}</strong></div> : null}
                    {planEndIso ? (
                      <div>renueva <strong>{new Date(planEndIso).toLocaleDateString('es-ES')}</strong></div>
                    ) : null}
                    <div>se unió hace <strong>{formatRelative(u.created_at)}</strong></div>
                  </div>

                  {isEditing ? (
                    <div className="u-edit">
                      <div className="u-row">
                        <label>Nombre</label>
                        <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                      </div>
                      <div className="u-row">
                        <label>Apellido</label>
                        <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                      </div>
                      <div className="u-row">
                        <label>Email</label>
                        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                      </div>
                      <div className="u-row">
                        <label>Teléfono</label>
                        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                      </div>
                      <div className="u-edit-actions">
                        <button type="button" className="u-btn-ghost" onClick={() => setEditingId(null)}>Cancelar</button>
                        <button type="button" className="u-btn" onClick={saveEdit}>Guardar</button>
                      </div>
                    </div>
                  ) : null}

                  <div className="u-foot">
                    <span>id <code style={{ color: 'var(--soft)' }}>{u.id.slice(0, 8)}</code></span>
                    <div className="actions">
                      <button
                        type="button"
                        className={`u-icon-btn${isEditing ? ' active' : ''}`}
                        title="Editar perfil"
                        onClick={() => (isEditing ? setEditingId(null) : openEdit(u))}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`u-icon-btn ${u.is_active ? 'warn' : 'success'}`}
                        title={u.is_active ? 'Bloquear acceso' : 'Desbloquear'}
                        onClick={() => toggleBlock(u)}
                      >
                        {u.is_active ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M4.93 4.93l14.14 14.14" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        className="u-icon-btn danger"
                        title="Eliminar cuenta"
                        onClick={() => removeUser(u)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
