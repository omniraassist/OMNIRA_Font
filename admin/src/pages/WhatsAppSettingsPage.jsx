import { useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';

export function WhatsAppSettingsPage() {
  const [platformWhatsApp, setPlatformWhatsApp] = useState({
    metaAppId: '—',
    metaAppSecret: '—',
    systemUserToken: '—',
    webhookUrl: '—',
    verifyToken: '—',
    graphVersion: '—',
    defaultPhoneNumberId: '—',
  });
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [messageTemplates, setMessageTemplates] = useState([]);

  useEffect(() => {
    let alive = true;
    apiCall('/api/admin/platform-settings')
      .then((res) => {
        if (!alive) return;
        setPlatformWhatsApp(res.platformWhatsApp || {});
        setEmailTemplates(res.emailTemplates || []);
        setMessageTemplates(res.messageTemplates || []);
      })
      .catch(() => {
        if (!alive) return;
        setEmailTemplates([]);
        setMessageTemplates([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <header className="adm-page-head">
        <h1>WhatsApp · platform configuration</h1>
        <p>
          Global Meta Cloud API settings shared across tenants unless you override per client. Webhook URL must stay
          stable; rotate tokens from Meta Business Suite. Per-owner numbers and verified names live under each
          subscriber profile.
        </p>
      </header>

      <div className="adm-two-col-detail">
        <section className="adm-card adm-card-em">
          <h2 className="adm-card-title">Cloud API & webhook</h2>
          <div className="adm-form-grid">
            <div className="adm-field">
              <label>Meta App ID</label>
              <input readOnly value={platformWhatsApp.metaAppId} />
            </div>
            <div className="adm-field">
              <label>App secret</label>
              <input readOnly value={platformWhatsApp.metaAppSecret} />
            </div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
              <label>System user token (long-lived)</label>
              <input readOnly value={platformWhatsApp.systemUserToken} />
              <p className="adm-field-hint">Store server-side only. Shown blurred in production UIs.</p>
            </div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
              <label>Webhook callback URL</label>
              <input readOnly value={platformWhatsApp.webhookUrl} />
            </div>
            <div className="adm-field">
              <label>Verify token</label>
              <input readOnly value={platformWhatsApp.verifyToken} />
            </div>
            <div className="adm-field">
              <label>Graph API version</label>
              <input readOnly value={platformWhatsApp.graphVersion} />
            </div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
              <label>Default phone number ID (fallback)</label>
              <input readOnly value={platformWhatsApp.defaultPhoneNumberId} />
            </div>
          </div>
          <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="adm-btn adm-btn-primary">
              Save changes
            </button>
            <button type="button" className="adm-btn adm-btn-ghost">
              Test webhook
            </button>
            <button type="button" className="adm-btn adm-btn-ghost">
              Rotate verify token
            </button>
          </div>
        </section>

        <aside className="adm-card">
          <h2 className="adm-card-title">Health</h2>
          <ul className="adm-pill-list">
            <li className="adm-pill">
              <div>
                <strong>Delivery latency p95</strong>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Inbound → worker</span>
              </div>
              <span style={{ color: 'var(--em)', fontWeight: 800 }}>420ms</span>
            </li>
            <li className="adm-pill">
              <div>
                <strong>Webhook errors (24h)</strong>
              </div>
              <span style={{ color: 'var(--muted)', fontWeight: 700 }}>0</span>
            </li>
            <li className="adm-pill">
              <div>
                <strong>Coexistence mode</strong>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Optional Business app</span>
              </div>
              <span className="adm-badge live">On</span>
            </li>
          </ul>
        </aside>
      </div>

      <section className="adm-card" style={{ marginTop: 22 }}>
        <h2 className="adm-card-title">Message templates (platform)</h2>
        <p className="adm-field-hint" style={{ marginBottom: 16 }}>
          Marketing / utility templates submitted under your Tech Provider. Client-specific locales can be forked per
          WABA once Meta approves naming.
        </p>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Template name</th>
                <th>Category</th>
                <th>Status</th>
                <th>Last synced</th>
              </tr>
            </thead>
            <tbody>
              {messageTemplates.map((t) => (
                <tr key={t.id}>
                  <td>{t.template_name}</td>
                  <td>{t.category}</td>
                  <td>
                    <span className={`adm-badge ${String(t.status || '').toLowerCase() === 'approved' ? 'live' : 'paused'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="adm-mono">{t.last_synced_at ? new Date(t.last_synced_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {messageTemplates.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--muted)' }}>
                    No WhatsApp templates found in database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="adm-card" style={{ marginTop: 22 }}>
        <h2 className="adm-card-title">Transactional email routing</h2>
        <p className="adm-field-hint" style={{ marginBottom: 16 }}>
          When a booking is confirmed over WhatsApp, Omnira can send HTML emails via your ESP. Below are the default
          bindings; per-client overrides sit in the subscriber&apos;s Integrations tab.
        </p>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Trigger</th>
                <th>Last edited</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {emailTemplates.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong style={{ color: '#fff' }}>{t.name}</strong>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--soft)' }}>{t.trigger}</td>
                  <td className="adm-mono">{t.lastEdited}</td>
                  <td>
                    <button type="button" className="adm-btn adm-btn-ghost" style={{ padding: '6px 12px' }}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {emailTemplates.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--muted)' }}>
                    No templates configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
