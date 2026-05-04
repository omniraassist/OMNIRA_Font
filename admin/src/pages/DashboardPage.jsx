import { Link } from 'react-router-dom';
import { dashboardKpis, analyticsSeries, paidClients } from '../data/mockData.js';

const maxBar = Math.max(...analyticsSeries.map((d) => d.bookings));

export function DashboardPage() {
  const recent = paidClients.slice(0, 4);

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
        {dashboardKpis.map((k) => (
          <article key={k.id} className="adm-card adm-card-em">
            <div className="adm-stat-label">{k.label}</div>
            <div className="adm-stat-value">{k.value}</div>
            <div className={`adm-stat-delta ${k.up ? 'up' : 'down'}`}>
              {k.change} <span style={{ fontWeight: 500, color: 'var(--muted)' }}>vs last week</span>
            </div>
            <p className="adm-stat-hint">{k.hint}</p>
          </article>
        ))}
      </div>

      <div className="adm-grid-2">
        <section className="adm-card">
          <h2 className="adm-card-title">Bookings · last 7 days</h2>
          <div className="adm-chart-bars">
            {analyticsSeries.map((d) => (
              <div key={d.label} className="adm-chart-bar-wrap">
                <div
                  className="adm-chart-bar"
                  style={{ height: `${(d.bookings / maxBar) * 100}%` }}
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
                  3 tenants
                </span>
              </div>
              <span className="adm-badge setup">Action</span>
            </li>
            <li className="adm-pill">
              <div>
                <strong>Sheet not linked</strong>
                <span className="adm-mono" style={{ color: 'var(--muted)' }}>
                  2 tenants
                </span>
              </div>
              <span className="adm-badge paused">Warn</span>
            </li>
            <li className="adm-pill">
              <div>
                <strong>Past-due invoices</strong>
                <span className="adm-mono" style={{ color: 'var(--muted)' }}>
                  €298 at risk
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
