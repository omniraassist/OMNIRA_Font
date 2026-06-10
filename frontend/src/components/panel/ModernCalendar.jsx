import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiCall } from '../../api/client.js';

/**
 * Google-Calendar-style booking calendar for the customer panel.
 *
 * Three coordinated views — Month, Week, Day — share one sidebar (mini
 * month picker + per-service filters + quick stats) and one toolbar
 * (date navigation + search + view switch + Crear). Week is the marquee
 * view: a true hour-grid timeline with events positioned absolutely by
 * their start time and duration, a live red "now" line crossing today's
 * column, and per-service colour coding so the operator can spot the
 * shape of the day at a glance.
 *
 * Performance: animations and large shadow paints are restricted to
 * >900 px so phones stay snappy (matches the landing-page perf pass).
 */

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS_MINI = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const WEEKDAYS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const DAY_START_HOUR = 8;  // grid starts at 08:00
const DAY_END_HOUR = 22;   // grid ends at 22:00
const HOUR_HEIGHT = 56;    // px per hour in week/day view
const DEFAULT_DURATION = 60; // minutes — used when an event has no explicit duration

// Soft service palette — a deterministic hash maps the service name to one
// of these so the same kind of booking always renders in the same colour.
const SERVICE_COLORS = [
  { bg: 'rgba(16,185,129,0.18)', bd: 'rgba(16,185,129,0.55)', tx: '#34d399', dot: '#10b981' },
  { bg: 'rgba(59,130,246,0.18)', bd: 'rgba(59,130,246,0.55)', tx: '#60a5fa', dot: '#3b82f6' },
  { bg: 'rgba(168,85,247,0.18)', bd: 'rgba(168,85,247,0.55)', tx: '#c084fc', dot: '#a855f7' },
  { bg: 'rgba(245,158,11,0.18)', bd: 'rgba(245,158,11,0.55)', tx: '#fbbf24', dot: '#f59e0b' },
  { bg: 'rgba(236,72,153,0.18)', bd: 'rgba(236,72,153,0.55)', tx: '#f472b6', dot: '#ec4899' },
  { bg: 'rgba(6,182,212,0.18)',  bd: 'rgba(6,182,212,0.55)',  tx: '#22d3ee', dot: '#06b6d4' },
];

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday-start
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function serviceColor(service) {
  if (!service) return SERVICE_COLORS[0];
  let h = 0;
  for (let i = 0; i < service.length; i++) {
    h = ((h << 5) - h + service.charCodeAt(i)) | 0;
  }
  return SERVICE_COLORS[Math.abs(h) % SERVICE_COLORS.length];
}
function eventDurationMinutes(ev) {
  if (ev?.duration && Number.isFinite(Number(ev.duration))) return Number(ev.duration);
  return DEFAULT_DURATION;
}
function fmtTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function initials(name) {
  const src = String(name || '?').trim();
  if (!src) return '?';
  return src.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

const STYLES = `
  .gc-shell {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 16px;
    background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 22px;
    padding: 16px;
    overflow: hidden;
    min-height: 640px;
  }

  /* ─── Sidebar ───────────────────────────────────────────────── */
  .gc-side {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  .gc-create {
    display: inline-flex; align-items: center; gap: 10px;
    background: linear-gradient(135deg, var(--em, #00E5A0) 0%, var(--em2, #00C87A) 100%);
    color: #04201a;
    font-weight: 800;
    font-size: 14px;
    border: 0;
    border-radius: 14px;
    padding: 14px 18px;
    cursor: pointer;
    box-shadow: 0 12px 28px rgba(0,229,160,0.25);
    transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
  }
  .gc-create:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 36px rgba(0,229,160,0.36);
    filter: brightness(1.04);
  }

  /* Mini month */
  .gc-mini {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 14px;
    padding: 12px;
  }
  .gc-mini-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
  }
  .gc-mini-label {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 13.5px;
    color: var(--text, #E2EAF4);
    text-transform: capitalize;
  }
  .gc-mini-nav {
    display: inline-flex; gap: 2px;
  }
  .gc-mini-nav button {
    background: transparent;
    border: 0;
    width: 24px; height: 24px;
    color: var(--soft, #8FA3C0);
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .gc-mini-nav button:hover { background: rgba(255,255,255,0.06); color: var(--text, #E2EAF4); }
  .gc-mini-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }
  .gc-mini-wd {
    text-align: center;
    font-size: 10px;
    color: var(--muted, #4D6080);
    font-weight: 700;
    padding: 4px 0;
    letter-spacing: 0.04em;
  }
  .gc-mini-cell {
    aspect-ratio: 1;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11.5px;
    color: var(--soft, #8FA3C0);
    border-radius: 50%;
    cursor: pointer;
    border: 0;
    background: transparent;
    transition: background .15s ease, color .15s ease;
  }
  .gc-mini-cell:hover { background: rgba(255,255,255,0.06); color: var(--text, #E2EAF4); }
  .gc-mini-cell.empty { pointer-events: none; }
  .gc-mini-cell.dim { opacity: 0.35; }
  .gc-mini-cell.has-events::after {
    content: '';
    position: absolute;
    bottom: 3px;
    width: 3px; height: 3px;
    border-radius: 50%;
    background: var(--em, #00E5A0);
  }
  .gc-mini-cell.has-events { position: relative; }
  .gc-mini-cell.today {
    background: rgba(0,229,160,0.14);
    color: var(--em, #00E5A0);
    font-weight: 700;
  }
  .gc-mini-cell.selected {
    background: var(--em, #00E5A0);
    color: #04201a;
    font-weight: 800;
  }
  .gc-mini-cell.selected.today { background: var(--em, #00E5A0); color: #04201a; }

  /* Filters */
  .gc-filters {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 14px;
    padding: 12px;
  }
  .gc-section-head {
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted, #4D6080);
    font-weight: 700;
    margin-bottom: 8px;
  }
  .gc-filter-row {
    display: flex; align-items: center; gap: 9px;
    padding: 6px 4px;
    cursor: pointer;
    border-radius: 8px;
    font-size: 13px;
    color: var(--soft, #8FA3C0);
    transition: background .15s ease, color .15s ease;
    user-select: none;
  }
  .gc-filter-row:hover { background: rgba(255,255,255,0.04); color: var(--text, #E2EAF4); }
  .gc-filter-row .dot {
    width: 10px; height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .gc-filter-row .count {
    margin-left: auto;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--muted, #4D6080);
    background: rgba(255,255,255,0.04);
    padding: 2px 7px;
    border-radius: 999px;
  }
  .gc-filter-row.off { opacity: 0.45; }
  .gc-filter-row.off .dot { background: rgba(255,255,255,0.2) !important; }

  /* Quick stats */
  .gc-qs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .gc-qs-card {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 10px 12px;
  }
  .gc-qs-card .lbl {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted, #4D6080);
    font-weight: 700;
  }
  .gc-qs-card .val {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 22px;
    color: var(--text, #E2EAF4);
    line-height: 1;
    margin-top: 4px;
  }
  .gc-qs-card.em .val { color: var(--em, #00E5A0); }

  /* ─── Main area ──────────────────────────────────────────────── */
  .gc-main {
    display: flex; flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  /* ─── Integrations strip (Google Calendar + Cover Manager) ───── */
  .gc-int {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .gc-int-card {
    display: flex; align-items: center; gap: 12px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 12px 14px;
    transition: border-color .18s ease, background .18s ease;
    min-width: 0;
  }
  .gc-int-card.connected {
    border-color: rgba(0,229,160,0.30);
    background: linear-gradient(90deg, rgba(0,229,160,0.08) 0%, rgba(0,229,160,0.02) 100%);
  }
  .gc-int-logo {
    width: 38px; height: 38px;
    border-radius: 10px;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    font-weight: 800;
    color: #fff;
    font-size: 15px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.30);
  }
  .gc-int-logo.google {
    background:
      conic-gradient(from 0deg at 50% 50%, #4285f4 0deg, #4285f4 90deg, #ea4335 90deg, #ea4335 180deg, #fbbc05 180deg, #fbbc05 270deg, #34a853 270deg, #34a853 360deg);
    color: #fff;
    position: relative;
  }
  .gc-int-logo.google::after {
    content: 'G';
    position: absolute;
    inset: 0;
    display: inline-flex; align-items: center; justify-content: center;
    background: #0c1220;
    border-radius: 8px;
    margin: 4px;
  }
  .gc-int-logo.cm {
    background: linear-gradient(135deg, #6b46c1 0%, #b794f4 100%);
  }
  .gc-int-meta { min-width: 0; flex: 1; }
  .gc-int-meta .name {
    display: block;
    color: var(--text, #E2EAF4);
    font-weight: 700;
    font-size: 13.5px;
    line-height: 1.25;
  }
  .gc-int-meta .sub {
    display: block;
    color: var(--soft, #8FA3C0);
    font-size: 11.5px;
    margin-top: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .gc-int-card.connected .gc-int-meta .sub { color: var(--em, #00E5A0); }
  .gc-int-action {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.10);
    color: var(--soft, #8FA3C0);
    border-radius: 10px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
    transition: all .15s ease;
    letter-spacing: 0.02em;
  }
  .gc-int-action.primary {
    background: linear-gradient(135deg, var(--em, #00E5A0) 0%, var(--em2, #00C87A) 100%);
    color: #04201a;
    border-color: transparent;
  }
  .gc-int-action.primary:hover { filter: brightness(1.06); transform: translateY(-1px); }
  .gc-int-action.danger:hover {
    color: #fca5a5;
    border-color: rgba(239,68,68,0.30);
    background: rgba(239,68,68,0.06);
  }
  .gc-int-action:hover:not(.primary):not(.danger) {
    color: var(--em, #00E5A0);
    border-color: rgba(0,229,160,0.30);
    background: rgba(0,229,160,0.05);
  }
  .gc-int-action:disabled { opacity: 0.55; cursor: not-allowed; }

  .gc-int-toast {
    margin-bottom: 12px;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 12.5px;
    border: 1px solid;
  }
  .gc-int-toast.ok {
    background: rgba(34,197,94,0.08);
    border-color: rgba(34,197,94,0.32);
    color: #bbf7d0;
  }
  .gc-int-toast.err {
    background: rgba(239,68,68,0.08);
    border-color: rgba(239,68,68,0.32);
    color: #fecaca;
  }

  .gc-bar {
    display: flex; align-items: center; gap: 12px;
    padding: 0 0 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .gc-bar-nav {
    display: flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 4px;
  }
  .gc-bar-nav button {
    background: transparent; border: 0;
    width: 32px; height: 32px;
    color: var(--soft, #8FA3C0);
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    transition: background .15s ease, color .15s ease;
  }
  .gc-bar-nav button:hover { background: rgba(255,255,255,0.06); color: var(--text, #E2EAF4); }
  .gc-bar-nav .today {
    width: auto; padding: 0 12px;
    font-family: 'Outfit', sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: var(--em, #00E5A0);
  }
  .gc-bar-title {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 22px;
    color: var(--text, #E2EAF4);
    text-transform: capitalize;
    letter-spacing: -0.01em;
  }
  .gc-bar-search {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 9px 14px;
    color: var(--text, #E2EAF4);
    font-size: 13px;
    width: 200px;
    outline: none;
    transition: border-color .15s ease, background .15s ease;
  }
  .gc-bar-search:focus {
    border-color: rgba(0,229,160,0.45);
    background: rgba(0,229,160,0.04);
  }
  .gc-bar-search::placeholder { color: var(--muted, #4D6080); }
  .gc-bar-spacer { flex: 1; }
  .gc-bar-views {
    display: inline-flex;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 4px;
  }
  .gc-bar-views button {
    background: transparent; border: 0;
    padding: 7px 14px;
    color: var(--soft, #8FA3C0);
    font-family: 'Outfit', sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    border-radius: 9px;
    cursor: pointer;
    transition: background .15s ease, color .15s ease;
  }
  .gc-bar-views button:hover { color: var(--text, #E2EAF4); }
  .gc-bar-views button.active {
    background: linear-gradient(135deg, var(--em, #00E5A0) 0%, var(--em2, #00C87A) 100%);
    color: #04201a;
    box-shadow: 0 4px 12px rgba(0,229,160,0.32);
  }

  /* ─── Month view ─────────────────────────────────────────────── */
  .gc-month {
    flex: 1;
    display: flex; flex-direction: column;
    min-height: 0;
  }
  .gc-month-wd {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    margin-bottom: 8px;
    padding: 0 2px;
  }
  .gc-month-wd span {
    text-align: left;
    padding-left: 6px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted, #4D6080);
    font-weight: 700;
  }
  .gc-month-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    flex: 1;
  }
  .gc-mcell {
    position: relative;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 8px 8px 6px;
    min-height: 110px;
    cursor: pointer;
    display: flex; flex-direction: column; gap: 4px;
    overflow: hidden;
    transition: background .18s ease, border-color .18s ease, transform .18s ease;
  }
  .gc-mcell:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.14);
    transform: translateY(-1px);
  }
  .gc-mcell.empty { background: transparent; border: 0; cursor: default; }
  .gc-mcell-num {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 13.5px;
    color: var(--text, #E2EAF4);
    line-height: 1;
  }
  .gc-mcell.today .gc-mcell-num {
    background: var(--em, #00E5A0);
    color: #04201a;
    border-radius: 50%;
    width: 24px; height: 24px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12.5px;
  }
  .gc-mcell.dim .gc-mcell-num { opacity: 0.35; }
  .gc-mevent {
    display: flex; align-items: center; gap: 6px;
    border-radius: 6px;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    cursor: pointer;
  }
  .gc-mevent time { font-variant-numeric: tabular-nums; opacity: 0.85; }
  .gc-mevent .name { overflow: hidden; text-overflow: ellipsis; }
  .gc-mevent-more {
    font-size: 10.5px;
    color: var(--muted, #4D6080);
    font-weight: 600;
    padding-left: 4px;
  }

  /* ─── Week / Day view (hour grid) ────────────────────────────── */
  .gc-week {
    flex: 1;
    display: flex; flex-direction: column;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.06);
    overflow: hidden;
    background: rgba(255,255,255,0.015);
    min-height: 0;
  }
  .gc-week-head {
    display: grid;
    grid-template-columns: 64px repeat(var(--cols, 7), 1fr);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.025);
    flex-shrink: 0;
  }
  .gc-week-head .corner { border-right: 1px solid rgba(255,255,255,0.05); }
  .gc-week-head .day {
    padding: 12px 10px;
    border-right: 1px solid rgba(255,255,255,0.05);
    text-align: center;
  }
  .gc-week-head .day:last-child { border-right: 0; }
  .gc-week-head .day .wd {
    font-size: 11px;
    color: var(--muted, #4D6080);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .gc-week-head .day .num {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 20px;
    color: var(--text, #E2EAF4);
    margin-top: 3px;
    line-height: 1;
  }
  .gc-week-head .day.today .num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px;
    border-radius: 50%;
    background: var(--em, #00E5A0);
    color: #04201a;
  }
  .gc-week-head .day.today .wd { color: var(--em, #00E5A0); }

  .gc-week-body {
    flex: 1;
    display: grid;
    grid-template-columns: 64px repeat(var(--cols, 7), 1fr);
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
  }
  .gc-week-body::-webkit-scrollbar { width: 8px; }
  .gc-week-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }

  .gc-time-col {
    display: flex; flex-direction: column;
    border-right: 1px solid rgba(255,255,255,0.05);
    background: rgba(0,0,0,0.10);
  }
  .gc-time-slot {
    height: ${HOUR_HEIGHT}px;
    padding: 4px 8px 0;
    text-align: right;
    font-size: 10.5px;
    color: var(--muted, #4D6080);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    border-bottom: 1px solid transparent;
  }
  .gc-day-col {
    position: relative;
    border-right: 1px solid rgba(255,255,255,0.05);
  }
  .gc-day-col:last-child { border-right: 0; }
  .gc-day-col.today {
    background: linear-gradient(180deg, rgba(0,229,160,0.04) 0%, rgba(0,229,160,0.01) 100%);
  }
  .gc-hour-line {
    position: absolute;
    left: 0; right: 0;
    height: 1px;
    background: rgba(255,255,255,0.05);
    pointer-events: none;
  }
  .gc-hour-line.half {
    background: transparent;
    border-top: 1px dashed rgba(255,255,255,0.04);
  }
  .gc-now {
    position: absolute;
    left: 0; right: 0;
    height: 2px;
    background: #ef4444;
    z-index: 4;
    pointer-events: none;
    box-shadow: 0 0 6px rgba(239,68,68,0.5);
  }
  .gc-now::before {
    content: '';
    position: absolute;
    left: -6px; top: -5px;
    width: 12px; height: 12px;
    border-radius: 50%;
    background: #ef4444;
    box-shadow: 0 0 0 3px rgba(239,68,68,0.20);
  }

  .gc-evt {
    position: absolute;
    left: 4px; right: 4px;
    border-radius: 8px;
    padding: 6px 8px;
    overflow: hidden;
    cursor: pointer;
    display: flex; flex-direction: column;
    gap: 2px;
    transition: filter .18s ease, transform .18s ease, box-shadow .18s ease;
    z-index: 3;
  }
  .gc-evt:hover {
    filter: brightness(1.12);
    transform: translateX(-1px);
    box-shadow: 0 8px 22px rgba(0,0,0,0.35);
    z-index: 5;
  }
  .gc-evt .who {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .gc-evt .av {
    width: 18px; height: 18px;
    border-radius: 50%;
    background: rgba(0,0,0,0.30);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 9.5px;
    font-weight: 800;
    flex-shrink: 0;
  }
  .gc-evt .meta {
    font-size: 10.5px;
    opacity: 0.86;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  .gc-evt.tiny { padding: 4px 6px; }
  .gc-evt.tiny .meta { display: none; }

  /* Day view differences */
  .gc-day {
    flex: 1;
    display: flex; flex-direction: column;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.06);
    overflow: hidden;
    background: rgba(255,255,255,0.015);
    min-height: 0;
  }
  .gc-day-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    background: linear-gradient(180deg, rgba(0,229,160,0.06) 0%, transparent 100%);
    flex-shrink: 0;
  }
  .gc-day-head h3 {
    margin: 0;
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 18px;
    color: var(--text, #E2EAF4);
    text-transform: capitalize;
  }
  .gc-day-head .sum {
    font-size: 12px;
    color: var(--soft, #8FA3C0);
  }
  .gc-day-head .sum b { color: var(--em, #00E5A0); font-weight: 700; }

  /* Empty state */
  .gc-empty {
    margin: auto;
    padding: 48px 24px;
    text-align: center;
    color: var(--muted, #4D6080);
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }
  .gc-empty svg { opacity: 0.35; }
  .gc-empty h4 {
    margin: 0;
    font-family: 'Syne', sans-serif;
    font-size: 16px;
    color: var(--soft, #8FA3C0);
  }
  .gc-empty p { margin: 0; font-size: 13px; }

  /* ─── Mobile ─────────────────────────────────────────────────── */
  @media (max-width: 1100px) {
    .gc-shell { grid-template-columns: 1fr; gap: 12px; padding: 12px; }
    .gc-side {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 10px;
    }
    .gc-create { flex: 1; min-width: 180px; }
    .gc-mini { flex: 1; min-width: 240px; }
    .gc-filters { flex: 1; min-width: 220px; }
    .gc-qs { flex: 1; min-width: 220px; }
  }
  @media (max-width: 900px) {
    .gc-shell { padding: 10px; border-radius: 16px; min-height: 0; }
    .gc-bar { gap: 8px; padding-bottom: 10px; margin-bottom: 10px; }
    .gc-bar-title { font-size: 18px; }
    .gc-bar-search { display: none; }
    .gc-bar-views button { padding: 6px 10px; font-size: 11.5px; }
    .gc-bar-views .lbl-long { display: none; }
    .gc-mcell { min-height: 76px; padding: 6px; }
    .gc-mcell-num { font-size: 12px; }
    .gc-mcell.today .gc-mcell-num { width: 22px; height: 22px; font-size: 11.5px; }
    .gc-mevent { font-size: 10px; padding: 2px 5px; }
    .gc-mevent time { display: none; }
    .gc-week-head { grid-template-columns: 44px repeat(var(--cols, 7), 1fr); }
    .gc-week-body { grid-template-columns: 44px repeat(var(--cols, 7), 1fr); }
    .gc-week-head .day { padding: 8px 4px; }
    .gc-week-head .day .num { font-size: 17px; }
    .gc-week-head .day.today .num { width: 28px; height: 28px; font-size: 14px; }
    .gc-time-slot { padding: 2px 5px 0; font-size: 9.5px; }
    .gc-evt { padding: 4px 6px; }
    .gc-evt .who { font-size: 11px; }
    .gc-evt .meta { font-size: 10px; }
  }
  @media (max-width: 560px) {
    .gc-side { flex-direction: column; }
    .gc-month-wd span { font-size: 10px; padding-left: 4px; }
    .gc-mcell { min-height: 60px; }
  }
`;

export function ModernCalendar({ events = [], onAdd, onEdit }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  const [view, setView] = useState('week'); // 'month' | 'week' | 'day'
  const [search, setSearch] = useState('');
  const [miniCursor, setMiniCursor] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [activeServices, setActiveServices] = useState(new Set()); // empty = "all"
  const [now, setNow] = useState(() => new Date());
  const weekBodyRef = useRef(null);

  // ── Calendar-sync integrations (Google Calendar real, Cover Manager waitlist) ──
  const [connections, setConnections] = useState([]);
  const [connectBusy, setConnectBusy] = useState(false);
  const [toast, setToast] = useState(null); // { kind: 'ok'|'err', msg }
  const [cmModalOpen, setCmModalOpen] = useState(false);

  const loadConnections = useCallback(async () => {
    try {
      const r = await apiCall('/api/customer/calendar/connections');
      setConnections(Array.isArray(r?.connections) ? r.connections : []);
    } catch {
      /* swallow — UI just shows "Conectar" */
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Detect the OAuth callback redirect (?calendar=connected | error) and
  // surface it as a soft toast inside this card. Strip the params so a
  // refresh doesn't replay the toast.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get('calendar');
    if (!status) return;
    const message = params.get('calendar_message') || '';
    if (status === 'connected') {
      setToast({ kind: 'ok', msg: '¡Conectado! Tus nuevas reservas se sincronizarán automáticamente con Google Calendar.' });
      loadConnections();
    } else if (status === 'error') {
      setToast({ kind: 'err', msg: message
        ? `No se pudo conectar Google Calendar: ${message.replace(/-/g, ' ')}`
        : 'No se pudo conectar Google Calendar.' });
    }
    params.delete('calendar');
    params.delete('calendar_message');
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', next);
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [loadConnections]);

  const startGoogleConnect = async () => {
    setConnectBusy(true);
    try {
      const r = await apiCall('/api/customer/calendar/google/connect', { method: 'POST' });
      if (r?.authUrl) {
        window.location.href = r.authUrl;
        return;
      }
      setToast({ kind: 'err', msg: r?.message || 'No se pudo iniciar el flujo OAuth.' });
    } catch (e) {
      setToast({ kind: 'err', msg: e?.message || 'Error al iniciar el flujo OAuth.' });
    } finally {
      setConnectBusy(false);
    }
  };

  const disconnectGoogle = async (id) => {
    if (!window.confirm('¿Desconectar esta cuenta de Google Calendar? Las reservas dejarán de sincronizarse.')) return;
    setConnectBusy(true);
    try {
      await apiCall(`/api/customer/calendar/connections/${id}`, { method: 'DELETE' });
      setToast({ kind: 'ok', msg: 'Cuenta desconectada.' });
      loadConnections();
    } catch (e) {
      setToast({ kind: 'err', msg: e?.message || 'No se pudo desconectar.' });
    } finally {
      setConnectBusy(false);
    }
  };

  const googleConnection = connections.find((c) => c.provider === 'google' && c.status === 'active');

  // Tick the now-line forward every minute.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Scroll the week/day view to roughly 08:00 on first mount so the operator
  // doesn't have to scroll up every time.
  useEffect(() => {
    if (!weekBodyRef.current) return;
    if (view === 'month') return;
    // Scroll to one hour before "now" if it's a workday, else to 08:00.
    const hr = now.getHours();
    const scrollHour = hr >= DAY_START_HOUR + 1 && hr <= DAY_END_HOUR ? hr - 1 : DAY_START_HOUR;
    weekBodyRef.current.scrollTop = Math.max(0, (scrollHour - DAY_START_HOUR) * HOUR_HEIGHT);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Index events by date and pre-compute their position metadata.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (events || []).filter((ev) => {
      if (!ev?.datetime) return false;
      const svc = String(ev.service || ev.notes || 'Reserva');
      if (activeServices.size > 0 && !activeServices.has(svc.toLowerCase())) return false;
      if (!q) return true;
      const hay = `${ev.name || ''} ${svc} ${ev.phone || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [events, search, activeServices]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const ev of filtered) {
      const k = ymd(new Date(ev.datetime));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    }
    return map;
  }, [filtered]);

  // Service breakdown for the filter sidebar — only listed if there's at
  // least one matching event, sorted by frequency.
  const services = useMemo(() => {
    const counts = new Map();
    for (const ev of events || []) {
      const svc = String(ev.service || ev.notes || 'Reserva').trim() || 'Reserva';
      counts.set(svc, (counts.get(svc) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count, color: serviceColor(name) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [events]);

  // Quick stats — today's count and this-week's count.
  const stats = useMemo(() => {
    const todayKey = ymd(today);
    const weekStart = startOfWeek(today);
    const weekEnd = addDays(weekStart, 7);
    let todayCount = 0;
    let weekCount = 0;
    for (const ev of events || []) {
      if (!ev?.datetime) continue;
      const d = new Date(ev.datetime);
      const k = ymd(d);
      if (k === todayKey) todayCount += 1;
      if (d >= weekStart && d < weekEnd) weekCount += 1;
    }
    return { today: todayCount, week: weekCount };
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthLabel = `${MONTHS_FULL[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const weekStart = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekLabel = (() => {
    const start = weekStart;
    const end = addDays(weekStart, 6);
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()} – ${end.getDate()} ${MONTHS_FULL[end.getMonth()].toLowerCase()} ${end.getFullYear()}`;
    }
    return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  })();
  const dayLabel = `${WEEKDAYS_FULL[(cursor.getDay() + 6) % 7]} ${cursor.getDate()} de ${MONTHS_FULL[cursor.getMonth()].toLowerCase()}`;

  const title = view === 'month' ? monthLabel : view === 'week' ? weekLabel : dayLabel;

  const stepCursor = (delta) => {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + delta);
    else if (view === 'week') d.setDate(d.getDate() + 7 * delta);
    else d.setDate(d.getDate() + delta);
    setCursor(d);
    if (view === 'month') setMiniCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const goToday = () => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    setCursor(t);
    setMiniCursor(new Date(t.getFullYear(), t.getMonth(), 1));
  };
  const toggleService = (svc) => {
    const lower = svc.toLowerCase();
    setActiveServices((curr) => {
      const next = new Set(curr);
      if (next.has(lower)) next.delete(lower);
      else next.add(lower);
      return next;
    });
  };

  /* ─── Mini month renderer ─────────────────────────────────────── */
  const miniGrid = (() => {
    const y = miniCursor.getFullYear();
    const m = miniCursor.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push({ empty: true, key: `e${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${pad(m + 1)}-${pad(d)}`;
      cells.push({ d, key, hasEvents: byDay.has(key) });
    }
    while (cells.length % 7 !== 0) cells.push({ empty: true, key: `t${cells.length}` });
    return cells;
  })();

  /* ─── Event position math ─────────────────────────────────────── */
  const eventStyle = (ev) => {
    const d = new Date(ev.datetime);
    const startMin = d.getHours() * 60 + d.getMinutes() - DAY_START_HOUR * 60;
    const top = (startMin / 60) * HOUR_HEIGHT;
    const dur = eventDurationMinutes(ev);
    const height = Math.max(22, (dur / 60) * HOUR_HEIGHT - 4);
    const c = serviceColor(ev.service || ev.notes || 'Reserva');
    return {
      style: { top: `${top}px`, height: `${height}px`, background: c.bg, border: `1px solid ${c.bd}`, color: c.tx },
      color: c,
      tiny: height < 40,
    };
  };

  const renderEventsForDay = (date) => {
    const list = byDay.get(ymd(date)) || [];
    return list.map((ev) => {
      const { style, color, tiny } = eventStyle(ev);
      const d = new Date(ev.datetime);
      const endMins = d.getHours() * 60 + d.getMinutes() + eventDurationMinutes(ev);
      const endTime = `${pad(Math.floor(endMins / 60))}:${pad(endMins % 60)}`;
      return (
        <div
          key={ev.id}
          className={`gc-evt${tiny ? ' tiny' : ''}`}
          style={style}
          onClick={(e) => { e.stopPropagation(); onEdit?.(ev); }}
        >
          <div className="who">
            <span className="av" style={{ background: color.dot, color: '#04201a' }}>{initials(ev.name)}</span>
            {ev.name || 'Cliente'}
          </div>
          <div className="meta">
            {fmtTime(d)} – {endTime} · {ev.service || ev.notes || 'Reserva'}
          </div>
        </div>
      );
    });
  };

  /* ─── Now line position ───────────────────────────────────────── */
  const nowLineTop = (() => {
    const mins = now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60;
    if (mins < 0 || mins > (DAY_END_HOUR - DAY_START_HOUR) * 60) return null;
    return (mins / 60) * HOUR_HEIGHT;
  })();

  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);

  return (
    <>
      <style>{STYLES}</style>
      <div className="gc-shell">
        {/* ── Sidebar ── */}
        <aside className="gc-side">
          <button type="button" className="gc-create" onClick={() => onAdd?.(ymd(cursor))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Crear reserva
          </button>

          {/* Mini month */}
          <div className="gc-mini">
            <div className="gc-mini-head">
              <span className="gc-mini-label">
                {MONTHS_FULL[miniCursor.getMonth()].toLowerCase()} {miniCursor.getFullYear()}
              </span>
              <div className="gc-mini-nav">
                <button type="button" onClick={() => setMiniCursor(new Date(miniCursor.getFullYear(), miniCursor.getMonth() - 1, 1))} aria-label="Mes anterior">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <button type="button" onClick={() => setMiniCursor(new Date(miniCursor.getFullYear(), miniCursor.getMonth() + 1, 1))} aria-label="Mes siguiente">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
            <div className="gc-mini-grid">
              {WEEKDAYS_MINI.map((w) => <span key={w} className="gc-mini-wd">{w}</span>)}
              {miniGrid.map((c) => {
                if (c.empty) return <span key={c.key} className="gc-mini-cell empty" />;
                const d = new Date(miniCursor.getFullYear(), miniCursor.getMonth(), c.d);
                const isToday = sameDay(d, today);
                const isSelected = sameDay(d, cursor);
                return (
                  <button
                    key={c.key}
                    type="button"
                    className={`gc-mini-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${c.hasEvents ? ' has-events' : ''}`}
                    onClick={() => setCursor(d)}
                  >
                    {c.d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Service filters */}
          {services.length > 0 ? (
            <div className="gc-filters">
              <div className="gc-section-head">Servicios</div>
              {services.map((s) => {
                const isOff = activeServices.size > 0 && !activeServices.has(s.name.toLowerCase());
                return (
                  <div
                    key={s.name}
                    className={`gc-filter-row${isOff ? ' off' : ''}`}
                    onClick={() => toggleService(s.name)}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="dot" style={{ background: s.color.dot }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span className="count">{s.count}</span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Quick stats */}
          <div className="gc-qs">
            <div className="gc-qs-card em">
              <div className="lbl">Hoy</div>
              <div className="val">{stats.today}</div>
            </div>
            <div className="gc-qs-card">
              <div className="lbl">Esta semana</div>
              <div className="val">{stats.week}</div>
            </div>
          </div>
        </aside>

        {/* ── Main area ── */}
        <main className="gc-main">
          {/* Integrations: real Google Calendar OAuth + Cover Manager waitlist */}
          <div className="gc-int">
            <div className={`gc-int-card${googleConnection ? ' connected' : ''}`}>
              <span className="gc-int-logo google" aria-hidden />
              <div className="gc-int-meta">
                <span className="name">Google Calendar</span>
                <span className="sub">
                  {googleConnection
                    ? `Conectado: ${googleConnection.account_email || 'cuenta de Google'}`
                    : 'Sincroniza tus reservas con Google automáticamente'}
                </span>
              </div>
              {googleConnection ? (
                <button
                  type="button"
                  className="gc-int-action danger"
                  onClick={() => disconnectGoogle(googleConnection.id)}
                  disabled={connectBusy}
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  className="gc-int-action primary"
                  onClick={startGoogleConnect}
                  disabled={connectBusy}
                >
                  {connectBusy ? 'Abriendo…' : 'Conectar'}
                </button>
              )}
            </div>

            <div className="gc-int-card">
              <span className="gc-int-logo cm" aria-hidden>CM</span>
              <div className="gc-int-meta">
                <span className="name">Cover Manager</span>
                <span className="sub">Envía reservas a tu sistema de mesas (próximamente)</span>
              </div>
              <button
                type="button"
                className="gc-int-action"
                onClick={() => setCmModalOpen(true)}
              >
                Lista de espera
              </button>
            </div>
          </div>

          {toast ? (
            <div className={`gc-int-toast ${toast.kind}`}>
              <strong>{toast.kind === 'ok' ? '✓ ' : '⚠ '}</strong>{toast.msg}
            </div>
          ) : null}

          <div className="gc-bar">
            <div className="gc-bar-nav">
              <button type="button" onClick={() => stepCursor(-1)} aria-label="Anterior">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button type="button" onClick={() => stepCursor(1)} aria-label="Siguiente">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button type="button" className="today" onClick={goToday}>Hoy</button>
            </div>
            <div className="gc-bar-title">{title}</div>
            <input
              type="search"
              className="gc-bar-search"
              placeholder="Buscar cliente, servicio…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="gc-bar-spacer" />
            <div className="gc-bar-views" role="tablist">
              <button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>
                <span className="lbl-long">Mes</span>
                <span style={{ display: 'none' }} className="lbl-short">M</span>
              </button>
              <button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
                Semana
              </button>
              <button type="button" className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>
                Día
              </button>
            </div>
          </div>

          {/* ── Month view ── */}
          {view === 'month' ? (
            <div className="gc-month">
              <div className="gc-month-wd">
                {WEEKDAYS_SHORT.map((w) => <span key={w}>{w}</span>)}
              </div>
              <div className="gc-month-grid">
                {(() => {
                  const y = cursor.getFullYear();
                  const m = cursor.getMonth();
                  const firstDay = new Date(y, m, 1).getDay();
                  const offset = firstDay === 0 ? 6 : firstDay - 1;
                  const daysInMonth = new Date(y, m + 1, 0).getDate();
                  const cells = [];
                  for (let i = 0; i < offset; i++) cells.push(<div key={`e${i}`} className="gc-mcell empty" />);
                  for (let d = 1; d <= daysInMonth; d++) {
                    const date = new Date(y, m, d);
                    const key = ymd(date);
                    const list = byDay.get(key) || [];
                    const isToday = sameDay(date, today);
                    cells.push(
                      <div
                        key={key}
                        className={`gc-mcell${isToday ? ' today' : ''}`}
                        onClick={() => { setCursor(date); setView('day'); }}
                        role="button"
                        tabIndex={0}
                      >
                        <span className="gc-mcell-num">{d}</span>
                        {list.slice(0, 3).map((ev) => {
                          const c = serviceColor(ev.service || ev.notes || 'Reserva');
                          const t = new Date(ev.datetime);
                          return (
                            <div
                              key={ev.id}
                              className="gc-mevent"
                              style={{ background: c.bg, color: c.tx, border: `1px solid ${c.bd}` }}
                              onClick={(e) => { e.stopPropagation(); onEdit?.(ev); }}
                            >
                              <time>{fmtTime(t)}</time>
                              <span className="name">{ev.name || 'Cliente'}</span>
                            </div>
                          );
                        })}
                        {list.length > 3 ? <div className="gc-mevent-more">+{list.length - 3} más</div> : null}
                      </div>
                    );
                  }
                  while (cells.length % 7 !== 0) cells.push(<div key={`t${cells.length}`} className="gc-mcell empty" />);
                  return cells;
                })()}
              </div>
            </div>
          ) : null}

          {/* ── Week view ── */}
          {view === 'week' ? (
            <div className="gc-week" style={{ '--cols': 7 }}>
              <div className="gc-week-head">
                <div className="corner" />
                {weekDays.map((d) => {
                  const isToday = sameDay(d, today);
                  return (
                    <div key={d.toISOString()} className={`day${isToday ? ' today' : ''}`}>
                      <div className="wd">{WEEKDAYS_SHORT[(d.getDay() + 6) % 7]}</div>
                      <div className="num">{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>
              <div className="gc-week-body" ref={weekBodyRef}>
                <div className="gc-time-col">
                  {hours.map((h) => (
                    <div key={h} className="gc-time-slot">{pad(h)}:00</div>
                  ))}
                </div>
                {weekDays.map((d) => {
                  const isToday = sameDay(d, today);
                  return (
                    <div
                      key={d.toISOString()}
                      className={`gc-day-col${isToday ? ' today' : ''}`}
                      onClick={() => onAdd?.(ymd(d))}
                    >
                      {hours.map((h, i) => (
                        <div key={h} className="gc-hour-line" style={{ top: `${(i + 1) * HOUR_HEIGHT}px` }} />
                      ))}
                      {renderEventsForDay(d)}
                      {isToday && nowLineTop != null ? (
                        <div className="gc-now" style={{ top: `${nowLineTop}px` }} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ── Day view ── */}
          {view === 'day' ? (
            <div className="gc-day" style={{ '--cols': 1 }}>
              <div className="gc-day-head">
                <h3>{dayLabel}</h3>
                <div className="sum">
                  <b>{(byDay.get(ymd(cursor)) || []).length}</b> reservas hoy
                </div>
              </div>
              <div className="gc-week" style={{ '--cols': 1, border: 0, borderRadius: 0, flex: 1 }}>
                <div className="gc-week-body" ref={weekBodyRef}>
                  <div className="gc-time-col">
                    {hours.map((h) => (
                      <div key={h} className="gc-time-slot">{pad(h)}:00</div>
                    ))}
                  </div>
                  <div
                    className={`gc-day-col${sameDay(cursor, today) ? ' today' : ''}`}
                    onClick={() => onAdd?.(ymd(cursor))}
                  >
                    {hours.map((h, i) => (
                      <div key={h} className="gc-hour-line" style={{ top: `${(i + 1) * HOUR_HEIGHT}px` }} />
                    ))}
                    {renderEventsForDay(cursor)}
                    {sameDay(cursor, today) && nowLineTop != null ? (
                      <div className="gc-now" style={{ top: `${nowLineTop}px` }} />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* Cover Manager waitlist modal — public CM API isn't available yet,
          so we collect interest and let the customer know when it lands. */}
      {cmModalOpen ? (
        <div
          onClick={() => setCmModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10010,
            background: 'rgba(2,6,12,0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(460px, 100%)',
              background: 'linear-gradient(180deg, #162032 0%, #111827 100%)',
              border: '1px solid rgba(107,70,193,0.45)',
              borderRadius: 22,
              padding: '26px 26px 22px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 64, height: 64, borderRadius: 18,
                margin: '0 auto 14px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #6b46c1 0%, #b794f4 100%)',
                color: '#fff', fontSize: 22, fontWeight: 900,
                boxShadow: '0 14px 36px rgba(107,70,193,0.32)',
              }}
            >
              CM
            </div>
            <h3 style={{ margin: '0 0 8px', fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
              Cover Manager — Lista de espera
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--soft, #8FA3C0)' }}>
              La integración directa con <strong>Cover Manager</strong> está en negociación con su equipo
                de partners. Mientras tanto, te avisaremos al email de tu cuenta en cuanto esté lista para
                conectar — sin pasos manuales por tu parte.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setCmModalOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--soft, #8FA3C0)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 11,
                  padding: '11px 22px',
                  fontWeight: 800,
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setCmModalOpen(false);
                  setToast({ kind: 'ok', msg: 'Te avisaremos en cuanto Cover Manager esté disponible.' });
                  setTimeout(() => setToast(null), 5000);
                }}
                style={{
                  background: 'linear-gradient(135deg, #b794f4 0%, #6b46c1 100%)',
                  color: '#fff',
                  border: 0,
                  borderRadius: 11,
                  padding: '11px 22px',
                  fontWeight: 800,
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
              >
                Avisarme cuando esté listo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
