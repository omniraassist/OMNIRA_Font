import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiCall } from '../api/client.js';

/**
 * Full email client. Layout is driven by CSS @container queries on the
 * .em-app wrapper, so the panes resize against THEIR available width — not
 * the viewport. That means collapsing the outer admin sidebar instantly
 * gives the email page more room without any JS, and mobile gets a clean
 * master-detail flow without us having to track viewport size manually.
 *
 *   width band              layout
 *   ─────────────────────── ───────────────────────────────────────
 *   < 720  px               rail at top (tab strip), list OR reader
 *   720 – 1080 px           rail icon-only on left, list OR reader
 *   1080 – 1340 px          rail expanded, list OR reader (master-detail)
 *   ≥ 1340 px               rail + list + reader (all three visible)
 *
 * Actions on the reader use an icon-first toolbar that never wraps — at
 * narrow widths the secondary actions collapse into a "Más" menu.
 */
const STYLES = `
  /* The container is the SHELL — not .em-app itself. CSS container queries
     only apply to a container's descendants, never to the container element,
     so we need a wrapper that declares container-type and lets the inner
     .em-app respond to its parent's width. Without this wrapper every
     min-width rule below silently no-ops. */
  .em-shell {
    container-type: inline-size;
    container-name: emapp;
    flex: 1;
    min-height: 0;
    width: 100%;
    padding: 12px;
    display: flex;
  }
  .em-app {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-areas: "rail" "main";
    grid-template-rows: auto 1fr;
    gap: 12px;
  }

  /* ─── Folder rail ────────────────────────────────────────────── */
  .em-rail {
    grid-area: rail;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 10px;
    overflow: auto;
    display: flex;
    flex-direction: row;
    gap: 6px;
    scroll-snap-type: x mandatory;
  }
  .em-rail::-webkit-scrollbar { height: 6px; }
  .em-rail::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

  .em-compose-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, var(--em) 0%, var(--em2) 100%);
    color: #04201a; font-weight: 800; font-size: 13px;
    border: 0; border-radius: 12px;
    padding: 11px 16px; cursor: pointer;
    flex-shrink: 0; scroll-snap-align: start;
    transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
    white-space: nowrap;
  }
  .em-compose-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(0,229,160,0.35); }

  .em-rail-item {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 9px 12px;
    border-radius: 10px;
    color: var(--soft);
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 13px; font-weight: 600;
    text-align: left;
    transition: background .15s ease, color .15s ease, border-color .15s ease;
    white-space: nowrap;
    flex-shrink: 0;
    scroll-snap-align: start;
  }
  .em-rail-item:hover { background: rgba(255,255,255,0.04); color: var(--text); }
  .em-rail-item.active {
    background: rgba(0,229,160,0.10);
    color: var(--em);
    border-color: rgba(0,229,160,0.25);
  }
  .em-rail-item .count {
    font-size: 10.5px; font-weight: 700;
    background: rgba(255,255,255,0.06);
    color: var(--soft);
    padding: 1px 7px; border-radius: 999px;
    min-width: 18px; text-align: center;
  }
  .em-rail-item.active .count { background: rgba(0,229,160,0.18); color: var(--em); }
  .em-rail-item .lbl { display: inline; }
  .em-rail-item svg { flex-shrink: 0; }

  .em-rail-toggle {
    display: none;
    align-items: center; justify-content: center;
    background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    color: var(--soft); border-radius: 10px;
    width: 36px; height: 36px;
    cursor: pointer;
    margin-top: auto;
    transition: all .15s ease;
  }
  .em-rail-toggle:hover { color: var(--em); border-color: var(--border-em); }
  .em-rail-toggle svg { transition: transform .25s ease; }

  /* ─── Main area: contains list + reader ──────────────────────── */
  .em-main {
    grid-area: main;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-areas: "pane";
    gap: 12px;
    min-width: 0;
    min-height: 0;
  }

  /* By default (mobile / narrow), only one of list/reader visible at a time. */
  .em-list-pane, .em-reader-pane {
    grid-area: pane;
    min-width: 0; min-height: 0;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .em-main:not(.reader-open) .em-reader-pane { display: none; }
  .em-main.reader-open .em-list-pane { display: none; }

  /* ─── List pane internals ────────────────────────────────────── */
  .em-list-toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 11px 12px;
    border-bottom: 1px solid var(--border);
    background: rgba(0,0,0,0.18);
  }
  .em-search {
    flex: 1; min-width: 0;
    background: rgba(0,0,0,0.30); border: 1px solid var(--border);
    border-radius: 10px; padding: 8px 12px;
    color: var(--text); font-size: 13px;
    outline: none;
    transition: border-color .15s ease;
  }
  .em-search:focus { border-color: var(--em); }
  .em-search::placeholder { color: var(--muted); }
  .em-icon-btn {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    color: var(--soft); border-radius: 10px;
    width: 36px; height: 36px;
    cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: color .15s ease, border-color .15s ease, background .15s ease;
  }
  .em-icon-btn:hover { color: var(--em); border-color: var(--border-em); background: rgba(0,229,160,0.06); }
  .em-icon-btn.spinning svg { animation: em-spin 0.8s linear infinite; }
  .em-icon-btn:disabled { opacity: .5; cursor: not-allowed; }
  @keyframes em-spin { to { transform: rotate(360deg); } }

  .em-list-head {
    display: flex; align-items: baseline; justify-content: space-between;
    padding: 8px 14px;
    font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted); font-weight: 700;
    border-bottom: 1px solid var(--border);
    background: rgba(0,0,0,0.10);
  }
  .em-list-head em { font-style: normal; color: var(--em); }

  .em-list { flex: 1; overflow-y: auto; list-style: none; margin: 0; padding: 0; }
  .em-list::-webkit-scrollbar { width: 8px; }
  .em-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 4px; }

  .em-row {
    display: grid;
    grid-template-columns: 36px 1fr auto;
    gap: 11px;
    align-items: flex-start;
    padding: 13px 14px 13px 12px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    position: relative;
    transition: background .15s ease;
  }
  .em-row:hover { background: rgba(255,255,255,0.025); }
  .em-row.active {
    background: rgba(0,229,160,0.08);
    box-shadow: inset 3px 0 0 var(--em);
  }
  .em-row.unread .em-row-from, .em-row.unread .em-row-subject {
    font-weight: 800; color: var(--text);
  }

  .em-row-av {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, rgba(0,229,160,0.22), rgba(96,165,250,0.10));
    border: 1px solid var(--border-em);
    color: var(--em); font-weight: 700; font-size: 13px;
    display: inline-flex; align-items: center; justify-content: center;
    position: relative;
  }
  .em-row.unread .em-row-av::after {
    content: '';
    position: absolute; top: -2px; right: -2px;
    width: 9px; height: 9px; border-radius: 50%;
    background: var(--em);
    box-shadow: 0 0 0 2px var(--surf), 0 0 8px rgba(0,229,160,0.7);
  }

  .em-row-body { min-width: 0; }
  .em-row-from {
    font-size: 13px; color: var(--soft);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.35;
  }
  .em-row-subject {
    font-size: 12.5px; color: var(--soft);
    margin-top: 3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.4;
  }
  .em-row-preview {
    font-size: 11.5px; color: var(--muted);
    margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .em-row-meta {
    display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
    min-width: 56px;
    padding-top: 2px;
  }
  .em-row-date {
    font-size: 11px; color: var(--muted);
    white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .em-row.unread .em-row-date { color: var(--em); font-weight: 700; }
  .em-row-star {
    background: transparent; border: 0; padding: 0; cursor: pointer;
    color: var(--muted); font-size: 16px; line-height: 1;
    transition: color .15s ease, transform .15s ease;
  }
  .em-row-star.on { color: #facc15; text-shadow: 0 0 6px rgba(250,204,21,0.5); }
  .em-row-star:hover { transform: scale(1.2); color: #facc15; }
  .em-row-trash-btn {
    background: transparent; border: 0; padding: 0; cursor: pointer;
    color: var(--muted); font-size: 14px; line-height: 1;
  }
  .em-row-trash-btn:hover { color: #fca5a5; }

  .em-empty {
    flex: 1;
    padding: 60px 28px; text-align: center;
    color: var(--muted); font-size: 13.5px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  }
  .em-empty svg { opacity: 0.35; }

  /* ─── Reader pane internals ──────────────────────────────────── */
  .em-reader-empty {
    flex: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: var(--muted); font-size: 13.5px;
    text-align: center; padding: 40px 28px;
    gap: 14px;
  }
  .em-reader-empty svg { opacity: 0.3; }

  .em-reader-toolbar {
    display: flex; align-items: center; gap: 6px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    background: rgba(0,0,0,0.20);
    flex-wrap: nowrap;
    overflow: hidden;
  }
  .em-back-btn {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    color: var(--soft); border-radius: 10px;
    width: 36px; height: 36px;
    cursor: pointer;
    display: none; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: all .15s ease;
  }
  .em-back-btn:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }

  .em-act {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
    border-radius: 10px;
    padding: 7px 11px;
    cursor: pointer;
    font-size: 12.5px;
    font-weight: 600;
    flex-shrink: 0;
    transition: all .15s ease;
    white-space: nowrap;
  }
  .em-act:hover { color: var(--em); border-color: var(--border-em); background: rgba(0,229,160,0.06); }
  .em-act.danger:hover { color: #fca5a5; border-color: rgba(239,68,68,0.30); background: rgba(239,68,68,0.06); }
  .em-act:disabled { opacity: .5; cursor: not-allowed; }
  .em-act .lbl { display: inline; }
  .em-act-spacer { flex: 1; min-width: 0; }

  .em-act-menu-wrap { position: relative; flex-shrink: 0; }
  .em-act-menu {
    position: absolute; top: calc(100% + 6px); right: 0;
    background: var(--surf2);
    border: 1px solid var(--border-em);
    border-radius: 12px;
    padding: 6px;
    min-width: 200px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.55);
    z-index: 100;
    animation: em-pop .15s ease-out;
  }
  @keyframes em-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
  .em-act-menu button {
    width: 100%; text-align: left;
    background: transparent; border: 0;
    color: var(--soft);
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 13px; font-weight: 600;
    cursor: pointer;
    display: flex; align-items: center; gap: 10px;
  }
  .em-act-menu button:hover { background: rgba(255,255,255,0.05); color: var(--text); }
  .em-act-menu button.danger:hover { color: #fca5a5; background: rgba(239,68,68,0.06); }
  .em-act-menu hr { border: 0; border-top: 1px solid var(--border); margin: 4px 0; }

  .em-reader-head {
    padding: 18px 22px 14px;
    border-bottom: 1px solid var(--border);
  }
  .em-reader-head h2 {
    margin: 0 0 14px;
    font-family: var(--font-display);
    font-size: clamp(16px, 1.4vw, 19px);
    color: var(--text);
    line-height: 1.4;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .em-from-row {
    display: flex; align-items: center; gap: 12px;
  }
  .em-from-av {
    width: 42px; height: 42px; border-radius: 50%;
    background: linear-gradient(135deg, rgba(0,229,160,0.30), rgba(96,165,250,0.18));
    border: 1px solid var(--border-em);
    color: var(--em); font-weight: 700; font-size: 15px;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .em-from-meta { min-width: 0; flex: 1; }
  .em-from-meta .name { display: block; color: var(--text); font-size: 14px; font-weight: 700; }
  .em-from-meta .addr {
    display: block; color: var(--muted); font-size: 12px; margin-top: 2px;
    word-break: break-all;
  }
  .em-from-date {
    font-size: 11.5px; color: var(--muted);
    white-space: nowrap;
    text-align: right;
    flex-shrink: 0;
  }

  .em-details-toggle {
    background: transparent; border: 0;
    color: var(--soft); font-size: 11.5px; font-weight: 600;
    cursor: pointer;
    margin-top: 8px;
    padding: 4px 8px; border-radius: 6px;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .em-details-toggle:hover { color: var(--em); background: rgba(0,229,160,0.06); }
  .em-details-toggle svg { transition: transform .2s ease; }
  .em-details-toggle.open svg { transform: rotate(180deg); }

  .em-recipients {
    margin-top: 6px;
    font-size: 11.5px; color: var(--soft);
    line-height: 1.7;
    padding: 8px 10px;
    background: rgba(0,0,0,0.18);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .em-recipients .row { display: flex; gap: 8px; }
  .em-recipients .row b { color: var(--muted); font-weight: 700; min-width: 38px; }
  .em-recipients .row span { word-break: break-word; }

  .em-reader-body {
    flex: 1; overflow-y: auto;
    padding: 0;
    background: var(--surf);
  }
  .em-reader-iframe { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; }
  .em-reader-plain {
    padding: 22px 24px;
    color: var(--text);
    font-size: 14px; line-height: 1.7;
    white-space: pre-wrap; word-wrap: break-word;
  }

  .em-attachments {
    padding: 12px 22px;
    border-top: 1px solid var(--border);
    background: rgba(0,0,0,0.20);
  }
  .em-attachments h4 {
    margin: 0 0 8px;
    font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted); font-weight: 700;
  }
  .em-att-list { display: flex; gap: 8px; flex-wrap: wrap; }
  .em-att {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--border);
    border-radius: 10px; padding: 8px 12px;
    font-size: 12px; color: var(--soft);
  }
  .em-att small { color: var(--muted); }

  /* ─── Banners — float at top-right of stage, don't push layout ── */
  .em-banner {
    position: fixed;
    top: 70px;
    right: 18px;
    z-index: 200;
    padding: 11px 16px;
    border-radius: 12px;
    font-size: 12.5px;
    max-width: 420px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.45);
    animation: em-banner-in .25s ease-out;
  }
  @keyframes em-banner-in { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  .em-banner.err { background: rgba(40,12,12,0.96); border: 1px solid rgba(239,68,68,0.40); color: #fecaca; }
  .em-banner.ok { background: rgba(12,40,20,0.96); border: 1px solid rgba(34,197,94,0.40); color: #bbf7d0; }
  .em-banner.warn { background: rgba(40,30,12,0.96); border: 1px solid rgba(251,191,36,0.40); color: #fde68a; }

  .em-setup-bar {
    padding: 10px 16px;
    background: rgba(251,191,36,0.10);
    border-bottom: 1px solid rgba(251,191,36,0.25);
    color: #fde68a;
    font-size: 12.5px;
    text-align: center;
    flex-shrink: 0;
  }
  .em-setup-bar code {
    background: rgba(0,0,0,0.30); padding: 2px 7px; border-radius: 6px;
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--em);
    margin: 0 2px;
  }

  /* ─── Container query breakpoints ────────────────────────────── */
  /* ≥ 720 px: rail to the side, icon-only */
  @container emapp (min-width: 720px) {
    .em-app {
      grid-template-columns: 76px 1fr;
      grid-template-rows: 1fr;
      grid-template-areas: "rail main";
    }
    .em-rail {
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 14px 10px;
      height: 100%;
    }
    .em-rail-item { padding: 11px 12px; justify-content: flex-start; }
    .em-rail-item .lbl { display: none; }
    .em-rail-item .count {
      position: absolute;
      right: 4px; top: 4px;
      transform: none;
    }
    .em-rail-item { position: relative; }
    .em-compose-btn .lbl { display: none; }
    .em-compose-btn { padding: 12px; margin-bottom: 6px; justify-content: center; }
    .em-rail-toggle { display: inline-flex; }
  }

  /* ≥ 1080 px: rail expanded (icon + label) */
  @container emapp (min-width: 1080px) {
    .em-app:not(.rail-compact) {
      grid-template-columns: 220px 1fr;
    }
    .em-app:not(.rail-compact) .em-rail-item .lbl { display: inline; }
    .em-app:not(.rail-compact) .em-rail-item .count {
      position: static; margin-left: auto;
    }
    .em-app:not(.rail-compact) .em-compose-btn { padding: 12px 16px; }
    .em-app:not(.rail-compact) .em-compose-btn .lbl { display: inline; }
  }

  /* ≥ 1280 px: show list + reader side by side */
  @container emapp (min-width: 1280px) {
    .em-app:not(.rail-compact) {
      grid-template-columns: 220px 1fr;
    }
    .em-app.rail-compact {
      grid-template-columns: 76px 1fr;
    }
    .em-main {
      grid-template-columns: minmax(320px, 380px) 1fr;
      grid-template-areas: "list reader";
    }
    .em-list-pane { grid-area: list; }
    .em-reader-pane { grid-area: reader; display: flex !important; }
    .em-main:not(.reader-open) .em-reader-pane,
    .em-main.reader-open .em-list-pane { display: flex !important; }
    .em-back-btn { display: none !important; }
  }

  /* When the layout falls back to single-pane (under 1280), show the back button */
  @container emapp (max-width: 1279.98px) {
    .em-main.reader-open .em-back-btn { display: inline-flex; }
  }

  /* Tight reader: hide action labels to keep the toolbar on one line. The
     icon already conveys the meaning; title attributes carry the tooltip. */
  @container emapp (max-width: 920px) {
    .em-reader-toolbar .em-act .lbl { display: none; }
    .em-reader-toolbar .em-act { padding: 7px 10px; }
  }

  /* Very tight (phone in portrait): reader head + iframe shrink, fonts step down. */
  @container emapp (max-width: 560px) {
    .em-reader-head { padding: 14px 16px 10px; }
    .em-reader-head h2 { font-size: 15px; margin-bottom: 10px; }
    .em-from-av { width: 36px; height: 36px; font-size: 13px; }
    .em-from-meta .name { font-size: 13px; }
    .em-from-meta .addr { font-size: 11px; }
    .em-from-date { font-size: 10.5px; }
    .em-reader-iframe { min-height: 260px; }
    .em-row { grid-template-columns: 32px 1fr auto; gap: 9px; padding: 11px 12px; }
    .em-row-av { width: 32px; height: 32px; font-size: 12px; }
  }

  /* ─── Compose modal (Gmail-style bottom-right card) ──────────── */
  .em-modal-overlay {
    position: fixed; inset: 0; z-index: 2000;
    background: rgba(2,6,12,0.55);
    backdrop-filter: blur(4px);
    display: flex; align-items: flex-end; justify-content: flex-end;
    padding: 0;
    animation: em-fade-in .2s ease-out;
  }
  @keyframes em-fade-in { from { opacity: 0; } to { opacity: 1; } }

  .em-compose {
    width: min(640px, 100vw);
    height: min(72dvh, 600px);
    max-height: 100dvh;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -24px 60px rgba(0,0,0,0.6);
    display: flex; flex-direction: column;
    overflow: hidden;
    margin-right: 24px;
    animation: em-rise .28s cubic-bezier(.4,0,.2,1);
  }
  @keyframes em-rise { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  @media (max-width: 720px) {
    .em-modal-overlay { align-items: stretch; justify-content: stretch; }
    .em-compose { width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; margin: 0; }
  }

  .em-compose-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px;
    padding: 12px 16px;
    background: rgba(0,0,0,0.30);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .em-compose-head h3 {
    margin: 0;
    font-family: var(--font-display); font-size: 14px; color: var(--text);
    display: flex; align-items: center; gap: 8px;
    min-width: 0;
  }
  .em-draft-flag {
    font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
    font-weight: 700; color: var(--muted);
    background: rgba(255,255,255,0.04);
    padding: 3px 7px; border-radius: 999px;
    white-space: nowrap;
  }
  .em-draft-flag.saving { color: var(--em); background: rgba(0,229,160,0.10); }
  .em-draft-flag.saved { color: #86efac; background: rgba(34,197,94,0.10); }
  .em-compose-x {
    background: transparent; border: 0; color: var(--soft);
    cursor: pointer; padding: 4px;
    border-radius: 6px;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .em-compose-x:hover { color: var(--text); background: rgba(255,255,255,0.06); }

  .em-compose-body {
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column;
    min-height: 0;
  }
  .em-field {
    display: flex; align-items: flex-start; gap: 10px;
    border-bottom: 1px solid var(--border);
    padding: 11px 16px;
  }
  .em-field label {
    width: 50px; flex-shrink: 0;
    font-size: 11px; font-weight: 700;
    color: var(--muted); text-transform: uppercase; letter-spacing: .04em;
    padding-top: 7px;
  }
  .em-field input {
    flex: 1; min-width: 0;
    background: transparent; border: 0;
    color: var(--text); font-size: 13.5px;
    padding: 6px 0;
    outline: none;
    font-family: inherit;
  }
  .em-field input::placeholder { color: var(--muted); }
  .em-field-extra {
    display: flex; align-items: center; gap: 4px;
    margin-left: auto; padding-top: 4px;
  }
  .em-cc-toggle {
    background: transparent; border: 0;
    color: var(--soft); cursor: pointer;
    font-size: 11.5px; font-weight: 700;
    padding: 4px 8px; border-radius: 6px;
  }
  .em-cc-toggle:hover { color: var(--em); background: rgba(0,229,160,0.06); }
  .em-cc-toggle.on { color: var(--em); }

  .em-body-input {
    flex: 1; width: 100%;
    min-height: 180px;
    padding: 16px;
    background: transparent;
    border: 0;
    color: var(--text);
    font-size: 14px;
    line-height: 1.6;
    outline: none;
    resize: none;
    font-family: inherit;
  }
  .em-body-input::placeholder { color: var(--muted); }

  .em-compose-foot {
    display: flex; align-items: center; gap: 10px;
    padding: 11px 16px;
    background: rgba(0,0,0,0.20);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .em-send-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, var(--em) 0%, var(--em2) 100%);
    color: #04201a; font-weight: 800; font-size: 13.5px;
    border: 0; border-radius: 10px;
    padding: 10px 20px;
    cursor: pointer;
    transition: filter .15s ease, transform .15s ease;
  }
  .em-send-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.08); }
  .em-send-btn:disabled { opacity: .5; cursor: not-allowed; }
  .em-foot-ghost {
    background: transparent; border: 1px solid var(--border);
    color: var(--soft); border-radius: 10px;
    padding: 9px 14px; cursor: pointer; font-size: 12.5px; font-weight: 600;
  }
  .em-foot-ghost:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }
  .em-foot-ghost.danger:hover { color: #fca5a5; border-color: rgba(239,68,68,0.30); }
  .em-foot-status {
    margin-left: auto;
    font-size: 11.5px; color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
  }
`;

const FOLDER_META = [
  { key: 'inbox',   label: 'Bandeja de entrada', short: 'Entrada',  icon: 'inbox' },
  { key: 'starred', label: 'Destacados',         short: 'Destacados', icon: 'star' },
  { key: 'sent',    label: 'Enviados',           short: 'Enviados', icon: 'send' },
  { key: 'drafts',  label: 'Borradores',         short: 'Borradores', icon: 'draft' },
  { key: 'spam',    label: 'Spam',               short: 'Spam',     icon: 'spam' },
  { key: 'trash',   label: 'Papelera',           short: 'Papelera', icon: 'trash' },
];

function FolderIcon({ kind }) {
  const props = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (kind) {
    case 'inbox':  return <svg {...props}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;
    case 'star':   return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
    case 'send':   return <svg {...props}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
    case 'draft':  return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
    case 'spam':   return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case 'trash':  return <svg {...props}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>;
    default: return null;
  }
}

function fmtRowDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: sameYear ? undefined : 'numeric' });
}

function fmtFull(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function initials(name, address) {
  const src = String(name || address || '?').trim();
  return src.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function fromLine(arr) {
  if (!Array.isArray(arr) || !arr.length) return '—';
  const a = arr[0];
  return a.name || a.address || '—';
}

function addressList(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ');
}

function quoteForReply(msg) {
  if (!msg) return '';
  const date = fmtFull(msg.date) || '';
  const author = fromLine(msg.from);
  const body = (msg.text || '').slice(0, 8000);
  const quoted = body.split(/\n/).map((l) => `> ${l}`).join('\n');
  return `\n\n— — —\nEl ${date} ${author} escribió:\n${quoted}\n`;
}

export function EmailPage() {
  const [folders, setFolders] = useState([]);
  const [activeKey, setActiveKey] = useState('inbox');
  const [config, setConfig] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [compose, setCompose] = useState(null);
  const [composeBusy, setComposeBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [railCompact, setRailCompact] = useState(false);
  const draftDebounceRef = useRef(null);
  const moreRef = useRef(null);

  const showOk = (m) => { setInfo(m); setError(''); setTimeout(() => setInfo(''), 4000); };
  const showErr = (m) => { setError(m); setInfo(''); };

  // Close the "Más" menu when clicking outside it.
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [moreOpen]);

  const loadConfig = useCallback(async () => {
    try {
      const r = await apiCall('/api/admin/email/config');
      setConfig(r);
    } catch (e) {
      setConfig({ ok: false, smtp_configured: false, imap_configured: false, message: e?.message });
    }
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const r = await apiCall('/api/admin/email/folders');
      setFolders(r.folders || []);
    } catch (e) {
      showErr(e?.message || 'No se pudo cargar carpetas');
    }
  }, []);

  const loadDrafts = useCallback(async () => {
    try {
      const r = await apiCall('/api/admin/email/drafts');
      setDrafts(r.drafts || []);
    } catch {
      setDrafts([]);
    }
  }, []);

  const loadMessages = useCallback(async (key, q) => {
    if (key === 'drafts') {
      await loadDrafts();
      setMessages([]);
      setSelected(null);
      return;
    }
    setLoadingList(true);
    setError('');
    try {
      const params = new URLSearchParams({ folder: key, limit: '50' });
      if (q) params.set('q', q);
      const r = await apiCall(`/api/admin/email/messages?${params.toString()}`);
      setMessages(r.messages || []);
    } catch (e) {
      showErr(e?.message || 'No se pudieron cargar los mensajes');
      setMessages([]);
    } finally {
      setLoadingList(false);
    }
  }, [loadDrafts]);

  useEffect(() => {
    loadConfig();
    loadFolders();
    loadDrafts();
  }, [loadConfig, loadFolders, loadDrafts]);

  useEffect(() => {
    loadMessages(activeKey, '');
    setSelected(null);
    setShowDetails(false);
  }, [activeKey, loadMessages]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    loadMessages(activeKey, search);
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadFolders(), loadMessages(activeKey, search), loadDrafts()]);
    setTimeout(() => setRefreshing(false), 400);
  };

  const openMessage = async (m) => {
    setLoadingMsg(true);
    setError('');
    setShowDetails(false);
    try {
      const r = await apiCall(`/api/admin/email/messages/${m.uid}?folder=${encodeURIComponent(activeKey)}`);
      setSelected(r.message);
      setMessages((curr) => curr.map((x) => x.uid === m.uid ? { ...x, seen: true } : x));
    } catch (e) {
      showErr(e?.message || 'No se pudo abrir el mensaje');
    } finally {
      setLoadingMsg(false);
    }
  };

  const toggleStar = async (m, e) => {
    e?.stopPropagation();
    const next = !m.starred;
    setMessages((curr) => curr.map((x) => x.uid === m.uid ? { ...x, starred: next } : x));
    try {
      await apiCall(`/api/admin/email/messages/${m.uid}/flag`, {
        method: 'POST',
        body: JSON.stringify({
          folder: activeKey,
          add: next ? ['\\Flagged'] : [],
          remove: next ? [] : ['\\Flagged'],
        }),
      });
    } catch (e) {
      setMessages((curr) => curr.map((x) => x.uid === m.uid ? { ...x, starred: !next } : x));
      showErr(e?.message || 'No se pudo marcar como destacado');
    }
  };

  const markUnread = async () => {
    if (!selected) return;
    setMoreOpen(false);
    try {
      await apiCall(`/api/admin/email/messages/${selected.uid}/flag`, {
        method: 'POST',
        body: JSON.stringify({ folder: activeKey, remove: ['\\Seen'] }),
      });
      setMessages((curr) => curr.map((x) => x.uid === selected.uid ? { ...x, seen: false } : x));
      showOk('Marcado como no leído.');
    } catch (e) {
      showErr(e?.message || 'Error');
    }
  };

  const moveTo = async (target) => {
    if (!selected) return;
    setMoreOpen(false);
    try {
      await apiCall(`/api/admin/email/messages/${selected.uid}/move`, {
        method: 'POST',
        body: JSON.stringify({ from: activeKey, to: target }),
      });
      setMessages((curr) => curr.filter((x) => x.uid !== selected.uid));
      setSelected(null);
      const labelMap = { spam: 'spam', trash: 'la papelera', inbox: 'bandeja de entrada' };
      showOk(`Mensaje movido a ${labelMap[target] || target}.`);
      loadFolders();
    } catch (e) {
      showErr(e?.message || 'No se pudo mover');
    }
  };

  const openCompose = (preset = {}) => {
    setCompose({
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      text: '',
      ccShown: false,
      bccShown: false,
      draftId: null,
      replyTo: null,
      replyFolder: null,
      ...preset,
    });
    setDraftSavedAt(null);
  };

  const closeCompose = () => {
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    setCompose(null);
    setDraftSavedAt(null);
  };

  const openReply = (mode = 'reply') => {
    if (!selected) return;
    const fromAddr = selected.from?.[0]?.address || '';
    const toAddrs = mode === 'replyAll'
      ? [
          ...(selected.replyTo?.length ? selected.replyTo : selected.from || []),
          ...(selected.to || []),
          ...(selected.cc || []),
        ].map((a) => a.address).filter(Boolean).filter((a, i, arr) => arr.indexOf(a) === i).join(', ')
      : fromAddr;
    const subj = selected.subject || '';
    const subject = mode === 'forward'
      ? (subj.toLowerCase().startsWith('fwd:') ? subj : `Fwd: ${subj}`)
      : (subj.toLowerCase().startsWith('re:') ? subj : `Re: ${subj}`);
    openCompose({
      to: mode === 'forward' ? '' : toAddrs,
      subject,
      text: quoteForReply(selected),
      replyTo: selected.uid,
      replyFolder: activeKey,
    });
  };

  const openDraft = (draft) => {
    openCompose({
      to: draft.to_addr || '',
      cc: draft.cc_addr || '',
      bcc: draft.bcc_addr || '',
      subject: draft.subject || '',
      text: draft.body_text || '',
      ccShown: Boolean(draft.cc_addr),
      bccShown: Boolean(draft.bcc_addr),
      draftId: draft.id,
      replyTo: draft.in_reply_to || null,
      replyFolder: draft.reply_folder || null,
    });
  };

  const scheduleDraftSave = (next) => {
    setDraftSavedAt('typing');
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => saveDraft(next), 1200);
  };

  const saveDraft = async (snapshot) => {
    const c = snapshot || compose;
    if (!c) return;
    if (!c.to && !c.subject && !c.text && !c.cc && !c.bcc) return;
    setDraftBusy(true);
    try {
      if (c.draftId) {
        const r = await apiCall(`/api/admin/email/drafts/${c.draftId}`, {
          method: 'PATCH',
          body: JSON.stringify({ to: c.to, cc: c.cc, bcc: c.bcc, subject: c.subject, text: c.text }),
        });
        if (r.ok) setDraftSavedAt(new Date());
      } else {
        const r = await apiCall('/api/admin/email/drafts', {
          method: 'POST',
          body: JSON.stringify({
            to: c.to, cc: c.cc, bcc: c.bcc, subject: c.subject, text: c.text,
            in_reply_to: c.replyTo, reply_folder: c.replyFolder,
          }),
        });
        if (r.ok && r.draft) {
          setCompose((cur) => cur ? { ...cur, draftId: r.draft.id } : cur);
          setDraftSavedAt(new Date());
        } else if (r.message) {
          showErr(r.message);
        }
      }
      loadDrafts();
    } catch {
      /* silent */
    } finally {
      setDraftBusy(false);
    }
  };

  const updateCompose = (patch) => {
    setCompose((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...patch };
      scheduleDraftSave(next);
      return next;
    });
  };

  const sendNow = async () => {
    if (!compose) return;
    if (!compose.to.trim()) { showErr('Falta el destinatario (Para).'); return; }
    setComposeBusy(true);
    setError('');
    try {
      const r = await apiCall('/api/admin/email/send', {
        method: 'POST',
        body: JSON.stringify({
          to: compose.to,
          cc: compose.cc,
          bcc: compose.bcc,
          subject: compose.subject,
          text: compose.text,
          draft_id: compose.draftId || undefined,
        }),
      });
      showOk(`Enviado a ${r.sentTo}.`);
      closeCompose();
      loadDrafts();
      if (activeKey === 'sent') loadMessages('sent', search);
    } catch (e) {
      showErr(e?.message || 'No se pudo enviar');
    } finally {
      setComposeBusy(false);
    }
  };

  const discardDraft = async () => {
    if (!compose) return;
    if (compose.draftId) {
      try {
        await apiCall(`/api/admin/email/drafts/${compose.draftId}`, { method: 'DELETE' });
        loadDrafts();
      } catch { /* swallow */ }
    }
    closeCompose();
  };

  const deleteDraftRow = async (d, e) => {
    e?.stopPropagation();
    if (!window.confirm('¿Eliminar este borrador?')) return;
    try {
      await apiCall(`/api/admin/email/drafts/${d.id}`, { method: 'DELETE' });
      loadDrafts();
    } catch (err) {
      showErr(err?.message || 'Error');
    }
  };

  const folderCounts = useMemo(() => {
    const map = new Map();
    for (const f of folders) {
      if (f.key) map.set(f.key, f.unread ?? 0);
    }
    return map;
  }, [folders]);

  const visibleRows = activeKey === 'drafts'
    ? drafts.map((d) => ({
        uid: `draft-${d.id}`,
        id: d.id,
        kind: 'draft',
        from: [{ name: 'Borrador', address: '' }],
        subject: d.subject || '(sin asunto)',
        date: d.updated_at || d.created_at,
        seen: true,
        starred: false,
        toPreview: d.to_addr,
        draft: d,
      }))
    : messages.map((m) => ({ ...m, kind: 'mail' }));

  const activeFolder = FOLDER_META.find((f) => f.key === activeKey);
  const needSetup = config && config.ok && !config.imap_configured && !config.smtp_configured;

  return (
    <>
      <style>{STYLES}</style>

      {needSetup ? (
        <div className="em-setup-bar">
          <strong>Configura las credenciales de correo:</strong>{' '}
          define <code>SMTP_HOST</code> / <code>SMTP_USER</code> / <code>SMTP_PASS</code> en el servidor.
          IMAP reusa las mismas credenciales por defecto.
        </div>
      ) : null}
      {error ? <div className="em-banner err"><strong>Error:</strong> {error}</div> : null}
      {info ? <div className="em-banner ok"><strong>OK:</strong> {info}</div> : null}

      <div className="em-shell">
        <div className={`em-app${railCompact ? ' rail-compact' : ''}`}>
        {/* Folder rail */}
        <aside className="em-rail">
          <button type="button" className="em-compose-btn" onClick={() => openCompose()} title="Componer">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span className="lbl">Componer</span>
          </button>

          {FOLDER_META.map((f) => {
            const count = f.key === 'drafts' ? drafts.length : (folderCounts.get(f.key) || 0);
            return (
              <button
                key={f.key}
                type="button"
                className={`em-rail-item${activeKey === f.key ? ' active' : ''}`}
                onClick={() => setActiveKey(f.key)}
                title={f.label}
              >
                <FolderIcon kind={f.icon} />
                <span className="lbl">{f.label}</span>
                {count ? <span className="count">{count}</span> : null}
              </button>
            );
          })}

          <button
            type="button"
            className="em-rail-toggle"
            onClick={() => setRailCompact((c) => !c)}
            title={railCompact ? 'Expandir' : 'Contraer'}
            aria-label={railCompact ? 'Expandir' : 'Contraer'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: railCompact ? 'rotate(180deg)' : 'none' }}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </aside>

        {/* Main split */}
        <section className={`em-main${selected ? ' reader-open' : ''}`}>
          {/* List */}
          <div className="em-list-pane">
            <form className="em-list-toolbar" onSubmit={onSearchSubmit}>
              <input
                className="em-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={activeKey === 'drafts' ? 'Búsqueda no aplica a borradores' : 'Buscar en este buzón…'}
                disabled={activeKey === 'drafts'}
              />
              <button
                type="button"
                className={`em-icon-btn${refreshing ? ' spinning' : ''}`}
                onClick={refreshAll}
                title="Actualizar"
                aria-label="Actualizar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            </form>

            <div className="em-list-head">
              <span>{activeFolder?.label || 'Bandeja'}</span>
              <em>{visibleRows.length} {visibleRows.length === 1 ? 'mensaje' : 'mensajes'}</em>
            </div>

            <ul className="em-list">
              {loadingList ? (
                <li className="em-empty">Cargando…</li>
              ) : visibleRows.length === 0 ? (
                <li className="em-empty">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                  </svg>
                  <div>Esta carpeta está vacía.</div>
                </li>
              ) : visibleRows.map((m) => {
                const isActive = selected && selected.uid === m.uid;
                return (
                  <li
                    key={m.uid}
                    className={`em-row${!m.seen ? ' unread' : ''}${isActive ? ' active' : ''}`}
                    onClick={() => m.kind === 'draft' ? openDraft(m.draft) : openMessage(m)}
                  >
                    <span className="em-row-av">{initials(fromLine(m.from), m.from?.[0]?.address)}</span>
                    <div className="em-row-body">
                      <div className="em-row-from">
                        {m.kind === 'draft'
                          ? <>Borrador → <span style={{ color: 'var(--em)' }}>{m.toPreview || '(sin destinatario)'}</span></>
                          : fromLine(m.from)}
                      </div>
                      <div className="em-row-subject">{m.subject}</div>
                    </div>
                    <div className="em-row-meta">
                      <span className="em-row-date">{fmtRowDate(m.date)}</span>
                      {m.kind === 'mail' ? (
                        <button
                          type="button"
                          className={`em-row-star${m.starred ? ' on' : ''}`}
                          onClick={(e) => toggleStar(m, e)}
                          title={m.starred ? 'Quitar destacado' : 'Destacar'}
                          aria-label="Destacar"
                        >★</button>
                      ) : (
                        <button
                          type="button"
                          className="em-row-trash-btn"
                          onClick={(e) => deleteDraftRow(m.draft, e)}
                          title="Eliminar borrador"
                          aria-label="Eliminar"
                        >✕</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Reader */}
          <div className="em-reader-pane">
            {!selected ? (
              <div className="em-reader-empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M4 4h16v16H4z M4 4l8 8 8-8" />
                </svg>
                <div>Selecciona un mensaje para leerlo.</div>
              </div>
            ) : loadingMsg ? (
              <div className="em-reader-empty">Cargando mensaje…</div>
            ) : (
              <>
                <div className="em-reader-toolbar">
                  <button
                    type="button"
                    className="em-back-btn"
                    onClick={() => setSelected(null)}
                    title="Volver a la lista"
                    aria-label="Volver"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  </button>

                  <button type="button" className="em-act" onClick={() => openReply('reply')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                    <span className="lbl">Responder</span>
                  </button>
                  <button type="button" className="em-act" onClick={() => openReply('replyAll')} title="Responder a todos">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg>
                    <span className="lbl">Todos</span>
                  </button>
                  <button type="button" className="em-act" onClick={() => openReply('forward')} title="Reenviar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                    <span className="lbl">Reenviar</span>
                  </button>

                  <span className="em-act-spacer" />

                  <div className="em-act-menu-wrap" ref={moreRef}>
                    <button
                      type="button"
                      className="em-act"
                      onClick={() => setMoreOpen((o) => !o)}
                      aria-haspopup="menu"
                      aria-expanded={moreOpen}
                      title="Más acciones"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                      <span className="lbl">Más</span>
                    </button>

                    {moreOpen ? (
                      <div className="em-act-menu" role="menu">
                        <button type="button" onClick={markUnread}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16v16H4z M4 4l8 8 8-8"/></svg>
                          Marcar como no leído
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleStar(selected, e); setMoreOpen(false); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={selected.starred ? '#facc15' : 'none'} stroke="currentColor" strokeWidth="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          {selected.starred ? 'Quitar destacado' : 'Destacar'}
                        </button>
                        <hr />
                        {activeKey !== 'spam' ? (
                          <button type="button" onClick={() => moveTo('spam')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            Mover a spam
                          </button>
                        ) : (
                          <button type="button" onClick={() => moveTo('inbox')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                            No es spam
                          </button>
                        )}
                        {activeKey !== 'trash' ? (
                          <button type="button" className="danger" onClick={() => moveTo('trash')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                            Eliminar
                          </button>
                        ) : (
                          <button type="button" onClick={() => moveTo('inbox')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="3 4 3 12 11 12"/></svg>
                            Restaurar a la bandeja
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="em-act"
                    onClick={() => setSelected(null)}
                    title="Cerrar"
                    aria-label="Cerrar"
                    style={{ padding: '7px 10px' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                <div className="em-reader-head">
                  <h2>{selected.subject}</h2>
                  <div className="em-from-row">
                    <span className="em-from-av">{initials(fromLine(selected.from), selected.from?.[0]?.address)}</span>
                    <div className="em-from-meta">
                      <span className="name">{fromLine(selected.from)}</span>
                      <span className="addr">{selected.from?.[0]?.address || ''}</span>
                    </div>
                    <span className="em-from-date">{fmtFull(selected.date)}</span>
                  </div>

                  {(selected.to?.length || selected.cc?.length) ? (
                    <>
                      <button
                        type="button"
                        className={`em-details-toggle${showDetails ? ' open' : ''}`}
                        onClick={() => setShowDetails((d) => !d)}
                      >
                        {showDetails ? 'Ocultar detalles' : 'Mostrar detalles'}
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                      {showDetails ? (
                        <div className="em-recipients">
                          {selected.to?.length ? <div className="row"><b>Para</b><span>{addressList(selected.to)}</span></div> : null}
                          {selected.cc?.length ? <div className="row"><b>Cc</b><span>{addressList(selected.cc)}</span></div> : null}
                          {selected.replyTo?.length ? <div className="row"><b>Responder a</b><span>{addressList(selected.replyTo)}</span></div> : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div className="em-reader-body">
                  {selected.html ? (
                    <iframe
                      className="em-reader-iframe"
                      title={selected.subject || 'mensaje'}
                      srcDoc={selected.html}
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="em-reader-plain">{selected.text || '(sin contenido)'}</div>
                  )}
                </div>

                {selected.attachments?.length ? (
                  <div className="em-attachments">
                    <h4>Adjuntos · {selected.attachments.length}</h4>
                    <div className="em-att-list">
                      {selected.attachments.map((a, i) => (
                        <div key={i} className="em-att">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                          {a.filename}
                          <small>{Math.round((a.size || 0) / 1024)} KB</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
        </div>
      </div>

      {/* Compose modal */}
      {compose ? (
        <div className="em-modal-overlay" onClick={closeCompose}>
          <div className="em-compose" onClick={(e) => e.stopPropagation()}>
            <div className="em-compose-head">
              <h3>
                {compose.replyTo ? 'Responder' : 'Nuevo mensaje'}
                <span className={`em-draft-flag${draftSavedAt === 'typing' ? ' saving' : draftSavedAt instanceof Date ? ' saved' : ''}`}>
                  {draftSavedAt === 'typing' ? '● escribiendo'
                    : draftSavedAt instanceof Date ? `guardado · ${fmtRowDate(draftSavedAt.toISOString())}`
                    : compose.draftId ? 'borrador' : 'nuevo'}
                </span>
              </h3>
              <button type="button" className="em-compose-x" onClick={closeCompose} title="Cerrar" aria-label="Cerrar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="em-compose-body">
              <div className="em-field">
                <label>Para</label>
                <input
                  type="email"
                  value={compose.to}
                  onChange={(e) => updateCompose({ to: e.target.value })}
                  placeholder="destinatario@ejemplo.com — separa varios con coma"
                  autoFocus
                />
                <div className="em-field-extra">
                  <button type="button" className={`em-cc-toggle${compose.ccShown ? ' on' : ''}`} onClick={() => updateCompose({ ccShown: !compose.ccShown })}>Cc</button>
                  <button type="button" className={`em-cc-toggle${compose.bccShown ? ' on' : ''}`} onClick={() => updateCompose({ bccShown: !compose.bccShown })}>Cco</button>
                </div>
              </div>

              {compose.ccShown ? (
                <div className="em-field">
                  <label>Cc</label>
                  <input
                    type="email"
                    value={compose.cc}
                    onChange={(e) => updateCompose({ cc: e.target.value })}
                    placeholder="copia@ejemplo.com"
                  />
                </div>
              ) : null}

              {compose.bccShown ? (
                <div className="em-field">
                  <label>Cco</label>
                  <input
                    type="email"
                    value={compose.bcc}
                    onChange={(e) => updateCompose({ bcc: e.target.value })}
                    placeholder="copia-oculta@ejemplo.com"
                  />
                </div>
              ) : null}

              <div className="em-field">
                <label>Asunto</label>
                <input
                  type="text"
                  value={compose.subject}
                  onChange={(e) => updateCompose({ subject: e.target.value })}
                  placeholder="Asunto del mensaje"
                />
              </div>

              <textarea
                className="em-body-input"
                value={compose.text}
                onChange={(e) => updateCompose({ text: e.target.value })}
                placeholder="Escribe tu mensaje…"
              />
            </div>

            <div className="em-compose-foot">
              <button
                type="button"
                className="em-send-btn"
                onClick={sendNow}
                disabled={composeBusy || !compose.to.trim()}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                {composeBusy ? 'Enviando…' : 'Enviar'}
              </button>
              <button
                type="button"
                className="em-foot-ghost"
                onClick={() => saveDraft()}
                disabled={draftBusy}
              >
                {draftBusy ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button
                type="button"
                className="em-foot-ghost danger"
                onClick={discardDraft}
              >
                Descartar
              </button>
              <span className="em-foot-status">
                {compose.draftId ? `#${compose.draftId.slice(0, 8)}` : '—'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
