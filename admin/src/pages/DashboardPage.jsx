import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiCall } from '../api/client.js';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

// ---------------------------------------------------------------------------
// Scoped styles. Uses existing theme tokens (--em, --surf, --border-em…).
// All animations use only CSS transforms / opacity (no layout thrash).
// ---------------------------------------------------------------------------
const STYLES = `
  .d-page { display: flex; flex-direction: column; gap: 18px; }

  /* ============================== HEADER ================================ */
  .d-hero {
    position: relative;
    background:
      radial-gradient(80% 60% at 0% 0%, rgba(0,229,160,0.10), transparent 60%),
      radial-gradient(60% 50% at 100% 0%, rgba(96,165,250,0.10), transparent 65%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 22px 24px;
    overflow: hidden;
    animation: d-rise .35s ease-out both;
  }
  .d-hero-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
  .d-hero-greet { display: flex; align-items: center; gap: 14px; }
  .d-hero-av {
    width: 46px; height: 46px; border-radius: 999px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 700; font-size: 16px;
    color: #00120a;
    flex-shrink: 0;
    overflow: hidden;
    box-shadow: 0 6px 16px rgba(0,229,160,0.25);
  }
  .d-hero-av img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .d-hero-text h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 22px;
    color: var(--text);
    line-height: 1.2;
  }
  .d-hero-text .grad { background: linear-gradient(90deg, var(--em) 0%, #93c5fd 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .d-hero-text p { margin: 4px 0 0; font-size: 13px; color: var(--soft); }
  .d-hero-time {
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 14px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--soft);
    display: flex; align-items: center; gap: 8px;
  }
  .d-hero-time .dot { width: 6px; height: 6px; border-radius: 999px; background: var(--em); box-shadow: 0 0 0 4px rgba(0,229,160,0.12); animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }

  /* ============================== KPIs ================================ */
  .d-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .d-kpi {
    position: relative;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 18px;
    overflow: hidden;
    transition: border-color .2s ease, transform .2s ease;
    animation: d-rise .35s ease-out both;
  }
  .d-kpi:nth-child(1) { animation-delay: .02s; }
  .d-kpi:nth-child(2) { animation-delay: .05s; }
  .d-kpi:nth-child(3) { animation-delay: .08s; }
  .d-kpi:nth-child(4) { animation-delay: .11s; }
  .d-kpi:nth-child(5) { animation-delay: .14s; }
  .d-kpi:nth-child(6) { animation-delay: .17s; }
  .d-kpi:nth-child(7) { animation-delay: .20s; }
  .d-kpi:nth-child(8) { animation-delay: .23s; }
  @keyframes d-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .d-kpi::after {
    content: ''; position: absolute; right: -50px; top: -50px;
    width: 150px; height: 150px;
    background: radial-gradient(closest-side, rgba(0,229,160,0.10), transparent 70%);
    pointer-events: none;
  }
  .d-kpi:hover { border-color: var(--border-em); transform: translateY(-2px); }
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
  .d-kpi.blue .d-kpi-icon { background: rgba(96,165,250,0.10); color: #93c5fd; }
  .d-kpi.purple .d-kpi-icon { background: rgba(192,132,252,0.10); color: #c4b5fd; }
  .d-kpi.amber .d-kpi-icon { background: rgba(251,191,36,0.10); color: #fde68a; }
  .d-kpi.rose .d-kpi-icon { background: rgba(244,114,182,0.10); color: #fbb6ce; }
  .d-kpi-label { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
  .d-kpi-value { font-family: var(--font-display); font-size: 28px; line-height: 1.1; color: var(--text); font-weight: 700; }
  .d-kpi-value .unit { font-size: 13px; color: var(--soft); margin-left: 4px; font-weight: 500; }
  .d-kpi-foot { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px; color: var(--soft); }

  .d-trend { padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 11px; letter-spacing: .02em; }
  .d-trend.up { background: rgba(0,229,160,0.12); color: var(--em); }
  .d-trend.down { background: rgba(239,68,68,0.12); color: #fca5a5; }
  .d-trend.flat { background: rgba(148,163,184,0.12); color: var(--soft); }

  /* ============================== CARDS ================================ */
  .d-card {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 20px;
    animation: d-rise .4s ease-out both;
  }
  .d-section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; gap: 12px; flex-wrap: wrap; }
  .d-section-head h2 { margin: 0; font-family: var(--font-display); font-size: 14px; letter-spacing: .06em; text-transform: uppercase; color: var(--text); }
  .d-section-sub { color: var(--muted); font-size: 12px; }

  .d-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
  .d-grid-2-wide { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
  @media (max-width: 880px) { .d-grid-2-wide { grid-template-columns: 1fr; } }

  /* ============================== CHARTS ================================ */
  .d-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--soft); margin-bottom: 10px; }
  .d-legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: middle; }

  /* Donut */
  .d-donut-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .d-donut-legend { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 140px; }
  .d-donut-item { display: grid; grid-template-columns: 12px 1fr auto auto; gap: 8px; align-items: center; font-size: 13px; }
  .d-donut-swatch { width: 12px; height: 12px; border-radius: 3px; }
  .d-donut-label { color: var(--text); text-transform: capitalize; }
  .d-donut-count { color: var(--soft); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .d-donut-pct { color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 11px; }
  .d-donut-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    pointer-events: none;
  }
  .d-donut-center .v { font-family: var(--font-display); font-size: 24px; color: var(--text); font-weight: 700; }
  .d-donut-center .l { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }

  /* Horizontal bars */
  .d-hbar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .d-hbar-label { width: 110px; font-size: 12px; color: var(--text); text-transform: capitalize; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .d-hbar-track { flex: 1; height: 8px; background: rgba(255,255,255,0.05); border-radius: 999px; overflow: hidden; }
  .d-hbar-fill { height: 100%; background: linear-gradient(90deg, var(--em) 0%, #60a5fa 100%); border-radius: 999px; transition: width .6s ease; }
  .d-hbar-count { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--soft); width: 70px; text-align: right; }

  /* Revenue bars */
  .d-rev-bars { display: flex; align-items: flex-end; gap: 10px; height: 160px; padding-top: 14px; }
  .d-rev-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; }
  .d-rev-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--em); }
  .d-rev-bar { width: 100%; max-width: 50px; background: linear-gradient(180deg, var(--em) 0%, rgba(0,229,160,0.25) 100%); border-radius: 8px 8px 2px 2px; min-height: 2px; transition: height .6s ease; }
  .d-rev-label { font-size: 11px; color: var(--muted); }

  /* Recent items list */
  .d-list { display: flex; flex-direction: column; gap: 8px; }
  .d-item {
    display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; align-items: center;
    padding: 12px 14px;
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--border);
    border-radius: 12px;
    transition: border-color .15s ease, background .15s ease, transform .15s ease;
    text-decoration: none;
    color: inherit;
  }
  .d-item:hover { border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); transform: translateX(2px); }
  .d-item .av {
    width: 36px; height: 36px; border-radius: 999px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    color: #00120a;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 700; font-size: 13px;
  }
  .d-item .body { min-width: 0; }
  .d-item .body strong { display: block; color: var(--text); font-size: 14px; line-height: 1.2; }
  .d-item .body small { display: block; color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 11px; margin-top: 2px; }
  .d-item .meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .d-item .badge { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .d-item .badge.green { background: rgba(0,229,160,0.12); color: var(--em); }
  .d-item .badge.blue { background: rgba(96,165,250,0.14); color: #93c5fd; }
  .d-item .badge.amber { background: rgba(251,191,36,0.12); color: #fde68a; }
  .d-item .badge.grey { background: rgba(148,163,184,0.12); color: var(--soft); }
  .d-item .ts { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--muted); }

  /* Quick actions */
  .d-quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
  .d-quick a {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px;
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: inherit;
    text-decoration: none;
    transition: all .15s ease;
  }
  .d-quick a:hover { border-color: var(--border-em); background: rgba(0,229,160,0.04); transform: translateY(-2px); }
  .d-quick .ic { width: 36px; height: 36px; border-radius: 10px; background: rgba(0,229,160,0.10); color: var(--em); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .d-quick .meta { display: flex; flex-direction: column; }
  .d-quick .meta strong { color: var(--text); font-size: 13px; }
  .d-quick .meta small { color: var(--muted); font-size: 11px; }

  /* Health pills */
  .d-health-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .d-health {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 14px;
  }
  .d-health .l { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
  .d-health .v { font-family: var(--font-display); font-size: 20px; color: var(--text); font-weight: 700; }

  .d-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; }
  .d-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .d-empty { color: var(--muted); padding: 20px; text-align: center; font-size: 13px; }

  /* Mobile fine-tune */
  @media (max-width: 560px) {
    .d-hero { padding: 18px; }
    .d-hero-text h1 { font-size: 18px; }
    .d-card { padding: 16px; }
    .d-kpi-value { font-size: 24px; }
  }
`;

// ---------------------------------------------------------------------------
// SVG charts. Pure functions, scale with the container via viewBox.
// ---------------------------------------------------------------------------

function AreaChart({ data, height = 220 }) {
  const w = 800;
  const h = height;
  const pad = { t: 14, r: 16, b: 28, l: 36 };
  const max = Math.max(1, ...data.map((d) => d.inbound + d.outbound));
  const stepX = (w - pad.l - pad.r) / Math.max(1, data.length - 1);
  const yScale = (v) => h - pad.b - (v / max) * (h - pad.t - pad.b);
  const xAt = (i) => pad.l + i * stepX;

  const totals = data.map((d) => d.inbound + d.outbound);
  const inboundOnly = data.map((d) => d.inbound);

  function path(values, baseline = false) {
    if (!values.length) return '';
    let p = `M ${xAt(0)} ${yScale(values[0])}`;
    for (let i = 1; i < values.length; i += 1) {
      const x1 = xAt(i - 1) + stepX / 2;
      const x2 = xAt(i) - stepX / 2;
      p += ` C ${x1} ${yScale(values[i - 1])}, ${x2} ${yScale(values[i])}, ${xAt(i)} ${yScale(values[i])}`;
    }
    if (baseline) {
      p += ` L ${xAt(values.length - 1)} ${h - pad.b}`;
      p += ` L ${xAt(0)} ${h - pad.b} Z`;
    }
    return p;
  }
  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((max / yTicks) * i));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <defs>
        <linearGradient id="aTotal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(96,165,250,0.50)" />
          <stop offset="100%" stopColor="rgba(96,165,250,0.02)" />
        </linearGradient>
        <linearGradient id="aIn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,229,160,0.55)" />
          <stop offset="100%" stopColor="rgba(0,229,160,0.04)" />
        </linearGradient>
      </defs>
      {tickVals.map((v, i) => {
        const y = yScale(v);
        return (
          <g key={`g${i}`}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
            <text x={pad.l - 6} y={y + 3} fontSize="10" fill="#4d6080" textAnchor="end" fontFamily="'JetBrains Mono', monospace">{v}</text>
          </g>
        );
      })}
      <path d={path(totals, true)} fill="url(#aTotal)" />
      <path d={path(inboundOnly, true)} fill="url(#aIn)" />
      <path d={path(totals)} fill="none" stroke="#60a5fa" strokeWidth="2" />
      <path d={path(inboundOnly)} fill="none" stroke="#00e5a0" strokeWidth="2" />
      {data.map((d, i) => {
        const stride = Math.max(1, Math.floor(data.length / 8));
        if (i % stride !== 0 && i !== data.length - 1) return null;
        return (
          <text
            key={d.date || i}
            x={xAt(i)}
            y={h - 8}
            fontSize="10"
            fill="#4d6080"
            textAnchor="middle"
            fontFamily="'JetBrains Mono', monospace"
          >
            {(d.label || '').split(' ').pop()}
          </text>
        );
      })}
    </svg>
  );
}

const DONUT_COLORS = ['#00e5a0', '#60a5fa', '#c084fc', '#fbbf24', '#fb7185', '#94a3b8'];

function Donut({ data, total, centerLabel, centerValue, size = 180 }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 16;
  const innerR = r - 22;
  if (!total || !data.length) {
    return <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>no data</div>;
  }
  let cum = 0;
  const segs = data.map((d, i) => {
    const v = d.count;
    const start = (cum / total) * Math.PI * 2 - Math.PI / 2;
    cum += v;
    const end = (cum / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + Math.cos(start) * r, y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end) * r, y2 = cy + Math.sin(end) * r;
    const ix1 = cx + Math.cos(end) * innerR, iy1 = cy + Math.sin(end) * innerR;
    const ix2 = cx + Math.cos(start) * innerR, iy2 = cy + Math.sin(start) * innerR;
    return {
      ...d,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
      path: v > 0 ? `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z` : ''
    };
  });
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {segs.map((s) => <path key={s.label || s.status || s.id} d={s.path} fill={s.color} opacity="0.92" />)}
      </svg>
      <div className="d-donut-center">
        <div className="v">{centerValue}</div>
        <div className="l">{centerLabel}</div>
      </div>
    </div>
  );
}

function HBar({ items, valueKey = 'count', labelKey = 'label' }) {
  const max = Math.max(1, ...items.map((d) => Number(d[valueKey] || 0)));
  return (
    <div>
      {items.map((d) => (
        <div key={d[labelKey]} className="d-hbar">
          <span className="d-hbar-label" title={d[labelKey]}>{d[labelKey]}</span>
          <div className="d-hbar-track">
            <div className="d-hbar-fill" style={{ width: `${(Number(d[valueKey]) / max) * 100}%` }} />
          </div>
          <span className="d-hbar-count">{d[valueKey]}{d.pct != null ? ` · ${d.pct.toFixed(0)}%` : ''}</span>
        </div>
      ))}
      {!items.length ? <div className="d-empty">no data</div> : null}
    </div>
  );
}

function RevenueBars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.amount_cents));
  return (
    <div className="d-rev-bars">
      {data.map((m) => (
        <div key={m.month} className="d-rev-col">
          <div className="d-rev-val">€{m.amount_euro.toFixed(0)}</div>
          <div className="d-rev-bar" style={{ height: `${(m.amount_cents / max) * 100}%` }} />
          <div className="d-rev-label">{m.label}</div>
        </div>
      ))}
    </div>
  );
}

function TrendPill({ pct }) {
  if (pct === 0) return <span className="d-trend flat">±0%</span>;
  if (pct > 0) return <span className="d-trend up">▲ {pct}%</span>;
  return <span className="d-trend down">▼ {Math.abs(pct)}%</span>;
}

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.round(diff / 3600_000)}h`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
const KPI_ICONS = {
  customers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm12 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" /></svg>,
  paid: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" strokeLinejoin="round" /></svg>,
  leads: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M3 11a9 9 0 0 1 18 0v9H6a3 3 0 0 1-3-3v-6z" strokeLinejoin="round" /><circle cx="12" cy="9" r="1.5" fill="currentColor" /></svg>,
  messages: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinejoin="round" /></svg>,
  payments: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h2" strokeLinecap="round" /></svg>,
  revenue: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" /></svg>,
  qualified: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4l-10 10-3-3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  conversion: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M3 17l6-6 4 4 8-8M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};

const STATUS_BADGE = {
  new: 'green',
  contacted: 'blue',
  qualified: 'amber',
  converted: 'green',
  lost: 'grey',
};

// ---------------------------------------------------------------------------
export function DashboardPage() {
  const { user } = useAdminAuth();
  const [overview, setOverview] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recentLeads, setRecentLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      apiCall('/api/admin/overview').catch((e) => ({ __err: e?.message })),
      apiCall('/api/admin/analytics').catch((e) => ({ __err: e?.message })),
      apiCall('/api/admin/leads?limit=5').catch(() => ({ leads: [] })),
    ]).then(([o, a, l]) => {
      if (!alive) return;
      if (o?.__err && a?.__err) {
        setError(o.__err || a.__err);
      } else {
        if (!o?.__err) setOverview(o);
        if (!a?.__err) setAnalytics(a);
      }
      setRecentLeads(l?.leads || []);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const kpis = overview?.kpis || [];
  const kpiByID = useMemo(() => Object.fromEntries(kpis.map((k) => [k.id, k])), [kpis]);
  const aKpis = analytics?.kpis || {};
  const activity = overview?.activity || {};
  const daily = analytics?.dailySeries || [];

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 5) return 'Working late';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, [now]);

  const firstName = (user?.name || 'Admin').split(' ')[0];
  const initials = (user?.name || 'Omnira Admin').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head" style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 0, padding: 0, margin: 0, height: 0 }} aria-hidden>Dashboard</h1>
      </header>

      {error ? <div className="d-banner err"><strong>Error:</strong> {error}</div> : null}

      <div className="d-page">
        {/* Hero */}
        <section className="d-hero">
          <div className="d-hero-row">
            <div className="d-hero-greet">
              <div className="d-hero-av">
                {user?.avatar ? <img src={user.avatar} alt={user?.name || 'admin'} /> : initials}
              </div>
              <div className="d-hero-text">
                <h1>
                  {greeting}, <span className="grad">{firstName}</span> 👋
                </h1>
                <p>
                  {now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{' '}
                  · Here's how Omnira is doing right now.
                </p>
              </div>
            </div>
            <div className="d-hero-time">
              <span className="dot" /> Live · {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </section>

        {/* KPIs */}
        <div className="d-kpis">
          <article className="d-kpi em">
            <div className="d-kpi-head"><span className="d-kpi-icon">{KPI_ICONS.customers}</span><span className="d-kpi-label">Customers</span></div>
            <div className="d-kpi-value">{kpiByID.customers?.value ?? 0}</div>
            <div className="d-kpi-foot">{kpiByID.customers?.hint || ''}</div>
          </article>
          <article className="d-kpi em blue">
            <div className="d-kpi-head"><span className="d-kpi-icon">{KPI_ICONS.paid}</span><span className="d-kpi-label">Active subscribers</span></div>
            <div className="d-kpi-value">{kpiByID.paid?.value ?? 0}</div>
            <div className="d-kpi-foot">{kpiByID.paid?.hint || ''}</div>
          </article>
          <article className="d-kpi purple">
            <div className="d-kpi-head"><span className="d-kpi-icon">{KPI_ICONS.leads}</span><span className="d-kpi-label">WhatsApp leads</span></div>
            <div className="d-kpi-value">{kpiByID.leads?.value ?? 0}</div>
            <div className="d-kpi-foot">{kpiByID.leads?.hint || ''}</div>
          </article>
          <article className="d-kpi">
            <div className="d-kpi-head"><span className="d-kpi-icon">{KPI_ICONS.messages}</span><span className="d-kpi-label">Messages · this week</span></div>
            <div className="d-kpi-value">{activity.messagesThisWeek ?? 0}</div>
            <div className="d-kpi-foot">
              {activity.messagesDeltaPct != null ? <TrendPill pct={activity.messagesDeltaPct} /> : null}
              <span>vs {activity.messagesLastWeek ?? 0} last week</span>
            </div>
          </article>
          <article className="d-kpi amber">
            <div className="d-kpi-head"><span className="d-kpi-icon">{KPI_ICONS.qualified}</span><span className="d-kpi-label">Qualified leads</span></div>
            <div className="d-kpi-value">{aKpis.qualifiedLeads ?? 0}</div>
            <div className="d-kpi-foot">All-time across funnel</div>
          </article>
          <article className="d-kpi rose">
            <div className="d-kpi-head"><span className="d-kpi-icon">{KPI_ICONS.conversion}</span><span className="d-kpi-label">Conversion rate</span></div>
            <div className="d-kpi-value">{aKpis.conversionRate != null ? aKpis.conversionRate.toFixed(1) : '0.0'}<span className="unit">%</span></div>
            <div className="d-kpi-foot">{aKpis.convertedLeads ?? 0} of {aKpis.totalLeads ?? 0} converted</div>
          </article>
          <article className="d-kpi blue">
            <div className="d-kpi-head"><span className="d-kpi-icon">{KPI_ICONS.payments}</span><span className="d-kpi-label">Payments this month</span></div>
            <div className="d-kpi-value">{kpiByID.payments_month?.value ?? 0}</div>
            <div className="d-kpi-foot">{kpiByID.payments_month?.hint || ''}</div>
          </article>
          <article className="d-kpi em">
            <div className="d-kpi-head"><span className="d-kpi-icon">{KPI_ICONS.revenue}</span><span className="d-kpi-label">Revenue · this month</span></div>
            <div className="d-kpi-value">{kpiByID.revenue_month?.value || '0€'}</div>
            <div className="d-kpi-foot">€{aKpis.revenue6mEuro?.toFixed?.(0) ?? '0'} last 6 months</div>
          </article>
        </div>

        {/* Activity chart */}
        <section className="d-card">
          <div className="d-section-head">
            <h2>WhatsApp activity · last 30 days</h2>
            <span className="d-section-sub">
              {daily.reduce((s, d) => s + d.inbound + d.outbound, 0)} messages · {daily.reduce((s, d) => s + d.leads, 0)} new leads
            </span>
          </div>
          <div className="d-legend">
            <span><span className="d-legend-dot" style={{ background: '#60a5fa' }} />Total messages</span>
            <span><span className="d-legend-dot" style={{ background: '#00e5a0' }} />Inbound only</span>
          </div>
          {daily.length ? <AreaChart data={daily} height={220} /> : <div className="d-empty">No activity yet — open <Link to="/whatsapp" style={{ color: 'var(--em)' }}>WhatsApp config</Link>.</div>}
        </section>

        {/* Status + Plan donuts */}
        <div className="d-grid-2">
          <section className="d-card">
            <div className="d-section-head"><h2>Lead status</h2><span className="d-section-sub">all-time</span></div>
            <div className="d-donut-row">
              <Donut
                data={(analytics?.statusDistribution || []).filter((s) => s.count > 0).map((s) => ({ ...s, label: s.status }))}
                total={aKpis.totalLeads || 0}
                centerValue={aKpis.totalLeads || 0}
                centerLabel="leads"
              />
              <div className="d-donut-legend">
                {(analytics?.statusDistribution || []).map((s, i) => (
                  <div key={s.status} className="d-donut-item">
                    <div className="d-donut-swatch" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="d-donut-label">{s.status}</span>
                    <span className="d-donut-count">{s.count}</span>
                    <span className="d-donut-pct">{s.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="d-card">
            <div className="d-section-head"><h2>Active plans</h2><span className="d-section-sub">current subscribers</span></div>
            {aKpis.activeSubscribers === 0 ? (
              <div className="d-empty">No active paid subscribers yet.</div>
            ) : (
              <div className="d-donut-row">
                <Donut
                  data={(analytics?.planDistribution || []).map((p) => ({ label: p.label || p.id, count: p.count }))}
                  total={aKpis.activeSubscribers || 0}
                  centerValue={aKpis.activeSubscribers || 0}
                  centerLabel="active"
                />
                <div className="d-donut-legend">
                  {(analytics?.planDistribution || []).map((p, i) => (
                    <div key={p.id} className="d-donut-item">
                      <div className="d-donut-swatch" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="d-donut-label">{p.label || p.id}</span>
                      <span className="d-donut-count">{p.count}</span>
                      <span className="d-donut-pct">
                        {aKpis.activeSubscribers ? ((p.count / aKpis.activeSubscribers) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Intents + Languages */}
        <div className="d-grid-2">
          <section className="d-card">
            <div className="d-section-head"><h2>Top intents</h2><span className="d-section-sub">extracted by OpenAI</span></div>
            <HBar items={(analytics?.topIntents || []).map((i) => ({ label: i.intent, count: i.count, pct: i.pct }))} />
          </section>
          <section className="d-card">
            <div className="d-section-head"><h2>Top languages</h2><span className="d-section-sub">detected per lead</span></div>
            <HBar items={(analytics?.topLanguages || []).map((l) => ({ label: l.language, count: l.count, pct: l.pct }))} />
          </section>
        </div>

        {/* Monthly revenue + OpenAI health */}
        <div className="d-grid-2-wide">
          <section className="d-card">
            <div className="d-section-head">
              <h2>Monthly revenue</h2>
              <span className="d-section-sub">last 6 months · €{aKpis.revenue6mEuro?.toFixed?.(2) ?? '0.00'}</span>
            </div>
            {analytics?.monthlyRevenue?.length ? (
              <RevenueBars data={analytics.monthlyRevenue} />
            ) : (
              <div className="d-empty">No payments yet.</div>
            )}
          </section>

          <section className="d-card">
            <div className="d-section-head"><h2>OpenAI fleet</h2><span className="d-section-sub">live</span></div>
            <div className="d-health-row">
              <div className="d-health">
                <div className="l">Active keys</div>
                <div className="v">{analytics?.openaiHealth?.active_keys ?? 0}</div>
              </div>
              <div className="d-health">
                <div className="l">Successes</div>
                <div className="v" style={{ color: 'var(--em)' }}>{analytics?.openaiHealth?.total_successes?.toLocaleString?.() ?? 0}</div>
              </div>
              <div className="d-health">
                <div className="l">Failures</div>
                <div className="v" style={{ color: (analytics?.openaiHealth?.total_failures || 0) > 0 ? '#fca5a5' : 'var(--text)' }}>
                  {analytics?.openaiHealth?.total_failures?.toLocaleString?.() ?? 0}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Recent leads + Quick links */}
        <div className="d-grid-2-wide">
          <section className="d-card">
            <div className="d-section-head">
              <h2>Latest leads</h2>
              <Link to="/leads" style={{ fontSize: 12, color: 'var(--em)', textDecoration: 'none', fontWeight: 600 }}>View all →</Link>
            </div>
            <div className="d-list">
              {recentLeads.length === 0 ? <div className="d-empty">No leads yet.</div> : null}
              {recentLeads.map((l) => {
                const initials = (l.name || `+${l.wa_from}`).split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <Link key={l.id} to="/leads" className="d-item">
                    <div className="av">{initials}</div>
                    <div className="body">
                      <strong>{l.name || `+${l.wa_from}`}</strong>
                      <small>{l.email || `+${l.wa_from}`}{l.intent ? ` · ${l.intent}` : ''}</small>
                    </div>
                    <div className="meta">
                      <span className={`badge ${STATUS_BADGE[l.status] || 'grey'}`}>{l.status}</span>
                      <span className="ts">{formatRelative(l.last_message_at)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="d-card">
            <div className="d-section-head"><h2>Quick actions</h2></div>
            <div className="d-quick">
              <Link to="/leads">
                <span className="ic">{KPI_ICONS.leads}</span>
                <span className="meta"><strong>WhatsApp leads</strong><small>Manage statuses</small></span>
              </Link>
              <Link to="/chats">
                <span className="ic">{KPI_ICONS.messages}</span>
                <span className="meta"><strong>Live chats</strong><small>Open conversations</small></span>
              </Link>
              <Link to="/whatsapp">
                <span className="ic">{KPI_ICONS.paid}</span>
                <span className="meta"><strong>WhatsApp config</strong><small>Edit Meta tokens</small></span>
              </Link>
              <Link to="/bot-config">
                <span className="ic">{KPI_ICONS.qualified}</span>
                <span className="meta"><strong>Bot brain</strong><small>Edit prompt + KB</small></span>
              </Link>
              <Link to="/pricing">
                <span className="ic">{KPI_ICONS.revenue}</span>
                <span className="meta"><strong>Pricing</strong><small>Change plan prices</small></span>
              </Link>
              <Link to="/notifications">
                <span className="ic">{KPI_ICONS.messages}</span>
                <span className="meta"><strong>Notifications</strong><small>Broadcast to users</small></span>
              </Link>
            </div>
          </section>
        </div>

        {/* Recent signups */}
        <section className="d-card">
          <div className="d-section-head">
            <h2>Recent signups</h2>
            <Link to="/clients" style={{ fontSize: 12, color: 'var(--em)', textDecoration: 'none', fontWeight: 600 }}>View all →</Link>
          </div>
          <div className="d-list">
            {(overview?.recentClients || []).length === 0 ? <div className="d-empty">No signups yet.</div> : null}
            {(overview?.recentClients || []).map((c) => {
              const initials = c.businessName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <Link key={c.id} to={`/clients/${c.id}`} className="d-item">
                  <div className="av">{initials}</div>
                  <div className="body">
                    <strong>{c.businessName}</strong>
                    <small>{c.email}{c.plan ? ` · ${c.plan}` : ''}</small>
                  </div>
                  <div className="meta">
                    <span className={`badge ${c.agentStatus === 'live' ? 'green' : 'grey'}`}>
                      {c.agentStatus === 'live' ? '● live' : '○ paused'}
                    </span>
                    <span className="ts">{formatRelative(c.createdAt)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {loading ? <div className="d-empty">Refreshing…</div> : null}
      </div>
    </>
  );
}
