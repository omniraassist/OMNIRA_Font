import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiCall } from '../api/client.js';

/**
 * Full email client for the admin Correos panel. Three-pane Gmail-style
 * layout: folder rail (left), envelope list (middle), reader (right). The
 * folder rail flexes to a top tab strip on narrow screens; the reader slides
 * over the list as a modal on mobile.
 *
 * Read/sent/move/flag all hit IMAP via /api/admin/email/* — see emailInbox.js
 * on the server. Drafts persist to Supabase so a page reload never loses
 * half-typed mail.
 */
const STYLES = `
  :root {
    --em-bg: var(--surf);
    --em-bg2: var(--surf2);
    --em-line: var(--border);
    --em-line-em: var(--border-em);
    --em-em: var(--em);
    --em-text: var(--text);
    --em-soft: var(--soft);
    --em-muted: var(--muted);
  }

  .em-wrap {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 14px;
    height: calc(100dvh - 130px);
    min-height: 560px;
  }

  /* ── Left rail ─────────────────────────────────────────── */
  .em-rail {
    background: linear-gradient(180deg, var(--em-bg2) 0%, var(--em-bg) 100%);
    border: 1px solid var(--em-line);
    border-radius: var(--r-md);
    padding: 14px 10px;
    display: flex; flex-direction: column; gap: 6px;
    overflow-y: auto;
  }
  .em-compose-btn {
    display: flex; align-items: center; gap: 10px;
    background: linear-gradient(135deg, var(--em-em) 0%, var(--em2) 100%);
    color: #04201a; font-weight: 800; font-size: 13.5px;
    border: 0; border-radius: 12px;
    padding: 12px 14px; cursor: pointer;
    margin-bottom: 10px;
    transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
  }
  .em-compose-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(0,229,160,0.35); }
  .em-compose-btn svg { flex-shrink: 0; }

  .em-rail-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 11px;
    border-radius: 10px;
    color: var(--em-soft);
    background: transparent;
    border: 0; cursor: pointer;
    font-size: 13.5px; font-weight: 600;
    text-align: left;
    transition: background .15s ease, color .15s ease;
    width: 100%;
  }
  .em-rail-item:hover { background: rgba(255,255,255,0.04); color: var(--em-text); }
  .em-rail-item.active {
    background: rgba(0,229,160,0.10);
    color: var(--em-em);
    border: 1px solid rgba(0,229,160,0.22);
  }
  .em-rail-item .count {
    margin-left: auto;
    font-size: 11px; font-weight: 700;
    background: rgba(255,255,255,0.06);
    color: var(--em-soft);
    padding: 2px 7px; border-radius: 999px;
  }
  .em-rail-item.active .count { background: rgba(0,229,160,0.18); color: var(--em-em); }
  .em-rail-item svg { flex-shrink: 0; }

  /* ── Main pane: split list + reader ───────────────────── */
  .em-main {
    display: grid;
    grid-template-columns: minmax(320px, 380px) 1fr;
    gap: 14px;
    min-width: 0;
  }

  /* List */
  .em-list-pane {
    background: linear-gradient(180deg, var(--em-bg2) 0%, var(--em-bg) 100%);
    border: 1px solid var(--em-line);
    border-radius: var(--r-md);
    display: flex; flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
  .em-list-toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 12px;
    border-bottom: 1px solid var(--em-line);
    flex-wrap: wrap;
  }
  .em-search {
    flex: 1; min-width: 0;
    background: rgba(0,0,0,0.30); border: 1px solid var(--em-line);
    border-radius: 10px; padding: 8px 12px;
    color: var(--em-text); font-size: 13px;
  }
  .em-search:focus { outline: none; border-color: var(--em-em); }
  .em-refresh-btn {
    background: rgba(255,255,255,0.04); border: 1px solid var(--em-line);
    color: var(--em-soft); border-radius: 10px;
    width: 34px; height: 34px; cursor: pointer; font-size: 15px;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .em-refresh-btn:hover { color: var(--em-text); border-color: rgba(255,255,255,0.18); }
  .em-refresh-btn.spinning { animation: em-spin 0.8s linear infinite; }
  @keyframes em-spin { to { transform: rotate(360deg); } }

  .em-list {
    flex: 1; overflow-y: auto;
    list-style: none; margin: 0; padding: 0;
  }
  .em-row {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    gap: 8px;
    align-items: flex-start;
    padding: 12px 14px;
    border-bottom: 1px solid var(--em-line);
    cursor: pointer;
    transition: background .15s ease;
  }
  .em-row:hover { background: rgba(255,255,255,0.025); }
  .em-row.active { background: rgba(0,229,160,0.06); border-left: 3px solid var(--em-em); padding-left: 11px; }
  .em-row.unread .em-row-from, .em-row.unread .em-row-subject { font-weight: 800; color: var(--em-text); }
  .em-row-dot {
    width: 8px; height: 8px; margin-top: 6px;
    border-radius: 50%;
    background: var(--em-em);
    opacity: 0;
  }
  .em-row.unread .em-row-dot { opacity: 1; box-shadow: 0 0 8px rgba(0,229,160,0.6); }
  .em-row-from { font-size: 13px; color: var(--em-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .em-row-subject { font-size: 13px; color: var(--em-soft); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .em-row-date { font-size: 11px; color: var(--em-muted); white-space: nowrap; font-variant-numeric: tabular-nums; padding-top: 2px; }
  .em-row-star {
    background: transparent; border: 0; padding: 0; cursor: pointer;
    color: var(--em-muted); font-size: 14px;
    line-height: 1;
  }
  .em-row-star.on { color: #facc15; }
  .em-row-star:hover { transform: scale(1.15); }

  .em-empty { padding: 40px 20px; text-align: center; color: var(--em-muted); font-size: 13.5px; }

  /* Reader */
  .em-reader-pane {
    background: linear-gradient(180deg, var(--em-bg2) 0%, var(--em-bg) 100%);
    border: 1px solid var(--em-line);
    border-radius: var(--r-md);
    display: flex; flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
  .em-reader-empty {
    flex: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: var(--em-muted); font-size: 14px;
    text-align: center; padding: 30px;
  }
  .em-reader-empty svg { opacity: 0.4; margin-bottom: 14px; }
  .em-reader-head {
    padding: 16px 20px;
    border-bottom: 1px solid var(--em-line);
    background: rgba(0,0,0,0.18);
  }
  .em-reader-head h2 {
    margin: 0 0 10px;
    font-family: var(--font-display);
    font-size: 18px;
    color: var(--em-text);
    line-height: 1.35;
  }
  .em-from-row {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 6px;
  }
  .em-from-av {
    width: 38px; height: 38px; border-radius: 50%;
    background: linear-gradient(135deg, rgba(0,229,160,0.25), rgba(96,165,250,0.15));
    border: 1px solid var(--em-line-em);
    color: var(--em-em); font-weight: 700; font-size: 14px;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .em-from-meta { min-width: 0; flex: 1; }
  .em-from-meta strong { display: block; color: var(--em-text); font-size: 13.5px; }
  .em-from-meta small { display: block; color: var(--em-muted); font-size: 11.5px; margin-top: 1px; word-break: break-all; }
  .em-date-pill { font-size: 11.5px; color: var(--em-muted); white-space: nowrap; }

  .em-recipients {
    font-size: 11.5px; color: var(--em-muted);
    margin-top: 4px;
    word-break: break-word;
  }
  .em-recipients b { color: var(--em-soft); font-weight: 600; margin-right: 3px; }

  .em-reader-acts {
    display: flex; gap: 8px; padding: 10px 20px;
    border-bottom: 1px solid var(--em-line);
    background: rgba(0,0,0,0.10);
    flex-wrap: wrap;
  }
  .em-act-btn {
    background: rgba(255,255,255,0.04); border: 1px solid var(--em-line);
    color: var(--em-soft); border-radius: 8px;
    padding: 7px 12px; cursor: pointer; font-size: 12.5px; font-weight: 600;
    display: inline-flex; align-items: center; gap: 6px;
    transition: all .15s ease;
  }
  .em-act-btn:hover { color: var(--em-em); border-color: var(--em-line-em); background: rgba(0,229,160,0.06); }
  .em-act-btn.danger:hover { color: #fca5a5; border-color: rgba(239,68,68,0.30); background: rgba(239,68,68,0.06); }
  .em-act-btn:disabled { opacity: .5; cursor: not-allowed; }

  .em-reader-body {
    flex: 1; overflow-y: auto;
    padding: 0;
  }
  .em-reader-iframe { width: 100%; height: 100%; border: 0; background: #fff; }
  .em-reader-plain {
    padding: 22px 24px;
    color: var(--em-text);
    font-size: 14px; line-height: 1.7;
    white-space: pre-wrap; word-wrap: break-word;
  }

  .em-attachments {
    padding: 12px 20px;
    border-top: 1px solid var(--em-line);
    background: rgba(0,0,0,0.18);
  }
  .em-attachments h4 {
    margin: 0 0 8px;
    font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--em-muted);
  }
  .em-att-list { display: flex; gap: 8px; flex-wrap: wrap; }
  .em-att {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--em-line);
    border-radius: 8px; padding: 8px 12px;
    font-size: 12px; color: var(--em-soft);
  }
  .em-att small { color: var(--em-muted); }

  /* Banners */
  .em-banner { padding: 10px 14px; border-radius: 10px; font-size: 12.5px; margin-bottom: 10px; }
  .em-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .em-banner.ok { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }
  .em-banner.warn { background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.30); color: #fde68a; }

  /* Compose modal */
  .em-modal-overlay {
    position: fixed; inset: 0; z-index: 2000;
    background: rgba(2,6,12,0.78);
    backdrop-filter: blur(6px);
    display: flex; align-items: flex-end; justify-content: center;
    padding: 0;
  }
  .em-compose {
    width: min(680px, 100vw);
    max-height: 92dvh;
    background: linear-gradient(180deg, var(--em-bg2) 0%, var(--em-bg) 100%);
    border: 1px solid var(--em-line-em);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -20px 60px rgba(0,0,0,0.6);
    display: flex; flex-direction: column;
    overflow: hidden;
    animation: em-rise .3s cubic-bezier(.4,0,.2,1);
  }
  @keyframes em-rise { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .em-compose-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px;
    background: rgba(0,0,0,0.30);
    border-bottom: 1px solid var(--em-line);
  }
  .em-compose-head h3 {
    margin: 0;
    font-family: var(--font-display); font-size: 15px; color: var(--em-text);
    display: flex; align-items: center; gap: 10px;
  }
  .em-draft-flag {
    font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
    font-weight: 700; color: var(--em-muted);
    background: rgba(255,255,255,0.04);
    padding: 3px 8px; border-radius: 999px;
  }
  .em-draft-flag.saving { color: var(--em-em); background: rgba(0,229,160,0.10); }
  .em-compose-x {
    background: transparent; border: 0; color: var(--em-soft);
    cursor: pointer; padding: 4px;
    border-radius: 6px;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .em-compose-x:hover { color: var(--em-text); background: rgba(255,255,255,0.06); }

  .em-compose-body {
    padding: 0;
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column;
  }
  .em-field {
    display: flex; align-items: flex-start; gap: 10px;
    border-bottom: 1px solid var(--em-line);
    padding: 12px 18px;
  }
  .em-field label {
    width: 50px; flex-shrink: 0;
    font-size: 11.5px; font-weight: 700;
    color: var(--em-muted); text-transform: uppercase; letter-spacing: .04em;
    padding-top: 6px;
  }
  .em-field input, .em-field textarea {
    flex: 1; min-width: 0;
    background: transparent; border: 0;
    color: var(--em-text); font-size: 13.5px;
    padding: 5px 0;
    outline: none;
    font-family: inherit;
    resize: none;
  }
  .em-field input::placeholder, .em-field textarea::placeholder { color: var(--em-muted); }
  .em-field-extra {
    display: flex; align-items: center; gap: 4px;
    margin-left: auto; padding-top: 4px;
  }
  .em-cc-toggle {
    background: transparent; border: 0;
    color: var(--em-soft); cursor: pointer;
    font-size: 11.5px; font-weight: 700;
    padding: 4px 8px; border-radius: 6px;
  }
  .em-cc-toggle:hover { color: var(--em-em); background: rgba(0,229,160,0.06); }
  .em-cc-toggle.on { color: var(--em-em); }

  .em-body-input {
    width: 100%;
    min-height: 200px;
    padding: 18px;
    background: transparent;
    border: 0;
    color: var(--em-text);
    font-size: 14px;
    line-height: 1.6;
    outline: none;
    resize: none;
    font-family: inherit;
    flex: 1;
  }
  .em-body-input::placeholder { color: var(--em-muted); }

  .em-compose-foot {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 18px;
    background: rgba(0,0,0,0.20);
    border-top: 1px solid var(--em-line);
    flex-wrap: wrap;
  }
  .em-send-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, var(--em-em) 0%, var(--em2) 100%);
    color: #04201a; font-weight: 800; font-size: 13.5px;
    border: 0; border-radius: 10px;
    padding: 10px 22px;
    cursor: pointer;
    transition: filter .15s ease, transform .15s ease;
  }
  .em-send-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.08); }
  .em-send-btn:disabled { opacity: .5; cursor: not-allowed; }
  .em-foot-ghost {
    background: transparent; border: 1px solid var(--em-line);
    color: var(--em-soft); border-radius: 10px;
    padding: 10px 16px; cursor: pointer; font-size: 12.5px; font-weight: 600;
  }
  .em-foot-ghost:hover { color: var(--em-text); border-color: rgba(255,255,255,0.18); }
  .em-foot-ghost.danger:hover { color: #fca5a5; border-color: rgba(239,68,68,0.30); }
  .em-foot-status { margin-left: auto; font-size: 12px; color: var(--em-muted); }

  /* Setup hint when IMAP/SMTP aren't ready */
  .em-setup {
    padding: 30px 24px;
    background: linear-gradient(180deg, var(--em-bg2) 0%, var(--em-bg) 100%);
    border: 1px solid var(--em-line);
    border-radius: var(--r-md);
    text-align: center;
  }
  .em-setup h3 { margin: 0 0 8px; font-family: var(--font-display); color: var(--em-text); }
  .em-setup p { color: var(--em-soft); margin: 0 0 14px; }
  .em-setup code { background: rgba(0,0,0,0.30); padding: 2px 7px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--em-em); }

  /* Responsive */
  @media (max-width: 1100px) {
    .em-wrap { grid-template-columns: 1fr; height: auto; min-height: 0; }
    .em-rail { flex-direction: row; overflow-x: auto; overflow-y: hidden; padding: 10px; }
    .em-rail-item { flex-shrink: 0; }
    .em-compose-btn { flex-shrink: 0; }
    .em-main { grid-template-columns: 1fr; }
    .em-main.reader-open .em-list-pane { display: none; }
    .em-main:not(.reader-open) .em-reader-pane { display: none; }
  }
`;

const FOLDER_META = [
  { key: 'inbox',   label: 'Bandeja de entrada', icon: 'inbox' },
  { key: 'starred', label: 'Destacados',         icon: 'star' },
  { key: 'sent',    label: 'Enviados',           icon: 'send' },
  { key: 'drafts',  label: 'Borradores',         icon: 'draft' },
  { key: 'spam',    label: 'Spam',               icon: 'spam' },
  { key: 'trash',   label: 'Papelera',           icon: 'trash' },
];

function FolderIcon({ kind }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
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
  return src
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
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
  const [selected, setSelected] = useState(null); // { uid, ...full message }
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [compose, setCompose] = useState(null); // null | { to, cc, bcc, subject, text, draftId, replyTo, replyFolder, ccShown, bccShown }
  const [composeBusy, setComposeBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const draftDebounceRef = useRef(null);

  const showOk = (m) => { setInfo(m); setError(''); setTimeout(() => setInfo(''), 4000); };
  const showErr = (m) => { setError(m); setInfo(''); };

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
    try {
      const r = await apiCall(`/api/admin/email/messages/${m.uid}?folder=${encodeURIComponent(activeKey)}`);
      setSelected(r.message);
      // mark as read locally — server already did the \Seen flag
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
    try {
      await apiCall(`/api/admin/email/messages/${selected.uid}/move`, {
        method: 'POST',
        body: JSON.stringify({ from: activeKey, to: target }),
      });
      setMessages((curr) => curr.filter((x) => x.uid !== selected.uid));
      setSelected(null);
      const labelMap = { spam: 'spam', trash: 'la papelera', inbox: 'bandeja de entrada' };
      showOk(`Mensaje movido a ${labelMap[target] || target}.`);
      // refresh folder counts
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
    // Don't spam Supabase with totally empty drafts.
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
    } catch (e) {
      // Silent fail for auto-save; only loud on explicit "save draft"
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

  const deleteDraftRow = async (d) => {
    if (!window.confirm('¿Eliminar este borrador?')) return;
    try {
      await apiCall(`/api/admin/email/drafts/${d.id}`, { method: 'DELETE' });
      loadDrafts();
    } catch (e) {
      showErr(e?.message || 'Error');
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

  const needSetup = config && config.ok && !config.imap_configured && !config.smtp_configured;

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>Correos</h1>
        <p>
          Cliente de correo conectado a la cuenta de Omnira: lee la bandeja de entrada, responde, reenvía y compone
          mensajes con Para / CC / CCO. Los mensajes enviados se guardan en la carpeta <strong>Enviados</strong> de
          tu servidor IMAP y los borradores se sincronizan automáticamente mientras escribes.
        </p>
      </header>

      {needSetup ? (
        <div className="em-setup">
          <h3>Configura las credenciales de correo</h3>
          <p>
            Para activar este panel, define las variables <code>SMTP_HOST</code> / <code>SMTP_USER</code> /{' '}
            <code>SMTP_PASS</code> en el servidor. IMAP reusa las mismas credenciales por defecto; si tu host IMAP
            es distinto, añade <code>IMAP_HOST</code> e <code>IMAP_PORT</code>.
          </p>
        </div>
      ) : null}

      {error ? <div className="em-banner err"><strong>Error:</strong> {error}</div> : null}
      {info ? <div className="em-banner ok"><strong>OK:</strong> {info}</div> : null}

      <div className="em-wrap">
        {/* Folder rail */}
        <aside className="em-rail">
          <button type="button" className="em-compose-btn" onClick={() => openCompose()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Componer
          </button>
          {FOLDER_META.map((f) => {
            const count = f.key === 'drafts' ? drafts.length : (folderCounts.get(f.key) || 0);
            return (
              <button
                key={f.key}
                type="button"
                className={`em-rail-item${activeKey === f.key ? ' active' : ''}`}
                onClick={() => setActiveKey(f.key)}
              >
                <FolderIcon kind={f.icon} />
                <span>{f.label}</span>
                {count ? <span className="count">{count}</span> : null}
              </button>
            );
          })}
        </aside>

        {/* Main split */}
        <section className={`em-main${selected ? ' reader-open' : ''}`}>
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
                className={`em-refresh-btn${refreshing ? ' spinning' : ''}`}
                onClick={refreshAll}
                title="Actualizar"
              >↻</button>
            </form>
            <ul className="em-list">
              {loadingList ? <li className="em-empty">Cargando…</li>
                : visibleRows.length === 0 ? <li className="em-empty">Esta carpeta está vacía.</li>
                : visibleRows.map((m) => {
                  const isActive = selected && selected.uid === m.uid;
                  return (
                    <li
                      key={m.uid}
                      className={`em-row${!m.seen ? ' unread' : ''}${isActive ? ' active' : ''}`}
                      onClick={() => m.kind === 'draft' ? openDraft(m.draft) : openMessage(m)}
                    >
                      <span className="em-row-dot" />
                      <div style={{ minWidth: 0 }}>
                        <div className="em-row-from">
                          {m.kind === 'draft'
                            ? <>Borrador → <span style={{ color: 'var(--em-em)' }}>{m.toPreview || '(sin destinatario)'}</span></>
                            : fromLine(m.from)}
                        </div>
                        <div className="em-row-subject">{m.subject}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span className="em-row-date">{fmtRowDate(m.date)}</span>
                        {m.kind === 'mail' ? (
                          <button
                            type="button"
                            className={`em-row-star${m.starred ? ' on' : ''}`}
                            onClick={(e) => toggleStar(m, e)}
                            title={m.starred ? 'Quitar destacado' : 'Destacar'}
                          >★</button>
                        ) : (
                          <button
                            type="button"
                            className="em-row-star"
                            onClick={(e) => { e.stopPropagation(); deleteDraftRow(m.draft); }}
                            title="Eliminar borrador"
                            style={{ color: '#fca5a5' }}
                          >✕</button>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>

          <div className="em-reader-pane">
            {!selected ? (
              <div className="em-reader-empty">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M4 4h16v16H4z M4 4l8 8 8-8" />
                </svg>
                <div>Selecciona un mensaje para leerlo.</div>
              </div>
            ) : loadingMsg ? (
              <div className="em-reader-empty">Cargando…</div>
            ) : (
              <>
                <div className="em-reader-head">
                  <h2>{selected.subject}</h2>
                  <div className="em-from-row">
                    <span className="em-from-av">{initials(fromLine(selected.from), selected.from?.[0]?.address)}</span>
                    <div className="em-from-meta">
                      <strong>{fromLine(selected.from)}</strong>
                      <small>{selected.from?.[0]?.address || ''}</small>
                    </div>
                    <span className="em-date-pill">{fmtFull(selected.date)}</span>
                  </div>
                  {selected.to?.length ? <div className="em-recipients"><b>Para:</b> {addressList(selected.to)}</div> : null}
                  {selected.cc?.length ? <div className="em-recipients"><b>Cc:</b> {addressList(selected.cc)}</div> : null}
                </div>

                <div className="em-reader-acts">
                  <button type="button" className="em-act-btn" onClick={() => openReply('reply')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                    Responder
                  </button>
                  <button type="button" className="em-act-btn" onClick={() => openReply('replyAll')}>Responder a todos</button>
                  <button type="button" className="em-act-btn" onClick={() => openReply('forward')}>Reenviar</button>
                  <button type="button" className="em-act-btn" onClick={markUnread}>Marcar no leído</button>
                  {activeKey !== 'spam' ? <button type="button" className="em-act-btn" onClick={() => moveTo('spam')}>Mover a spam</button> : null}
                  {activeKey !== 'trash' ? (
                    <button type="button" className="em-act-btn danger" onClick={() => moveTo('trash')}>Eliminar</button>
                  ) : (
                    <button type="button" className="em-act-btn" onClick={() => moveTo('inbox')}>Restaurar</button>
                  )}
                  <span style={{ marginLeft: 'auto' }} />
                  <button type="button" className="em-act-btn" onClick={() => setSelected(null)} title="Cerrar">✕</button>
                </div>

                {selected.html
                  ? <iframe className="em-reader-iframe" title={selected.subject || 'mensaje'} srcDoc={selected.html} sandbox="allow-same-origin" />
                  : <div className="em-reader-plain">{selected.text || '(sin contenido)'}</div>}

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

      {/* Compose modal */}
      {compose ? (
        <div className="em-modal-overlay" onClick={closeCompose}>
          <div className="em-compose" onClick={(e) => e.stopPropagation()}>
            <div className="em-compose-head">
              <h3>
                {compose.replyTo ? 'Responder' : 'Nuevo mensaje'}
                <span className={`em-draft-flag${draftSavedAt === 'typing' ? ' saving' : ''}`}>
                  {draftSavedAt === 'typing' ? '● escribiendo'
                    : draftSavedAt instanceof Date ? `borrador guardado · ${fmtRowDate(draftSavedAt.toISOString())}`
                    : compose.draftId ? 'borrador' : '—'}
                </span>
              </h3>
              <button type="button" className="em-compose-x" onClick={closeCompose} title="Cerrar">
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
                {compose.draftId ? `Borrador #${compose.draftId.slice(0, 8)}` : 'Borrador no guardado'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
