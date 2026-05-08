import { useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

export function AnalyticsPage() {
  const [analyticsSeries, setAnalyticsSeries] = useState([]);
  const [funnelStages, setFunnelStages] = useState([]);

  useEffect(() => {
    let alive = true;
    apiCall('/api/admin/analytics')
      .then((res) => {
        if (!alive) return;
        setAnalyticsSeries(res.series || []);
        setFunnelStages(res.funnel || []);
      })
      .catch(() => {
        if (!alive) return;
        setAnalyticsSeries([]);
        setFunnelStages([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const maxMsg = useMemo(
    () => Math.max(1, ...analyticsSeries.map((d) => Number(d.messages || 0))),
    [analyticsSeries]
  );
  const maxLeads = useMemo(
    () => Math.max(1, ...analyticsSeries.map((d) => Number(d.newLeads || 0))),
    [analyticsSeries]
  );

  return (
    <>
      <header className="adm-page-head">
        <h1>Analytics</h1>
        <p>
          End-to-end behaviour of your white-label WhatsApp agents: how visitors open the widget, message volume,
          qualification, proposed slots, and confirmed bookings. Use this view to coach owners and tune defaults.
        </p>
      </header>

      <div className="adm-grid-2">
        <section className="adm-card">
          <h2 className="adm-card-title">Messages per day (all tenants)</h2>
          <div className="adm-chart-bars" style={{ height: 220 }}>
            {analyticsSeries.map((d) => (
              <div key={d.label} className="adm-chart-bar-wrap">
                <div
                  className="adm-chart-bar"
                  style={{
                    height: `${(d.messages / maxMsg) * 100}%`,
                    background: 'linear-gradient(180deg, #60a5fa, rgba(96,165,250,0.25))',
                  }}
                  title={`${d.messages} msgs`}
                />
                <span className="adm-chart-label">{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="adm-card">
          <h2 className="adm-card-title">New leads (widget → first reply)</h2>
          <div className="adm-chart-bars" style={{ height: 220 }}>
            {analyticsSeries.map((d) => (
              <div key={d.label} className="adm-chart-bar-wrap">
                <div
                  className="adm-chart-bar"
                  style={{
                    height: `${(Number(d.newLeads || 0) / maxLeads) * 100}%`,
                    background: 'linear-gradient(180deg, #c084fc, rgba(192,132,252,0.25))',
                  }}
                />
                <span className="adm-chart-label">{d.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="adm-card adm-card-em">
        <h2 className="adm-card-title">Conversion funnel · aggregate</h2>
        <p className="adm-field-hint" style={{ marginBottom: 20 }}>
          Stages reflect the standard Omnira booking flow: widget → first inbound message → intent detected → slot
          offered → row written to Google Sheet + confirmation WhatsApp + dual email (customer + business owner).
        </p>
        {funnelStages.map((row) => (
          <div key={row.stage} className="adm-funnel-row">
            <div className="adm-funnel-label">{row.stage}</div>
            <div className="adm-funnel-track">
              <div className="adm-funnel-fill" style={{ width: `${row.pct}%` }}>
                <span>{row.count.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="adm-card" style={{ marginTop: 22 }}>
        <h2 className="adm-card-title">Operational notes</h2>
        <div className="adm-two-col-detail">
          <div>
            <p style={{ fontSize: 14, color: 'var(--soft)', lineHeight: 1.65, marginBottom: 14 }}>
              When a paid owner finishes Meta Business verification and connects their display phone number, the
              floating WhatsApp launcher on their deployed site routes to the same Cloud API sender. Session logs
              under <strong style={{ color: '#fff' }}>Live sessions</strong> show who is editing context or billing
              in real time.
            </p>
            <p style={{ fontSize: 14, color: 'var(--soft)', lineHeight: 1.65 }}>
              Sheet append failures and email bounces should surface as alerts (wire your backend); this UI is
              structured so each row in <strong style={{ color: '#fff' }}>Paid subscribers</strong> deep-links into
              per-owner WhatsApp + bot context tabs.
            </p>
          </div>
          <aside className="adm-card" style={{ padding: 18 }}>
            <div className="adm-stat-label">Avg. time to first booking</div>
            <div className="adm-stat-value" style={{ fontSize: 22 }}>
              6m 12s
            </div>
            <div className="adm-stat-delta up" style={{ marginTop: 8 }}>
              −14% vs prior week
            </div>
            <div className="adm-divider" />
            <div className="adm-stat-label">Handoff to human</div>
            <div className="adm-stat-value" style={{ fontSize: 22 }}>
              4.1%
            </div>
            <p className="adm-field-hint">Of threads that reached “qualified intent”.</p>
          </aside>
        </div>
      </section>
    </>
  );
}
