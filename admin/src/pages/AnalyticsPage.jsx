import { useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

// ---------------------------------------------------------------------------
// Scoped styles. Uses existing theme tokens (--em, --surf, --border-em…).
// ---------------------------------------------------------------------------
const STYLES = `
  .a-page { display: flex; flex-direction: column; gap: 18px; }

  .a-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .a-kpi {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 16px 18px;
    position: relative; overflow: hidden;
    transition: border-color .2s ease, transform .2s ease;
  }
  .a-kpi::after {
    content: ''; position: absolute; right: -40px; top: -40px;
    width: 140px; height: 140px;
    background: radial-gradient(closest-side, rgba(0,229,160,0.08), transparent 70%);
    pointer-events: none;
  }
  .a-kpi:hover { border-color: var(--border-em); }
  .a-kpi.em { border-color: var(--border-em); }
  .a-kpi-label { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
  .a-kpi-value { font-family: var(--font-display); font-size: 30px; line-height: 1.1; color: var(--text); margin: 6px 0; font-weight: 700; }
  .a-kpi-value .unit { font-size: 14px; color: var(--soft); margin-left: 6px; font-weight: 500; }
  .a-kpi-foot { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--soft); }
  .a-trend { padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 11px; letter-spacing: .02em; }
  .a-trend.up { background: rgba(0,229,160,0.12); color: var(--em); }
  .a-trend.down { background: rgba(239,68,68,0.12); color: #fca5a5; }
  .a-trend.flat { background: rgba(148,163,184,0.12); color: var(--soft); }

  .a-section-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin: 6px 4px 8px;
  }
  .a-section-head h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 14px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--text);
  }
  .a-section-sub { color: var(--muted); font-size: 12px; }

  .a-card {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 18px;
  }

  .a-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; }
  .a-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }

  /* Area chart */
  .a-chart-wrap { position: relative; }
  .a-chart-legend { display: flex; gap: 14px; font-size: 12px; color: var(--soft); margin-bottom: 10px; }
  .a-legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: middle; }

  /* Donut */
  .a-donut-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .a-donut-legend { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 160px; }
  .a-donut-item { display: grid; grid-template-columns: 12px 1fr auto auto; gap: 8px; align-items: center; font-size: 13px; }
  .a-donut-swatch { width: 12px; height: 12px; border-radius: 3px; }
  .a-donut-label { color: var(--text); text-transform: capitalize; }
  .a-donut-count { color: var(--soft); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .a-donut-pct { color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 11px; }
  .a-donut-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    pointer-events: none;
  }
  .a-donut-center .v { font-family: var(--font-display); font-size: 26px; color: var(--text); font-weight: 700; }
  .a-donut-center .l { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }

  /* Horizontal bar list */
  .a-hbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .a-hbar-label { width: 100px; font-size: 12px; color: var(--text); text-transform: capitalize; }
  .a-hbar-track { flex: 1; height: 10px; background: rgba(255,255,255,0.05); border-radius: 999px; overflow: hidden; position: relative; }
  .a-hbar-fill { height: 100%; background: linear-gradient(90deg, var(--em) 0%, #60a5fa 100%); border-radius: 999px; transition: width .4s ease; }
  .a-hbar-count { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--soft); width: 60px; text-align: right; }

  /* Funnel */
  .a-funnel { display: flex; flex-direction: column; gap: 10px; }
  .a-funnel-row { display: grid; grid-template-columns: 140px 1fr 80px; align-items: center; gap: 12px; }
  .a-funnel-label { font-size: 13px; color: var(--text); font-weight: 600; }
  .a-funnel-track { height: 28px; background: rgba(255,255,255,0.04); border-radius: 8px; overflow: hidden; }
  .a-funnel-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--em) 0%, rgba(0,229,160,0.55) 100%);
    display: flex; align-items: center; padding: 0 12px;
    color: #00120a; font-weight: 700; font-size: 12px;
    transition: width .5s ease;
    min-width: 24px;
  }
  .a-funnel-count { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--soft); text-align: right; }

  /* Revenue bars */
  .a-bars { display: flex; align-items: flex-end; gap: 10px; height: 180px; padding-top: 14px; }
  .a-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; }
  .a-bar-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--em); }
  .a-bar { width: 100%; max-width: 60px; background: linear-gradient(180deg, var(--em) 0%, rgba(0,229,160,0.25) 100%); border-radius: 8px 8px 2px 2px; min-height: 2px; transition: height .4s ease; }
  .a-bar-label { font-size: 11px; color: var(--muted); }

  /* Health pill row */
  .a-health-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .a-health {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 14px;
    flex: 1; min-width: 140px;
  }
  .a-health-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .a-health-value { font-family: var(--font-display); font-size: 22px; color: var(--text); font-weight: 700; }

  .a-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; }
  .a-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .a-empty { color: var(--muted); padding: 24px; text-align: center; font-size: 13px; }
`;

// ---------------------------------------------------------------------------
// SVG chart components (all pure, deterministic, sized via viewBox so they
// scale with the container width without re-rendering on resize).
// ---------------------------------------------------------------------------

function AreaChart({ data, height = 220 }) {
  const w = 800;
  const h = height;
  const pad = { t: 14, r: 16, b: 28, l: 36 };
  const maxIn = Math.max(1, ...data.map((d) => d.inbound + d.outbound));
  const stepX = (w - pad.l - pad.r) / Math.max(1, data.length - 1);
  const yScale = (v) => h - pad.b - (v / maxIn) * (h - pad.t - pad.b);
  const xAt = (i) => pad.l + i * stepX;

  // Build stacked area: outbound on top of inbound
  const totals = data.map((d) => d.inbound + d.outbound);
  const inboundOnly = data.map((d) => d.inbound);

  function buildPath(values, baseline = false) {
    if (values.length === 0) return '';
    let path = `M ${xAt(0)} ${yScale(values[0])}`;
    for (let i = 1; i < values.length; i += 1) {
      const x1 = xAt(i - 1) + stepX / 2;
      const x2 = xAt(i) - stepX / 2;
      path += ` C ${x1} ${yScale(values[i - 1])}, ${x2} ${yScale(values[i])}, ${xAt(i)} ${yScale(values[i])}`;
    }
    if (baseline) {
      path += ` L ${xAt(values.length - 1)} ${h - pad.b}`;
      path += ` L ${xAt(0)} ${h - pad.b} Z`;
    }
    return path;
  }

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxIn / yTicks) * i));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="areaTotal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(96,165,250,0.45)" />
          <stop offset="100%" stopColor="rgba(96,165,250,0.02)" />
        </linearGradient>
        <linearGradient id="areaInbound" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,229,160,0.55)" />
          <stop offset="100%" stopColor="rgba(0,229,160,0.04)" />
        </linearGradient>
      </defs>
      {/* Y grid */}
      {tickValues.map((v, i) => {
        const y = yScale(v);
        return (
          <g key={`g${i}`}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
            <text x={pad.l - 6} y={y + 3} fontSize="10" fill="#4d6080" textAnchor="end" fontFamily="'JetBrains Mono', monospace">{v}</text>
          </g>
        );
      })}
      {/* Areas */}
      <path d={buildPath(totals, true)} fill="url(#areaTotal)" />
      <path d={buildPath(inboundOnly, true)} fill="url(#areaInbound)" />
      <path d={buildPath(totals)} fill="none" stroke="#60a5fa" strokeWidth="2" />
      <path d={buildPath(inboundOnly)} fill="none" stroke="#00e5a0" strokeWidth="2" />
      {/* X labels (every Nth so they don't collide) */}
      {data.map((d, i) => {
        const stride = Math.max(1, Math.floor(data.length / 8));
        if (i % stride !== 0 && i !== data.length - 1) return null;
        return (
          <text
            key={d.date}
            x={xAt(i)}
            y={h - 8}
            fontSize="10"
            fill="#4d6080"
            textAnchor="middle"
            fontFamily="'JetBrains Mono', monospace"
          >
            {d.label.split(' ').pop()}
          </text>
        );
      })}
    </svg>
  );
}

const DONUT_COLORS = ['#00e5a0', '#60a5fa', '#c084fc', '#fbbf24', '#fb7185', '#94a3b8'];

function Donut({ data, total, centerLabel, centerValue, size = 200 }) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s / 2 - 18;
  const innerR = r - 22;

  if (!total || data.length === 0) {
    return (
      <div style={{ width: s, height: s, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>
        no data
      </div>
    );
  }

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const value = d.count;
    const start = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
    cumulative += value;
    const end = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + Math.cos(start) * r;
    const y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end) * r;
    const y2 = cy + Math.sin(end) * r;
    const ix1 = cx + Math.cos(end) * innerR;
    const iy1 = cy + Math.sin(end) * innerR;
    const ix2 = cx + Math.cos(start) * innerR;
    const iy2 = cy + Math.sin(start) * innerR;
    const path =
      value > 0
        ? `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`
        : '';
    return { ...d, color: DONUT_COLORS[i % DONUT_COLORS.length], path };
  });

  return (
    <div style={{ position: 'relative', width: s, height: s }}>
      <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s}>
        {segments.map((seg) => (
          <path key={seg.label || seg.status || seg.intent || seg.id} d={seg.path} fill={seg.color} opacity="0.92" />
        ))}
      </svg>
      <div className="a-donut-center">
        <div className="v">{centerValue}</div>
        <div className="l">{centerLabel}</div>
      </div>
    </div>
  );
}

function StatusDonutCard({ statusDistribution, total }) {
  const data = statusDistribution
    .map((s) => ({ ...s, label: s.status }))
    .filter((s) => s.count > 0);
  return (
    <section className="a-card">
      <div className="a-section-head"><h2>Lead status breakdown</h2><span className="a-section-sub">all-time</span></div>
      <div className="a-donut-row">
        <Donut data={data} total={total} centerValue={total} centerLabel="leads" />
        <div className="a-donut-legend">
          {statusDistribution.map((s, i) => (
            <div key={s.status} className="a-donut-item">
              <div className="a-donut-swatch" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="a-donut-label">{s.status}</span>
              <span className="a-donut-count">{s.count}</span>
              <span className="a-donut-pct">{s.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanDonutCard({ planDistribution, activeSubscribers }) {
  const data = planDistribution.map((p) => ({ label: p.label || p.id, count: p.count }));
  return (
    <section className="a-card">
      <div className="a-section-head"><h2>Active subscriber plans</h2><span className="a-section-sub">current</span></div>
      {activeSubscribers === 0 ? (
        <div className="a-empty">No active paid subscribers yet.</div>
      ) : (
        <div className="a-donut-row">
          <Donut data={data} total={activeSubscribers} centerValue={activeSubscribers} centerLabel="subscribers" />
          <div className="a-donut-legend">
            {planDistribution.map((p, i) => (
              <div key={p.id} className="a-donut-item">
                <div className="a-donut-swatch" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                <span className="a-donut-label">{p.label || p.id}</span>
                <span className="a-donut-count">{p.count}</span>
                <span className="a-donut-pct">{activeSubscribers ? ((p.count / activeSubscribers) * 100).toFixed(0) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function HBar({ items, valueKey = 'count', labelKey = 'label' }) {
  const max = Math.max(1, ...items.map((d) => Number(d[valueKey] || 0)));
  return (
    <div>
      {items.map((d) => (
        <div key={d[labelKey]} className="a-hbar">
          <span className="a-hbar-label" title={d[labelKey]}>{d[labelKey]}</span>
          <div className="a-hbar-track">
            <div className="a-hbar-fill" style={{ width: `${(Number(d[valueKey]) / max) * 100}%` }} />
          </div>
          <span className="a-hbar-count">{d[valueKey]}{d.pct != null ? ` · ${d.pct.toFixed(0)}%` : ''}</span>
        </div>
      ))}
      {items.length === 0 ? <div className="a-empty">no data yet</div> : null}
    </div>
  );
}

function Funnel({ funnel }) {
  const max = Math.max(1, ...funnel.map((r) => r.count));
  return (
    <div className="a-funnel">
      {funnel.map((row) => (
        <div key={row.stage} className="a-funnel-row">
          <div className="a-funnel-label">{row.stage}</div>
          <div className="a-funnel-track">
            <div className="a-funnel-fill" style={{ width: `${(row.count / max) * 100}%` }}>
              {row.pct.toFixed(0)}%
            </div>
          </div>
          <div className="a-funnel-count">{row.count.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

function MonthlyRevenueBars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.amount_cents));
  return (
    <div className="a-bars">
      {data.map((m) => (
        <div key={m.month} className="a-bar-col">
          <div className="a-bar-val">€{m.amount_euro.toFixed(0)}</div>
          <div className="a-bar" style={{ height: `${(m.amount_cents / max) * 100}%` }} />
          <div className="a-bar-label">{m.label}</div>
        </div>
      ))}
    </div>
  );
}

function TrendPill({ pct }) {
  if (pct === 0) return <span className="a-trend flat">±0%</span>;
  if (pct > 0) return <span className="a-trend up">▲ {pct}%</span>;
  return <span className="a-trend down">▼ {Math.abs(pct)}%</span>;
}

// ---------------------------------------------------------------------------
export function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiCall('/api/admin/analytics')
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError('');
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message || 'Could not load analytics');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const kpis = data?.kpis;
  const daily = data?.dailySeries || [];

  const totalsLast30 = useMemo(() => {
    let inb = 0, out = 0, leads = 0;
    for (const d of daily) {
      inb += d.inbound; out += d.outbound; leads += d.leads;
    }
    return { inbound: inb, outbound: out, leads };
  }, [daily]);

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>Analytics</h1>
        <p>
          Real-time view of the Omnira platform. Everything below comes from{' '}
          <code>wa_messages</code>, <code>wa_leads</code>, <code>customer_payments</code>,{' '}
          <code>customer_users</code> and <code>openai_api_keys</code>. Nothing is mocked or projected.
          {data?.generated_at ? <> · Generated {new Date(data.generated_at).toLocaleTimeString()}</> : null}
        </p>
      </header>

      {error ? <div className="a-banner err"><strong>Error:</strong> {error}</div> : null}

      {loading && !data ? (
        <div className="a-empty">Loading analytics…</div>
      ) : !data ? null : (
        <div className="a-page">
          {/* KPIs */}
          <div className="a-kpis">
            <article className="a-kpi em">
              <div className="a-kpi-label">Leads this week</div>
              <div className="a-kpi-value">{kpis.leadsThisWeek}<span className="unit">leads</span></div>
              <div className="a-kpi-foot"><TrendPill pct={kpis.leadsDeltaPct} /><span>vs last week ({kpis.leadsLastWeek})</span></div>
            </article>
            <article className="a-kpi">
              <div className="a-kpi-label">Messages this week</div>
              <div className="a-kpi-value">{kpis.msgThisWeek}<span className="unit">msgs</span></div>
              <div className="a-kpi-foot"><TrendPill pct={kpis.msgDeltaPct} /><span>vs last week ({kpis.msgLastWeek})</span></div>
            </article>
            <article className="a-kpi">
              <div className="a-kpi-label">Conversion rate</div>
              <div className="a-kpi-value">{kpis.conversionRate.toFixed(1)}<span className="unit">%</span></div>
              <div className="a-kpi-foot">
                <span>{kpis.convertedLeads} converted of {kpis.totalLeads} all-time</span>
              </div>
            </article>
            <article className="a-kpi">
              <div className="a-kpi-label">Avg messages / lead</div>
              <div className="a-kpi-value">{kpis.avgMsgPerLead}<span className="unit">msgs</span></div>
              <div className="a-kpi-foot">
                <span>{kpis.qualifiedLeads} qualified leads</span>
              </div>
            </article>
            <article className="a-kpi">
              <div className="a-kpi-label">Active subscribers</div>
              <div className="a-kpi-value">{kpis.activeSubscribers}</div>
              <div className="a-kpi-foot">
                <span>Paid + not yet expired</span>
              </div>
            </article>
            <article className="a-kpi em">
              <div className="a-kpi-label">Revenue · last 6 months</div>
              <div className="a-kpi-value">€{kpis.revenue6mEuro.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              <div className="a-kpi-foot">
                <span>From <code>customer_payments</code></span>
              </div>
            </article>
          </div>

          {/* Activity chart */}
          <section className="a-card">
            <div className="a-section-head">
              <h2>WhatsApp activity · last 30 days</h2>
              <span className="a-section-sub">
                {totalsLast30.inbound + totalsLast30.outbound} messages · {totalsLast30.leads} new leads
              </span>
            </div>
            <div className="a-chart-legend">
              <span><span className="a-legend-dot" style={{ background: '#60a5fa' }} />Total messages</span>
              <span><span className="a-legend-dot" style={{ background: '#00e5a0' }} />Inbound only</span>
            </div>
            <div className="a-chart-wrap">
              <AreaChart data={daily} height={220} />
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 12, color: 'var(--soft)' }}>
              <span>Inbound: <strong style={{ color: 'var(--em)' }}>{totalsLast30.inbound}</strong></span>
              <span>Outbound: <strong style={{ color: '#60a5fa' }}>{totalsLast30.outbound}</strong></span>
              <span>Reply ratio: <strong style={{ color: 'var(--text)' }}>
                {totalsLast30.inbound > 0 ? Math.round((totalsLast30.outbound / totalsLast30.inbound) * 100) : 0}%
              </strong></span>
            </div>
          </section>

          {/* Status donut + plan donut */}
          <div className="a-grid-2">
            <StatusDonutCard statusDistribution={data.statusDistribution} total={kpis.totalLeads} />
            <PlanDonutCard planDistribution={data.planDistribution} activeSubscribers={kpis.activeSubscribers} />
          </div>

          {/* Funnel */}
          <section className="a-card">
            <div className="a-section-head"><h2>Conversion funnel</h2><span className="a-section-sub">all-time</span></div>
            <Funnel funnel={data.funnel} />
          </section>

          {/* Intents + languages */}
          <div className="a-grid-2">
            <section className="a-card">
              <div className="a-section-head"><h2>Top intents</h2><span className="a-section-sub">extracted by OpenAI</span></div>
              <HBar items={data.topIntents.map((i) => ({ label: i.intent, count: i.count, pct: i.pct }))} />
            </section>
            <section className="a-card">
              <div className="a-section-head"><h2>Top languages</h2><span className="a-section-sub">detected per lead</span></div>
              <HBar items={data.topLanguages.map((l) => ({ label: l.language, count: l.count, pct: l.pct }))} />
            </section>
          </div>

          {/* Monthly revenue */}
          <section className="a-card">
            <div className="a-section-head"><h2>Monthly revenue · last 6 months</h2><span className="a-section-sub">customer_payments.amount_cents</span></div>
            <MonthlyRevenueBars data={data.monthlyRevenue} />
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--soft)' }}>
              Sum: <strong style={{ color: 'var(--em)' }}>€{kpis.revenue6mEuro.toFixed(2)}</strong>{' '}
              · {data.monthlyRevenue.reduce((s, m) => s + m.payment_count, 0)} payments
            </div>
          </section>

          {/* OpenAI health */}
          <section className="a-card">
            <div className="a-section-head"><h2>OpenAI key fleet</h2><span className="a-section-sub">aggregate health</span></div>
            <div className="a-health-row">
              <div className="a-health">
                <div className="a-health-label">Active keys</div>
                <div className="a-health-value">{data.openaiHealth.active_keys}</div>
              </div>
              <div className="a-health">
                <div className="a-health-label">Successful calls</div>
                <div className="a-health-value" style={{ color: 'var(--em)' }}>{data.openaiHealth.total_successes.toLocaleString()}</div>
              </div>
              <div className="a-health">
                <div className="a-health-label">Failed calls</div>
                <div className="a-health-value" style={{ color: data.openaiHealth.total_failures > 0 ? '#fca5a5' : 'var(--text)' }}>
                  {data.openaiHealth.total_failures.toLocaleString()}
                </div>
              </div>
              <div className="a-health">
                <div className="a-health-label">Success rate</div>
                <div className="a-health-value">
                  {(() => {
                    const t = data.openaiHealth.total_successes + data.openaiHealth.total_failures;
                    if (t === 0) return '—';
                    return `${((data.openaiHealth.total_successes / t) * 100).toFixed(1)}%`;
                  })()}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
