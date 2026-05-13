import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiCall } from '../api/client.js';

// ---------------------------------------------------------------------------
// Scoped styles. Uses existing theme tokens (--em, --surf, --border-em…).
// ---------------------------------------------------------------------------
const STYLES = `
  .d-page { display: flex; flex-direction: column; gap: 18px; }

  .d-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .d-kpi {
    position: relative;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 18px;
    overflow: hidden;
    transition: border-color .2s ease, transform .2s ease;
  }
  .d-kpi::after {
    content: ''; position: absolute; right: -50px; top: -50px;
    width: 150px; height: 150px;
    background: radial-gradient(closest-side, rgba(0,229,160,0.10), transparent 70%);
    pointer-events: none;
  }
  .d-kpi:hover { border-color: var(--border-em); }
  .d-kpi.em { border-color: var(--border-em); }
  .d-kpi-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .d-kpi-icon {
    width: 34px; height: 34px;
    border-radius: 10px;
    background: rgba(0,229,160,0.10);
    color: var(--em);
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .d-kpi-label { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
  .d-kpi-value { font-family: var(--font-display); font-size: 28px; line-height: 1.1; color: var(--text); font-weight: 700; }
  .d-kpi-value .unit { font-size: 13px; color: var(--soft); margin-left: 6px; font-weight: 500; }
  .d-kpi-hint { color: var(--soft); font-size: 12px; margin-top: 6px; line-height: 1.4; }

  .d-trend { padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 11px; letter-spacing: .02em; }
  .d-trend.up { background: rgba(0,229,160,0.12); color: var(--em); }
  .d-trend.down { background: rgba(239,68,68,0.12); color: #fca5a5; }
  .d-trend.flat { background: rgba(148,163,184,0.12); color: var(--soft); }

  .d-card {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 20px;
  }
  .d-section-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 14px; gap: 12px;
  }
  .d-section-head h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 15px; letter-spacing: .04em; text-transform: uppercase;
    color: var(--text);
  }
  .d-section-sub { color: var(--muted); font-size: 12px; }

  .d-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; margin-bottom: 4px; }
  .d-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }

  .d-empty { color: var(--muted); padding: 24px; text-align: center; font-size: 13px; }

  /* Recent clients table */
  .d-table-wrap { overflow-x: auto; }
  .d-table { width: 100%; border-collapse: collapse; }
  .d-table thead th {
    text-align: left; padding: 10px 14px;
    font-size: 11px; letter-spacing: .04em; text-transform: uppercase;
    color: var(--muted); font-weight: 700;
    border-bottom: 1px solid var(--border);
  }
  .d-table tbody td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    color: var(--text);
  }
  .d-table tbody tr:hover td { background: rgba(255,255,255,0.02); }
  .d-table .biz strong { color: var(--text); display: block; }
  .d-table .biz small { color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 11px; }
  .d-table .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700; letter-spacing: .02em;
  }
  .d-table .badge.live { background: rgba(0,229,160,0.12); color: var(--em); }
  .d-table .badge.paused { background: rgba(148,163,184,0.12); color: var(--soft); }
  .d-table a { color: var(--em); text-decoration: none; font-weight: 600; }
  .d-table a:hover { text-decoration: underline; }
`;

// ---------------------------------------------------------------------------
// SVG bar chart for the 7-day activity. Stacked inbound (green) + outbound (blue),
// faint track behind every column so empty days are visibly part of the chart.
// Numeric labels above each bar; weekday under each column.
// ---------------------------------------------------------------------------
function WeekChart({ data, height = 220 }) {
  const w = 800;
  const h = height;
  const pad = { t: 30, r: 20, b: 36, l: 44 };
  const innerH = h - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => Number(d.messages || 0)));
  const colW = (w - pad.l - pad.r) / Math.max(1, data.length);
  const barW = Math.min(60, colW * 0.55);
  const yScale = (v) => (v / max) * innerH;

  // Y-axis ticks (4)
  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max / ticks) * i));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="dBarIn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00e5a0" />
          <stop offset="100%" stopColor="rgba(0,229,160,0.40)" />
        </linearGradient>
        <linearGradient id="dBarOut" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="rgba(96,165,250,0.40)" />
        </linearGradient>
      </defs>

      {/* Y grid + tick labels */}
      {tickValues.map((v, i) => {
        const y = h - pad.b - yScale(v);
        return (
          <g key={`g${i}`}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
            <text x={pad.l - 8} y={y + 3} fontSize="10" fill="#4d6080" textAnchor="end" fontFamily="'JetBrains Mono', monospace">{v}</text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const cx = pad.l + i * colW + colW / 2;
        const bx = cx - barW / 2;
        const total = Number(d.messages || 0);
        const inb = Number(d.inbound ?? d.messages ?? 0);
        const outb = Number(d.outbound ?? Math.max(0, total - inb));
        const trackH = innerH;
        const trackY = h - pad.b - trackH;
        const inboundH = yScale(inb);
        const outboundH = yScale(outb);
        const totalH = inboundH + outboundH;
        // Always show at least a thin "empty" track so the column is visible.
        return (
          <g key={d.date}>
            <rect
              x={bx}
              y={trackY}
              width={barW}
              height={trackH}
              rx="6"
              fill="rgba(255,255,255,0.03)"
              stroke="rgba(255,255,255,0.05)"
            />
            {total > 0 ? (
              <>
                {outb > 0 ? (
                  <rect
                    x={bx}
                    y={h - pad.b - totalH}
                    width={barW}
                    height={outboundH}
                    rx="6"
                    fill="url(#dBarOut)"
                  />
                ) : null}
                {inb > 0 ? (
                  <rect
                    x={bx}
                    y={h - pad.b - inboundH}
                    width={barW}
                    height={inboundH}
                    rx="6"
                    fill="url(#dBarIn)"
                  />
                ) : null}
                <text
                  x={cx}
                  y={h - pad.b - totalH - 8}
                  fontSize="11"
                  fontWeight="700"
                  fill="#e2eaf4"
                  textAnchor="middle"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {total}
                </text>
              </>
            ) : (
              <text
                x={cx}
                y={h - pad.b - 6}
                fontSize="10"
                fill="#4d6080"
                textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
              >
                0
              </text>
            )}
            <text
              x={cx}
              y={h - 10}
              fontSize="11"
              fill="#8fa3c0"
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TrendPill({ pct }) {
  if (pct === 0) return <span className="d-trend flat">±0%</span>;
  if (pct > 0) return <span className="d-trend up">▲ {pct}%</span>;
  return <span className="d-trend down">▼ {Math.abs(pct)}%</span>;
}

const KPI_ICONS = {
  customers: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm12 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
    </svg>
  ),
  paid: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" strokeLinejoin="round" />
    </svg>
  ),
  leads: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 11a9 9 0 0 1 18 0v9H6a3 3 0 0 1-3-3v-6z" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="1.5" fill="currentColor" />
    </svg>
  ),
  messages_month: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinejoin="round" />
    </svg>
  ),
  payments_month: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h2" strokeLinecap="round" />
    </svg>
  ),
  revenue_month: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" />
    </svg>
  ),
  admins: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 22s-8-4-8-12V5l8-3 8 3v5c0 8-8 12-8 12z" strokeLinejoin="round" />
    </svg>
  ),
  password_resets_month: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
};

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch { return '—'; }
}

export function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiCall('/api/admin/overview')
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError('');
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message || 'Could not load dashboard');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const kpis = data?.kpis || [];
  const series = data?.messagesSeries || [];
  const activity = data?.activity || {};
  const totalThisWeek = useMemo(
    () => series.reduce((s, d) => s + Number(d.messages || 0), 0),
    [series]
  );
  const totalIn = useMemo(
    () => series.reduce((s, d) => s + Number(d.inbound || 0), 0),
    [series]
  );
  const totalOut = useMemo(
    () => series.reduce((s, d) => s + Number(d.outbound || 0), 0),
    [series]
  );

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>Dashboard</h1>
        <p>
          Live state of your Omnira backend. Every number on this page is queried from Supabase in
          real time — customers, subscribers, WhatsApp leads/messages, payments, and revenue all come
          from <code>customer_users</code>, <code>wa_leads</code>, <code>wa_messages</code> and{' '}
          <code>customer_payments</code>. Nothing is mocked.
        </p>
      </header>

      {error ? <div className="d-banner err"><strong>Error:</strong> {error}</div> : null}

      {loading && !data ? (
        <div className="d-empty">Loading dashboard…</div>
      ) : (
        <div className="d-page">
          {/* KPIs */}
          <div className="d-kpis">
            {kpis.map((k, idx) => (
              <article key={k.id} className={`d-kpi${idx < 2 ? ' em' : ''}`}>
                <div className="d-kpi-head">
                  <span className="d-kpi-icon">{KPI_ICONS[k.id] || KPI_ICONS.customers}</span>
                  <span className="d-kpi-label">{k.label}</span>
                </div>
                <div className="d-kpi-value">
                  {String(k.value ?? 0)}
                </div>
                <div className="d-kpi-hint">{k.hint}</div>
              </article>
            ))}
            {!kpis.length ? <div className="d-empty">No KPI data yet.</div> : null}
          </div>

          {/* WhatsApp activity chart */}
          <section className="d-card">
            <div className="d-section-head">
              <h2>WhatsApp activity · last 7 days</h2>
              <span className="d-section-sub">
                {totalThisWeek} messages this week
                {activity.messagesLastWeek > 0 || activity.messagesThisWeek > 0 ? (
                  <> · vs {activity.messagesLastWeek} last week · </>
                ) : null}
                {activity.messagesDeltaPct != null ? <TrendPill pct={activity.messagesDeltaPct} /> : null}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--soft)', marginBottom: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#00e5a0' }} />
                Inbound <strong style={{ color: 'var(--em)' }}>{totalIn}</strong>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#60a5fa' }} />
                Outbound <strong style={{ color: '#93c5fd' }}>{totalOut}</strong>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.10)' }} />
                Empty days shown as a faint track
              </span>
            </div>

            <WeekChart data={series} height={220} />

            <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
              Each bar is the count of <code>wa_messages</code> rows where{' '}
              <code>created_at</code> falls on that day. Drill in via{' '}
              <Link to="/chats" style={{ color: 'var(--em)' }}>WhatsApp chats</Link> or{' '}
              <Link to="/analytics" style={{ color: 'var(--em)' }}>Analytics</Link>.
            </p>
          </section>

          {/* Recent clients */}
          <section className="d-card">
            <div className="d-section-head">
              <h2>Recent signups</h2>
              <span className="d-section-sub">
                <Link to="/clients" style={{ color: 'var(--em)', textDecoration: 'none', fontWeight: 600 }}>
                  View all subscribers →
                </Link>
              </span>
            </div>
            <div className="d-table-wrap">
              <table className="d-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Plan</th>
                    <th>Renews</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentClients || []).map((c) => (
                    <tr key={c.id}>
                      <td className="biz">
                        <strong>{c.businessName}</strong>
                        <small>{c.email}</small>
                      </td>
                      <td>{c.plan || '—'}</td>
                      <td className="biz"><small>{c.subscriptionEndsAt ? formatDate(c.subscriptionEndsAt) : '—'}</small></td>
                      <td>
                        <span className={`badge ${c.agentStatus === 'live' ? 'live' : 'paused'}`}>
                          {c.agentStatus === 'live' ? '●' : '○'} {c.agentStatus}
                        </span>
                      </td>
                      <td><Link to={`/clients/${c.id}`}>Manage</Link></td>
                    </tr>
                  ))}
                  {!data?.recentClients?.length ? (
                    <tr>
                      <td colSpan={5} className="d-empty">No signups yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
