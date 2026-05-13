import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { apiCall } from '../api/client.js';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
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
          setError(msg || 'Could not load client');
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
        <Link to="/clients">Paid subscribers</Link>
        <span>/</span>
        <span style={{ color: 'var(--soft)' }}>{client?.businessName || 'Loading…'}</span>
      </nav>

      <header className="adm-page-head">
        <h1>{client?.businessName || 'Loading…'}</h1>
        <p>
          Account snapshot from <code>customer_users</code> + payments from <code>customer_payments</code> +
          WhatsApp activity tied to this customer (only after multi-tenant routing is enabled — Phase 3).
        </p>
      </header>

      {error ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Error:</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{error}</span>
        </div>
      ) : null}

      {!client && !loading ? null : !client ? (
        <div className="adm-card" style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : (
        <>
          <div className="adm-two-col-detail">
            <section className="adm-card">
              <h2 className="adm-card-title">Account</h2>
              <div className="adm-form-grid">
                <div className="adm-field">
                  <label>Owner name</label>
                  <input readOnly value={client.ownerName || ''} />
                </div>
                <div className="adm-field">
                  <label>Email</label>
                  <input readOnly value={client.email || ''} />
                </div>
                <div className="adm-field">
                  <label>Phone</label>
                  <input readOnly value={client.phone || ''} />
                </div>
                <div className="adm-field">
                  <label>Status</label>
                  <input readOnly value={client.status || '—'} />
                </div>
                <div className="adm-field">
                  <label>Plan</label>
                  <input readOnly value={client.planLabel ? `${client.planLabel} (${client.plan})` : (client.plan || '—')} />
                </div>
                <div className="adm-field">
                  <label>Monthly equivalent</label>
                  <input readOnly value={client.monthlyEuro != null ? `€${client.monthlyEuro.toFixed(2)} / mo` : '—'} />
                </div>
                <div className="adm-field">
                  <label>Renews / ends</label>
                  <input readOnly value={client.renewsAt || '—'} />
                </div>
                <div className="adm-field">
                  <label>Created</label>
                  <input readOnly value={formatDate(client.createdAt)} />
                </div>
              </div>
            </section>

            <aside className="adm-card">
              <h2 className="adm-card-title">Activity</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <Link to="/chats" className="adm-btn adm-btn-ghost">View WhatsApp chats →</Link>
                <Link to="/leads" className="adm-btn adm-btn-ghost">View leads →</Link>
              </div>
              <div className="adm-stat-label">Lifetime spend</div>
              <div className="adm-stat-value">€{(client.lifetimeEuro ?? 0).toFixed(2)}</div>
              <div className="adm-divider" />
              <div className="adm-stat-label">Payments</div>
              <div className="adm-stat-value" style={{ fontSize: 24 }}>{client.paymentsCount ?? 0}</div>
              <div className="adm-divider" />
              <div className="adm-stat-label">WhatsApp messages this month</div>
              <div className="adm-stat-value" style={{ fontSize: 24 }}>{client.messagesThisMonth ?? 0}</div>
              <div className="adm-stat-label" style={{ marginTop: 12 }}>WhatsApp messages (total)</div>
              <div className="adm-stat-value" style={{ fontSize: 24 }}>{client.messagesTotal ?? 0}</div>
              <div className="adm-stat-label" style={{ marginTop: 12 }}>Leads captured</div>
              <div className="adm-stat-value" style={{ fontSize: 24 }}>{client.leadsTotal ?? 0}</div>
            </aside>
          </div>

          <section className="adm-card" style={{ marginTop: 18 }}>
            <h2 className="adm-card-title">Payment history</h2>
            {(!client.payments || !client.payments.length) ? (
              <p style={{ color: 'var(--muted)' }}>No payments yet.</p>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Period</th>
                      <th>Subscription end after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="adm-mono">{formatDate(p.created_at)}</td>
                        <td>{p.plan_id}</td>
                        <td>€{(p.amount_euro ?? 0).toFixed(2)} {String(p.currency || 'eur').toUpperCase()}</td>
                        <td>{p.period_days} days</td>
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
