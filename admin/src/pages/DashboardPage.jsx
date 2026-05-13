import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiCall } from '../api/client.js';

export function DashboardPage() {
  const [kpis, setKpis] = useState([]);
  const [messagesSeries, setMessagesSeries] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiCall('/api/admin/overview')
      .then((res) => {
        if (!alive) return;
        setKpis(res.kpis || []);
        setMessagesSeries(res.messagesSeries || []);
        setRecent(res.recentClients || []);
        setError('');
      })
      .catch((e) => {
        if (!alive) return;
        setKpis([]);
        setMessagesSeries([]);
        setRecent([]);
        setError(e?.message || 'Could not load overview');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const maxBar = useMemo(
    () => Math.max(1, ...messagesSeries.map((d) => Number(d.messages || 0))),
    [messagesSeries]
  );

  return (
    <>
      <header className="adm-page-head">
        <h1>Dashboard</h1>
        <p>
          Live state of your Omnira backend: signups, active subscribers, WhatsApp conversation volume, leads,
          and revenue from <code>customer_payments</code>. All values come from Supabase — nothing is mocked.
        </p>
      </header>

      {error ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Error:</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{error}</span>
        </div>
      ) : null}

      <div className="adm-grid-kpi">
        {kpis.map((k) => (
          <article key={k.id} className="adm-card adm-card-em">
            <div className="adm-stat-label">{k.label}</div>
            <div className="adm-stat-value">{String(k.value ?? 0)}</div>
            <p className="adm-stat-hint">{k.hint}</p>
          </article>
        ))}
        {!loading && !kpis.length ? (
          <div className="adm-card" style={{ color: 'var(--muted)' }}>No data yet.</div>
        ) : null}
      </div>

      <section className="adm-card" style={{ marginTop: 18 }}>
        <h2 className="adm-card-title">WhatsApp messages · last 7 days</h2>
        <div className="adm-chart-bars">
          {messagesSeries.map((d) => (
            <div key={d.label + d.date} className="adm-chart-bar-wrap">
              <div
                className="adm-chart-bar"
                style={{ height: `${(Number(d.messages || 0) / maxBar) * 100}%` }}
                title={`${d.messages} messages`}
              />
              <span className="adm-chart-label">{d.label}</span>
            </div>
          ))}
          {!messagesSeries.length && !loading ? (
            <span style={{ color: 'var(--muted)' }}>No messages yet. They populate from /api/meta/whatsapp/webhook.</span>
          ) : null}
        </div>
        <p className="adm-field-hint" style={{ marginTop: 16 }}>
          Inbound + outbound counts from <code>wa_messages</code>. Drill into individual conversations in{' '}
          <Link to="/chats">WhatsApp chats</Link>.
        </p>
      </section>

      <section className="adm-card" style={{ marginTop: 18, marginBottom: 0 }}>
        <div className="adm-toolbar" style={{ marginBottom: 0 }}>
          <h2 className="adm-card-title" style={{ marginBottom: 0 }}>Recent signups</h2>
          <Link to="/clients" className="adm-btn adm-btn-primary">View all</Link>
        </div>
        <div className="adm-table-wrap" style={{ marginTop: 18 }}>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Renews</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong style={{ color: '#fff' }}>{c.businessName}</strong>
                    <div className="adm-mono" style={{ marginTop: 4 }}>{c.email}</div>
                  </td>
                  <td>{c.plan || '—'}</td>
                  <td className="adm-mono">{c.subscriptionEndsAt ? c.subscriptionEndsAt.slice(0, 10) : '—'}</td>
                  <td>
                    <span className={`adm-badge ${c.agentStatus}`}>{c.agentStatus}</span>
                  </td>
                  <td><Link to={`/clients/${c.id}`}>Manage</Link></td>
                </tr>
              ))}
              {!recent.length && !loading ? (
                <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No signups yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
