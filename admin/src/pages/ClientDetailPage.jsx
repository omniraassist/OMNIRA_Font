import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { apiCall } from '../api/client.js';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES');
  } catch {
    return '—';
  }
}

export function ClientDetailPage() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiCall(`/api/admin/clients/${clientId}`)
      .then((res) => {
        if (!alive) return;
        setClient(res.client || null);
        setNotFound(!res.client);
      })
      .catch((e) => {
        if (!alive) return;
        setClient(null);
        const msg = String(e?.message || '');
        if (/not found/i.test(msg) || /Error 404/.test(msg)) {
          setNotFound(true);
        } else {
          setError(msg || 'No se pudo cargar el cliente');
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (notFound) return <Navigate to="/clients" replace />;

  return (
    <>
      <nav className="adm-breadcrumb">
        <Link to="/clients">Suscriptores de pago</Link>
        <span>/</span>
        <span style={{ color: 'var(--soft)' }}>{client?.businessName || 'Cargando…'}</span>
      </nav>

      <header className="adm-page-head">
        <h1>{client?.businessName || 'Cargando…'}</h1>
        <p>
          Resumen de cuenta desde <code>customer_users</code> + pagos desde <code>customer_payments</code> +
          actividad de WhatsApp asociada a este cliente (solo cuando el enrutamiento multi-tenant esté activo — Fase 3).
        </p>
      </header>

      {error ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Error:</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{error}</span>
        </div>
      ) : null}

      {!client && !loading ? null : !client ? (
        <div className="adm-card" style={{ color: 'var(--muted)' }}>Cargando…</div>
      ) : (
        <>
          <div className="adm-two-col-detail">
            <section className="adm-card">
              <h2 className="adm-card-title">Cuenta</h2>
              <div className="adm-form-grid">
                <div className="adm-field">
                  <label>Nombre del titular</label>
                  <input readOnly value={client.ownerName || ''} />
                </div>
                <div className="adm-field">
                  <label>Correo electrónico</label>
                  <input readOnly value={client.email || ''} />
                </div>
                <div className="adm-field">
                  <label>Teléfono</label>
                  <input readOnly value={client.phone || ''} />
                </div>
                <div className="adm-field">
                  <label>Estado</label>
                  <input readOnly value={client.status || '—'} />
                </div>
                <div className="adm-field">
                  <label>Plan</label>
                  <input readOnly value={client.planLabel ? `${client.planLabel} (${client.plan})` : (client.plan || '—')} />
                </div>
                <div className="adm-field">
                  <label>Equivalente mensual</label>
                  <input readOnly value={client.monthlyEuro != null ? `€${client.monthlyEuro.toFixed(2)} / mes` : '—'} />
                </div>
                <div className="adm-field">
                  <label>Renueva / vence</label>
                  <input readOnly value={client.renewsAt || '—'} />
                </div>
                <div className="adm-field">
                  <label>Creada</label>
                  <input readOnly value={formatDate(client.createdAt)} />
                </div>
              </div>
            </section>

            <aside className="adm-card">
              <h2 className="adm-card-title">Actividad</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <Link to="/chats" className="adm-btn adm-btn-ghost">Ver chats de WhatsApp →</Link>
                <Link to="/leads" className="adm-btn adm-btn-ghost">Ver leads →</Link>
              </div>
              <div className="adm-stat-label">Gasto total histórico</div>
              <div className="adm-stat-value">€{(client.lifetimeEuro ?? 0).toFixed(2)}</div>
              <div className="adm-divider" />
              <div className="adm-stat-label">Pagos</div>
              <div className="adm-stat-value" style={{ fontSize: 24 }}>{client.paymentsCount ?? 0}</div>
              <div className="adm-divider" />
              <div className="adm-stat-label">Mensajes de WhatsApp este mes</div>
              <div className="adm-stat-value" style={{ fontSize: 24 }}>{client.messagesThisMonth ?? 0}</div>
              <div className="adm-stat-label" style={{ marginTop: 12 }}>Mensajes de WhatsApp (total)</div>
              <div className="adm-stat-value" style={{ fontSize: 24 }}>{client.messagesTotal ?? 0}</div>
              <div className="adm-stat-label" style={{ marginTop: 12 }}>Leads capturados</div>
              <div className="adm-stat-value" style={{ fontSize: 24 }}>{client.leadsTotal ?? 0}</div>
            </aside>
          </div>

          <section className="adm-card" style={{ marginTop: 18 }}>
            <h2 className="adm-card-title">Historial de pagos</h2>
            {(!client.payments || !client.payments.length) ? (
              <p style={{ color: 'var(--muted)' }}>Aún no hay pagos.</p>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
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
                        <td className="adm-mono">{formatDate(p.created_at)}</td>
                        <td>{p.plan_id}</td>
                        <td>€{(p.amount_euro ?? 0).toFixed(2)} {String(p.currency || 'eur').toUpperCase()}</td>
                        <td>{p.period_days} días</td>
                        <td className="adm-mono">{p.subscription_end_after ? p.subscription_end_after.slice(0, 10) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
