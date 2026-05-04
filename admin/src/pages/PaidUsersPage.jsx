import { Link } from 'react-router-dom';
import { paidClients } from '../data/mockData.js';

export function PaidUsersPage() {
  return (
    <>
      <header className="adm-page-head">
        <h1>Paid subscribers</h1>
        <p>
          Every row is a business that purchased an Omnira WhatsApp agent. Plans bill monthly; MRR rolls up here.
          Open a client to edit WhatsApp routing, bot context, Google Sheet IDs, and notification emails sent on
          each confirmed booking.
        </p>
      </header>

      <div className="adm-toolbar">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="adm-btn adm-btn-primary">
            Export CSV
          </button>
          <button type="button" className="adm-btn adm-btn-ghost">
            Filter · Plan
          </button>
          <button type="button" className="adm-btn adm-btn-ghost">
            Filter · Status
          </button>
        </div>
        <span className="adm-mono" style={{ color: 'var(--muted)' }}>
          {paidClients.length} records · mock data
        </span>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Business & owner</th>
              <th>Plan & MRR</th>
              <th>Billing</th>
              <th>WhatsApp</th>
              <th>Integrations</th>
              <th>Agent</th>
              <th>Activity</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {paidClients.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong style={{ color: '#fff', fontSize: 14 }}>{c.businessName}</strong>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--soft)' }}>{c.ownerName}</div>
                  <div className="adm-mono" style={{ marginTop: 4 }}>
                    {c.email}
                  </div>
                  <div className="adm-mono" style={{ marginTop: 4, color: 'var(--muted)' }}>
                    Site: {c.deployedSite}
                  </div>
                </td>
                <td>
                  <div style={{ fontWeight: 700, color: '#fff' }}>{c.plan}</div>
                  <div style={{ marginTop: 6, color: 'var(--em)' }}>€{c.mrr}/mo</div>
                </td>
                <td>
                  <span className={`adm-badge ${c.status}`}>{c.status.replace('_', ' ')}</span>
                  <div className="adm-mono" style={{ marginTop: 8 }}>
                    Renews {c.renewsAt}
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: 13 }}>{c.whatsappDisplay}</div>
                  <div className="adm-mono" style={{ marginTop: 6, fontSize: 11 }}>
                    {c.waBusinessId}
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                    Sheet: {c.sheetConnected ? '✓ Linked' : '—'}
                    <br />
                    Email: {c.emailsEnabled ? '✓ On' : '—'}
                  </div>
                </td>
                <td>
                  <span className={`adm-badge ${c.agentStatus}`}>{c.agentStatus}</span>
                </td>
                <td>
                  <div style={{ fontSize: 13 }}>{c.messagesThisMonth.toLocaleString()} msgs</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>
                    {c.bookingsThisMonth} bookings
                  </div>
                </td>
                <td>
                  <Link to={`/clients/${c.id}`} className="adm-btn adm-btn-ghost" style={{ padding: '8px 14px' }}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
