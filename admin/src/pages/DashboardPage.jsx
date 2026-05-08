import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiCall } from '../api/client.js';

export function DashboardPage() {
  const [kpis, setKpis] = useState([]);
  const [bookingsSeries, setBookingsSeries] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    let alive = true;
    apiCall('/api/admin/overview')
      .then((res) => {
        if (!alive) return;
        setKpis(res.kpis || []);
        setBookingsSeries(res.bookingsSeries || []);
        setRecent(res.recentClients || []);
      })
      .catch(() => {
        if (!alive) return;
        setKpis([]);
        setBookingsSeries([]);
        setRecent([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const maxBar = useMemo(
    () => Math.max(1, ...bookingsSeries.map((d) => Number(d.bookings || 0))),
    [bookingsSeries]
  );

  return (
    <>
      <header className="adm-page-head">
        <h1>Dashboard</h1>
        <p>
          High-level health of your Omnira fleet: recurring revenue, active WhatsApp agents, conversation volume,
          and bookings flowing to Google Sheets and email.
        </p>
      </header>

      <div className="adm-grid-kpi">
        {kpis.map((k) => (
          <article key={k.id} className="adm-card adm-card-em">
            <div className="adm-stat-label">{k.label}</div>
            <div className="adm-stat-value">{String(k.value ?? 0)}</div>
            <p className="adm-stat-hint">{k.hint}</p>
          </article>
        ))}
      </div>

      <div className="adm-grid-2">
        <section className="adm-card">
          <h2 className="adm-card-title">Bookings · last 7 days</h2>
          <div className="adm-chart-bars">
            {bookingsSeries.map((d) => (
              <div key={d.label} className="adm-chart-bar-wrap">
                <div
                  className="adm-chart-bar"
                  style={{ height: `${(Number(d.bookings || 0) / maxBar) * 100}%` }}
                  title={`${d.bookings} bookings`}
                />
                <span className="adm-chart-label">{d.label}</span>
              </div>
            ))}
          </div>
          <p className="adm-field-hint" style={{ marginTop: 16 }}>
            Each bar is confirmed appointments across all paying bot owners. Drill down in{' '}
            <Link to="/analytics">Analytics</Link>.
          </p>
        </section>

        <section className="adm-card">
          <h2 className="adm-card-title">Pipeline snapshot</h2>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <li className="adm-pill">
              <div>
                <strong>Meta review</strong>
                <span className="adm-mono" style={{ color: 'var(--muted)' }}>
                  {recent.filter((c) => c.agentStatus !== 'live').length} tenants
                </span>
              </div>
              <span className="adm-badge setup">Action</span>
            </li>
            <li className="adm-pill">
              <div>
                <strong>Sheet not linked</strong>
                <span className="adm-mono" style={{ color: 'var(--muted)' }}>
                  {recent.length} tenants
                </span>
              </div>
              <span className="adm-badge paused">Warn</span>
            </li>
            <li className="adm-pill">
              <div>
                <strong>Past-due invoices</strong>
                <span className="adm-mono" style={{ color: 'var(--muted)' }}>
                  €0 at risk
                </span>
              </div>
              <span className="adm-badge past_due">Billing</span>
            </li>
          </ul>
          <div style={{ marginTop: 18 }}>
            <Link to="/clients" className="adm-btn adm-btn-ghost" style={{ width: '100%' }}>
              Open subscriber list
            </Link>
          </div>
        </section>
      </div>

      <section className="adm-card" style={{ marginBottom: 0 }}>
        <div className="adm-toolbar" style={{ marginBottom: 0 }}>
          <h2 className="adm-card-title" style={{ marginBottom: 0 }}>
            Paying clients · quick view
          </h2>
          <Link to="/clients" className="adm-btn adm-btn-primary">
            View all
          </Link>
        </div>
        <div className="adm-table-wrap" style={{ marginTop: 18 }}>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Agent</th>
                <th>Messages / mo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong style={{ color: '#fff' }}>{c.businessName}</strong>
                    <div className="adm-mono" style={{ marginTop: 4 }}>
                      {c.email}
                    </div>
                  </td>
                  <td>{c.plan}</td>
                  <td>
                    <span className={`adm-badge ${c.agentStatus}`}>{c.agentStatus}</span>
                  </td>
                  <td>{c.messagesThisMonth.toLocaleString()}</td>
                  <td>
                    <Link to={`/clients/${c.id}`}>Manage</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
