import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { apiCall } from '../api/client.js';

const defaultBotContext = `You are the official WhatsApp assistant for the business. Tone: warm, professional, concise.
Keep replies short, avoid hallucinations, and only confirm services that are configured.`;

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'context', label: 'Bot context' },
  { id: 'integrations', label: 'Sheets & email' },
];

export function ClientDetailPage() {
  const { clientId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';
  const [client, setClient] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [contextDraft, setContextDraft] = useState(defaultBotContext);
  const [sheetUrl, setSheetUrl] = useState('https://docs.google.com/spreadsheets/d/mock_sheet_id/edit');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [guestTpl, setGuestTpl] = useState('booking_confirmed_guest_es');

  useEffect(() => {
    let alive = true;
    apiCall(`/api/admin/clients/${clientId}`)
      .then((res) => {
        if (!alive) return;
        setClient(res.client || null);
        setNotFound(!res.client);
      })
      .catch(() => {
        if (!alive) return;
        setClient(null);
        setNotFound(true);
      });
    return () => {
      alive = false;
    };
  }, [clientId]);

  useEffect(() => {
    if (!client) return;
    setOwnerEmail(client.email);
    setContextDraft(defaultBotContext);
    setSheetUrl('https://docs.google.com/spreadsheets/d/mock_sheet_id/edit');
    setGuestTpl('booking_confirmed_guest_es');
  }, [client?.id, client?.email]);

  if (notFound) return <Navigate to="/clients" replace />;

  const activeTab = TABS.some((t) => t.id === tab) ? tab : 'overview';
  const safeClient = useMemo(
    () =>
      client || {
        id: clientId,
        businessName: 'Loading...',
        ownerName: '',
        email: '',
        plan: 'N/A',
        mrr: 0,
        status: 'active',
        deployedSite: '—',
        agentStatus: 'setup',
        messagesThisMonth: 0,
        bookingsThisMonth: 0,
        whatsappDisplay: '—',
        waBusinessId: '—'
      },
    [client, clientId]
  );

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <nav className="adm-breadcrumb">
        <Link to="/clients">Paid subscribers</Link>
        <span>/</span>
        <span style={{ color: 'var(--soft)' }}>{safeClient.businessName}</span>
      </nav>

      <header className="adm-page-head">
        <h1>{safeClient.businessName}</h1>
        <p>
          Paid owner workspace: subscription health, WhatsApp Business assets, the instructions your model uses on
          their number, and where booking rows + emails go. Everything below is static UI for your engineers to bind
          to REST/GraphQL.
        </p>
      </header>

      <div className="adm-tabs" role="tablist" aria-label="Client sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`adm-tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="adm-two-col-detail">
          <section className="adm-card">
            <h2 className="adm-card-title">Account</h2>
            <div className="adm-form-grid">
              <div className="adm-field">
                <label>Owner name</label>
                <input readOnly value={safeClient.ownerName} />
              </div>
              <div className="adm-field">
                <label>Owner email</label>
                <input readOnly value={safeClient.email} />
              </div>
              <div className="adm-field">
                <label>Plan</label>
                <input readOnly value={`${safeClient.plan} · €${safeClient.mrr}/mo`} />
              </div>
              <div className="adm-field">
                <label>Billing status</label>
                <input readOnly value={safeClient.status} />
              </div>
              <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
                <label>Deployed customer site</label>
                <input readOnly value={safeClient.deployedSite} />
                <p className="adm-field-hint">Snippet hosts the floating WhatsApp launcher pointing at this WABA.</p>
              </div>
            </div>
            <div className="adm-divider" />
            <h2 className="adm-card-title" style={{ marginBottom: 14 }}>
              Agent runtime
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <span className={`adm-badge ${safeClient.agentStatus}`}>{safeClient.agentStatus}</span>
              <span style={{ fontSize: 14, color: 'var(--soft)' }}>
                {safeClient.messagesThisMonth.toLocaleString()} messages · {safeClient.bookingsThisMonth} bookings this month
              </span>
            </div>
          </section>

          <aside className="adm-card">
            <h2 className="adm-card-title">Quick actions</h2>
            <div className="adm-pill-list">
              <button type="button" className="adm-btn adm-btn-primary" style={{ width: '100%' }}>
                Impersonate owner (mock)
              </button>
              <button type="button" className="adm-btn adm-btn-ghost" style={{ width: '100%' }}>
                Open Stripe customer
              </button>
              <button type="button" className="adm-btn adm-btn-ghost" style={{ width: '100%' }}>
                Pause agent
              </button>
            </div>
            <p className="adm-field-hint" style={{ marginTop: 14 }}>
              Pausing stops outbound Cloud API sends while preserving chat history in your warehouse.
            </p>
          </aside>
        </div>
      )}

      {activeTab === 'whatsapp' && (
        <section className="adm-card adm-card-em">
          <h2 className="adm-card-title">WhatsApp configuration · this subscriber</h2>
          <p className="adm-field-hint" style={{ marginBottom: 20 }}>
            Maps the paid owner&apos;s WhatsApp Business Account to Omnira. After Meta approves the display name,
            end-users see the verified business when the site widget deep-links to wa.me or Cloud API threads.
          </p>
          <div className="adm-form-grid">
            <div className="adm-field">
              <label>Display phone (masked)</label>
              <input readOnly value={safeClient.whatsappDisplay} />
            </div>
            <div className="adm-field">
              <label>WABA ID</label>
              <input readOnly value={safeClient.waBusinessId} />
            </div>
            <div className="adm-field">
              <label>Phone number ID</label>
              <input readOnly value="105928****** (per number)" />
            </div>
            <div className="adm-field">
              <label>Quality rating</label>
              <input readOnly value="High · last incident none" />
            </div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
              <label>Embedded signup link</label>
              <input readOnly value={`https://omnira.app/onboard/${safeClient.id}?source=admin`} />
            </div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
              <label>Webhook overrides</label>
              <textarea
                readOnly
                rows={3}
                value="Inherit platform webhook. No per-tenant URL override."
                style={{ minHeight: 80 }}
              />
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="adm-btn adm-btn-primary">
              Re-request verification
            </button>
            <button type="button" className="adm-btn adm-btn-ghost">
              Download QR pairing payload
            </button>
          </div>
        </section>
      )}

      {activeTab === 'context' && (
        <section className="adm-card">
          <h2 className="adm-card-title">Chatbot context · system instructions</h2>
          <p className="adm-field-hint" style={{ marginBottom: 16 }}>
            This text is injected as the highest-priority system layer for the LLM that powers this client&apos;s
            agent. Keep services, tone, and compliance rules here; sync version history from your backend.
          </p>
          <div className="adm-field">
            <label>Prompt bundle (editable mock)</label>
            <textarea value={contextDraft} onChange={(e) => setContextDraft(e.target.value)} spellCheck={false} />
            <p className="adm-field-hint">
              Suggested sections: brand voice, services & durations, pricing policy, working hours, escalation to
              human, GDPR/consent phrasing, and post-booking behaviour (Sheet row shape + email triggers).
            </p>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="adm-btn adm-btn-primary">
              Save draft (local only)
            </button>
            <button type="button" className="adm-btn adm-btn-ghost">
              Restore template default
            </button>
            <button type="button" className="adm-btn adm-btn-ghost">
              Preview in playground
            </button>
          </div>
        </section>
      )}

      {activeTab === 'integrations' && (
        <div className="adm-grid-2" style={{ marginBottom: 0 }}>
          <section className="adm-card">
            <h2 className="adm-card-title">Google Sheets · booking log</h2>
            <p className="adm-field-hint" style={{ marginBottom: 16 }}>
              Each confirmed appointment appends one sanitized row (timestamp, service, staff slot, customer phone,
              consent flags). Service account email must have Editor access to the sheet.
            </p>
            <div className="adm-field">
              <label>Spreadsheet URL</label>
              <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
            </div>
            <div className="adm-field" style={{ marginTop: 14 }}>
              <label>Tab name</label>
              <input defaultValue="Omnira_Bookings" />
            </div>
            <div className="adm-field" style={{ marginTop: 14 }}>
              <label>Service account</label>
              <input readOnly value="sheets-bot@omnira-prod.iam.gserviceaccount.com" />
            </div>
            <button type="button" className="adm-btn adm-btn-primary" style={{ marginTop: 16 }}>
              Validate & sync columns
            </button>
          </section>

          <section className="adm-card">
            <h2 className="adm-card-title">Email notifications</h2>
            <p className="adm-field-hint" style={{ marginBottom: 16 }}>
              Dual send: beautiful confirmation to the guest and an operational copy to the business owner WhatsApp
              admin email. Attach .ics optionally from your worker.
            </p>
            <div className="adm-field">
              <label>Owner alert email</label>
              <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
            </div>
            <div className="adm-field" style={{ marginTop: 14 }}>
              <label>Guest template</label>
              <select value={guestTpl} onChange={(e) => setGuestTpl(e.target.value)}>
                <option value="booking_confirmed_guest_es">booking_confirmed_guest_es</option>
                <option value="booking_confirmed_guest_en">booking_confirmed_guest_en</option>
              </select>
            </div>
            <div className="adm-field" style={{ marginTop: 14 }}>
              <label>BCC audit</label>
              <input readOnly value="audit+bookings@omnira.internal" />
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, fontSize: 14, color: 'var(--soft)' }}>
              <input type="checkbox" defaultChecked style={{ width: 18, height: 18 }} />
              Send owner SMS via Meta template when email bounces
            </label>
          </section>
        </div>
      )}
    </>
  );
}
