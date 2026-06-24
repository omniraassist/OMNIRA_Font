import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { apiCall } from '../api/client.js';

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-ES'); } catch { return '—'; }
}
function fmtDay(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return '—'; }
}

const STATUS_BADGE = {
  active:  { bg: 'rgba(0,229,160,0.12)',  text: '#6ee7b7', label: 'Activo' },
  free:    { bg: 'rgba(251,191,36,0.12)', text: '#fde68a', label: 'Sin plan' },
  blocked: { bg: 'rgba(239,68,68,0.12)',  text: '#fca5a5', label: 'Bloqueado' },
};
const LEAD_STATUS = {
  new:         { bg: 'rgba(96,165,250,0.12)',  text: '#93c5fd' },
  contacted:   { bg: 'rgba(251,191,36,0.12)', text: '#fde68a' },
  qualified:   { bg: 'rgba(0,229,160,0.12)',  text: '#6ee7b7' },
  lost:        { bg: 'rgba(239,68,68,0.12)',  text: '#fca5a5' },
};

const STYLES = `
  .cd-hero {
    background:
      radial-gradient(80% 60% at 0% 0%, rgba(0,229,160,0.08), transparent 55%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 22px 24px;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }
  .cd-hero-left h1 { margin: 0 0 6px; font-family: var(--font-display); font-size: 22px; color: var(--text); }
  .cd-hero-left p { margin: 0; font-size: 13px; color: var(--soft); }
  .cd-hero-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

  .cd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 720px) { .cd-grid { grid-template-columns: 1fr; } }

  .cd-card {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 20px 22px;
  }
  .cd-card-title {
    font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted); margin: 0 0 16px;
  }
  .cd-fields { display: flex; flex-direction: column; gap: 10px; }
  .cd-field label { display: block; font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin-bottom: 3px; }
  .cd-field input {
    width: 100%; box-sizing: border-box;
    background: rgba(0,0,0,0.25); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 11px;
    color: var(--soft); font-size: 13px; outline: none;
  }
  .cd-field input.mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }

  .cd-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .cd-stat { padding: 14px 16px; background: rgba(0,0,0,0.20); border-radius: 10px; border: 1px solid rgba(255,255,255,0.04); }
  .cd-stat-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
  .cd-stat-value { font-size: 22px; font-weight: 700; color: var(--text); font-family: var(--font-display); }
  .cd-stat-value.em { color: var(--em); }

  .cd-badge {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700; letter-spacing: .02em;
  }
  .cd-stripe-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-family: 'JetBrains Mono', monospace;
    background: rgba(96,165,250,0.10); color: #93c5fd;
    border: 1px solid rgba(96,165,250,0.20);
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .cd-divider { height: 1px; background: var(--border); margin: 16px 0; }

  .cd-table-wrap { border-radius: 10px; border: 1px solid var(--border); overflow: hidden; }
  .cd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .cd-table thead th {
    padding: 9px 12px; text-align: left;
    font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted); border-bottom: 1px solid var(--border);
    background: rgba(0,0,0,0.15);
  }
  .cd-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.04); }
  .cd-table tbody tr:last-child { border-bottom: none; }
  .cd-table td { padding: 9px 12px; vertical-align: middle; color: var(--soft); }
  .cd-table td.mono { font-family: 'JetBrains Mono', monospace; font-size: 11px; }

  .cd-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 16px; border-radius: 10px; border: 0;
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: all .15s;
  }
  .cd-btn-ghost {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    color: var(--soft);
  }
  .cd-btn-ghost:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }
  .cd-btn-danger {
    background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30);
    color: #fca5a5;
  }
  .cd-btn-danger:hover { background: rgba(239,68,68,0.15); }
  .cd-btn-success {
    background: rgba(0,229,160,0.08); border: 1px solid rgba(0,229,160,0.25);
    color: var(--em);
  }
  .cd-btn-success:hover { background: rgba(0,229,160,0.15); }

  .cd-banner { padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 4px; }
  .cd-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .cd-banner.ok  { background: rgba(34,197,94,0.08);  border: 1px solid rgba(34,197,94,0.30);  color: #bbf7d0; }
  .cd-empty { padding: 20px; text-align: center; color: var(--muted); font-size: 13px; }
`;

export function ClientDetailPage() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState(false);

  const load = () => {
    let alive = true;
    setLoading(true);
    apiCall(`/api/admin/clients/${clientId}`)
      .then((res) => { if (alive) { setClient(res.client || null); setNotFound(!res.client); } })
      .catch((e) => {
        if (!alive) return;
        const msg = String(e?.message || '');
        if (/not found/i.test(msg) || /Error 404/.test(msg)) setNotFound(true);
        else setError(msg || 'No se pudo cargar el cliente');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  };

  useEffect(load, [clientId]);

  const toggleBlock = async () => {
    if (!client) return;
    const block = client.status !== 'blocked';
    if (!window.confirm(block
      ? `¿Bloquear a ${client.email}? No podrá acceder al panel.`
      : `¿Desbloquear a ${client.email}?`
    )) return;
    setBlocking(true);
    setError(''); setInfo('');
    try {
      await apiCall(`/api/admin/users/${clientId}/block`, {
        method: 'PATCH',
        body: JSON.stringify({ blocked: block }),
      });
      setInfo(block ? 'Usuario bloqueado.' : 'Usuario desbloqueado.');
      setClient((c) => ({ ...c, status: block ? 'blocked' : 'free', isActive: !block }));
    } catch (e) {
      setError(e?.message || 'Error al cambiar estado');
    } finally {
      setBlocking(false);
    }
  };

  if (notFound) return <Navigate to="/clients" replace />;

  const badge = client ? STATUS_BADGE[client.status] || STATUS_BADGE.free : null;

  return (
    <>
      <style>{STYLES}</style>

      <nav className="adm-breadcrumb">
        <Link to="/clients">Suscriptores</Link>
        <span>/</span>
        <span style={{ color: 'var(--soft)' }}>{client?.businessName || 'Cargando…'}</span>
      </nav>

      {error && <div className="cd-banner err" style={{ marginBottom: 12 }}><strong>Error:</strong> {error}</div>}
      {info  && <div className="cd-banner ok"  style={{ marginBottom: 12 }}>{info}</div>}

      {!client && loading ? (
        <div className="cd-card" style={{ color: 'var(--muted)' }}>Cargando…</div>
      ) : !client ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Hero */}
          <div className="cd-hero">
            <div className="cd-hero-left">
              <h1>
                {client.businessName}
                {badge && (
                  <span className="cd-badge" style={{ background: badge.bg, color: badge.text, marginLeft: 12, fontSize: 12 }}>
                    {badge.label}
                  </span>
                )}
              </h1>
              <p>{client.email} {client.phone ? `· ${client.phone}` : ''} · cliente desde {fmtDay(client.createdAt)}</p>
            </div>
            <div className="cd-hero-actions">
              <Link to="/chats" className="cd-btn cd-btn-ghost">Chats →</Link>
              <Link to="/leads" className="cd-btn cd-btn-ghost">Leads →</Link>
              <button
                type="button"
                className={`cd-btn ${client.status === 'blocked' ? 'cd-btn-success' : 'cd-btn-danger'}`}
                onClick={toggleBlock}
                disabled={blocking}
              >
                {blocking ? '…' : client.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="cd-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            <div className="cd-stat">
              <div className="cd-stat-label">Gasto total</div>
              <div className="cd-stat-value em">€{(client.lifetimeEuro ?? 0).toFixed(2)}</div>
            </div>
            <div className="cd-stat">
              <div className="cd-stat-label">Pagos</div>
              <div className="cd-stat-value">{client.paymentsCount ?? 0}</div>
            </div>
            <div className="cd-stat">
              <div className="cd-stat-label">Mensajes este mes</div>
              <div className="cd-stat-value">{client.messagesThisMonth ?? 0}</div>
            </div>
            <div className="cd-stat">
              <div className="cd-stat-label">Mensajes total</div>
              <div className="cd-stat-value">{client.messagesTotal ?? 0}</div>
            </div>
            <div className="cd-stat">
              <div className="cd-stat-label">Leads capturados</div>
              <div className="cd-stat-value">{client.leadsTotal ?? 0}</div>
            </div>
          </div>

          {/* Cuenta + Suscripción */}
          <div className="cd-grid">
            <div className="cd-card">
              <p className="cd-card-title">Cuenta</p>
              <div className="cd-fields">
                <div className="cd-field">
                  <label>Titular</label>
                  <input readOnly value={client.ownerName || client.businessName || ''} />
                </div>
                <div className="cd-field">
                  <label>Email</label>
                  <input readOnly value={client.email || ''} />
                </div>
                <div className="cd-field">
                  <label>Teléfono</label>
                  <input readOnly value={client.phone || '—'} />
                </div>
                <div className="cd-field">
                  <label>Alta</label>
                  <input readOnly value={fmtDate(client.createdAt)} />
                </div>
              </div>
            </div>

            <div className="cd-card">
              <p className="cd-card-title">Suscripción</p>
              <div className="cd-fields">
                <div className="cd-field">
                  <label>Plan</label>
                  <input readOnly value={client.planLabel ? `${client.planLabel} (${client.plan})` : (client.plan || '—')} />
                </div>
                <div className="cd-field">
                  <label>€ / mes equivalente</label>
                  <input readOnly value={client.monthlyEuro != null ? `€${client.monthlyEuro.toFixed(2)} / mes` : '—'} />
                </div>
                <div className="cd-field">
                  <label>{client.stripeSubscriptionId ? 'Se renueva el' : 'Vence el'}</label>
                  <input readOnly value={client.renewsAt || '—'} />
                </div>
                {client.stripeSubscriptionId && (
                  <div className="cd-field">
                    <label>Stripe Subscription</label>
                    <span className="cd-stripe-badge" title={client.stripeSubscriptionId}>
                      ↺ {client.stripeSubscriptionId}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Últimos leads */}
          {client.recentLeads && client.recentLeads.length > 0 && (
            <div className="cd-card">
              <p className="cd-card-title">Últimos leads capturados</p>
              <div className="cd-table-wrap">
                <table className="cd-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Teléfono</th>
                      <th>Estado</th>
                      <th>Captado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.recentLeads.map((l) => {
                      const ls = LEAD_STATUS[l.status] || { bg: 'rgba(148,163,184,0.10)', text: 'var(--soft)' };
                      return (
                        <tr key={l.id}>
                          <td>{l.name || '—'}</td>
                          <td className="mono">{l.phone || '—'}</td>
                          <td>
                            <span className="cd-badge" style={{ background: ls.bg, color: ls.text, fontSize: 10 }}>
                              {l.status || 'new'}
                            </span>
                          </td>
                          <td className="mono">{fmtDay(l.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {client.leadsTotal > 5 && (
                <div style={{ marginTop: 10, textAlign: 'right' }}>
                  <Link to="/leads" style={{ fontSize: 12, color: 'var(--em)', textDecoration: 'none' }}>
                    Ver todos los leads ({client.leadsTotal}) →
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Historial de pagos */}
          <div className="cd-card">
            <p className="cd-card-title">Historial de pagos</p>
            {(!client.payments || !client.payments.length) ? (
              <div className="cd-empty">Aún no hay pagos.</div>
            ) : (
              <div className="cd-table-wrap">
                <table className="cd-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Plan</th>
                      <th>Importe</th>
                      <th>Periodo</th>
                      <th>Vence tras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="mono">{fmtDate(p.created_at)}</td>
                        <td>{p.plan_id}</td>
                        <td>€{(p.amount_euro ?? 0).toFixed(2)} {String(p.currency || 'eur').toUpperCase()}</td>
                        <td>{p.period_days} días</td>
                        <td className="mono">{p.subscription_end_after ? p.subscription_end_after.slice(0, 10) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
