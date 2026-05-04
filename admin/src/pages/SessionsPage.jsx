import { sessions } from '../data/mockData.js';

export function SessionsPage() {
  return (
    <>
      <header className="adm-page-head">
        <h1>Live sessions</h1>
        <p>
          Users currently signed into Omnira dashboards (your superadmins, business owners, and staff). Use this to
          debug onboarding, watch someone configure WhatsApp, or audit concurrent access before sensitive changes.
        </p>
      </header>

      <div className="adm-toolbar">
        <button type="button" className="adm-btn adm-btn-primary">
          Refresh (mock)
        </button>
        <span className="adm-mono" style={{ color: 'var(--muted)' }}>
          {sessions.length} active / recent sessions
        </span>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Client scope</th>
              <th>Role</th>
              <th>Network</th>
              <th>Device</th>
              <th>Current area</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong style={{ color: '#fff' }}>{s.user}</strong>
                </td>
                <td>{s.client}</td>
                <td>
                  <span className={`adm-badge ${s.role === 'Superadmin' ? 'trialing' : 'active'}`}>{s.role}</span>
                </td>
                <td className="adm-mono">{s.ip}</td>
                <td style={{ fontSize: 13 }}>{s.device}</td>
                <td style={{ fontSize: 13, color: 'var(--soft)' }}>{s.currentPage}</td>
                <td style={{ color: s.lastSeen === 'Now' ? 'var(--em)' : 'var(--muted)', fontWeight: 600 }}>
                  {s.lastSeen}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="adm-card" style={{ marginTop: 24 }}>
        <h2 className="adm-card-title">How this maps to your product</h2>
        <p style={{ fontSize: 14, color: 'var(--soft)', lineHeight: 1.7 }}>
          A <strong style={{ color: '#fff' }}>paid owner</strong> buys the agent, connects their WhatsApp Business
          number, pastes services and tone into <strong style={{ color: '#fff' }}>bot context</strong>, and deploys
          your white-label snippet so the green bubble appears bottom-right. End users message that number; the
          agent replies, proposes times, and on confirm writes to <strong style={{ color: '#fff' }}>Google Sheets</strong>{' '}
          and fires <strong style={{ color: '#fff' }}>two emails</strong> (confirmation to the guest + copy to the
          owner). Sessions here are the humans configuring those pipelines — not the WhatsApp end-users.
        </p>
      </section>
    </>
  );
}
