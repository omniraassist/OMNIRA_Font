import { useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

export function AnalyticsPage() {
  const [series, setSeries] = useState([]);
  const [funnel, setFunnel] = useState([]);
  const [topIntents, setTopIntents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiCall('/api/admin/analytics')
      .then((res) => {
        if (!alive) return;
        setSeries(res.series || []);
        setFunnel(res.funnel || []);
        setTopIntents(res.topIntents || []);
        setError('');
      })
      .catch((e) => {
        if (!alive) return;
        setSeries([]);
        setFunnel([]);
        setTopIntents([]);
        setError(e?.message || 'Could not load analytics');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const maxMsg = useMemo(
    () => Math.max(1, ...series.map((d) => Number(d.messages || 0))),
    [series]
  );
  const maxLeads = useMemo(
    () => Math.max(1, ...series.map((d) => Number(d.newLeads || 0))),
    [series]
  );

  return (
    <>
      <header className="adm-page-head">
        <h1>Analytics</h1>
        <p>
          Real WhatsApp activity from <code>wa_messages</code> and <code>wa_leads</code>. Funnel stages reflect the
          live lead lifecycle (<em>new → contacted → qualified/converted</em>) — no projections, no mocks.
        </p>
      </header>

      {error ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Error:</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{error}</span>
        </div>
      ) : null}

      <div className="adm-grid-2">
        <section className="adm-card">
          <h2 className="adm-card-title">Messages per day · last 7 days</h2>
          <div className="adm-chart-bars" style={{ height: 220 }}>
            {series.map((d) => (
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
            {!series.length && !loading ? (
              <span style={{ color: 'var(--muted)' }}>No data yet.</span>
            ) : null}
          </div>
        </section>

        <section className="adm-card">
          <h2 className="adm-card-title">New leads · last 7 days</h2>
          <div className="adm-chart-bars" style={{ height: 220 }}>
            {series.map((d) => (
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
            {!series.length && !loading ? (
              <span style={{ color: 'var(--muted)' }}>No data yet.</span>
            ) : null}
          </div>
        </section>
      </div>

      <section className="adm-card adm-card-em">
        <h2 className="adm-card-title">Lead conversion funnel</h2>
        <p className="adm-field-hint" style={{ marginBottom: 20 }}>
          Counts come straight from <code>wa_leads.status</code>. Percentages are versus the current week's new
          leads, not historical averages.
        </p>
        {funnel.map((row) => (
          <div key={row.stage} className="adm-funnel-row">
            <div className="adm-funnel-label">{row.stage}</div>
            <div className="adm-funnel-track">
              <div className="adm-funnel-fill" style={{ width: `${Math.max(2, Math.min(100, row.pct))}%` }}>
                <span>{Number(row.count).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
        {!funnel.length && !loading ? (
          <p style={{ color: 'var(--muted)' }}>No leads yet.</p>
        ) : null}
      </section>

      <section className="adm-card" style={{ marginTop: 22 }}>
        <h2 className="adm-card-title">Top intents · last 7 days</h2>
        {topIntents.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No intents extracted yet (the OpenAI extractor populates this column).</p>
        ) : (
          <div className="adm-table-wrap" style={{ marginTop: 4 }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Intent</th>
                  <th>Leads</th>
                </tr>
              </thead>
              <tbody>
                {topIntents.map((row) => (
                  <tr key={row.intent}>
                    <td className="adm-mono">{row.intent}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
