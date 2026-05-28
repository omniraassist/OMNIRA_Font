import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall } from '../api/client.js';
import { IconSearch } from './icons.jsx';

const LEAD_STATUS_ES = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Cualificado',
  converted: 'Convertido',
  lost: 'Perdido',
};

// ---------------------------------------------------------------------------
// Static page index. This is the spine of the search — admin can always jump
// to any screen even when the backend search is empty/slow.
// ---------------------------------------------------------------------------
const PAGES = [
  { path: '/',             title: 'Panel',                  kw: 'inicio resumen kpi metricas dashboard' },
  { path: '/analytics',    title: 'Analíticas',             kw: 'graficos estadisticas ingresos embudo charts' },
  { path: '/clients',      title: 'Suscriptores de pago',   kw: 'clientes usuarios suscriptores pagos paying' },
  { path: '/leads',        title: 'Leads de WhatsApp',      kw: 'leads embudo crm prospectos pipeline' },
  { path: '/chats',        title: 'Chats de WhatsApp',      kw: 'conversaciones mensajes hilos chats' },
  { path: '/notifications',title: 'Notificaciones',         kw: 'enviar difusion broadcast bandeja' },
  { path: '/sessions',     title: 'Administradores',        kw: 'equipo administradores acceso' },
  { path: '/pricing',      title: 'Precios',                kw: 'planes stripe precio paquetes' },
  { path: '/bot-config',   title: 'Cerebro del bot',        kw: 'prompt base de conocimiento ia openai sistema' },
  { path: '/whatsapp',     title: 'Configuración WhatsApp', kw: 'meta tokens webhook secretos verificar openai key' },
  { path: '/profile',      title: 'Mi perfil',              kw: 'cuenta contrasena avatar salir ajustes' },
];

const STYLES = `
  .gs-wrap {
    position: relative;
    flex: 1;
    max-width: 560px;
  }
  .gs-input-box {
    display: flex; align-items: center; gap: 10px;
    background: var(--surf2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 8px 12px;
    transition: border-color .15s ease, background .15s ease;
  }
  .gs-input-box.open, .gs-input-box:focus-within {
    border-color: var(--border-em);
    background: rgba(0,0,0,0.35);
  }
  .gs-input {
    flex: 1; min-width: 0;
    background: transparent;
    border: 0;
    color: var(--text);
    font-size: 13px;
    outline: none;
  }
  .gs-input::placeholder { color: var(--muted); }
  .gs-kbd {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--muted);
    padding: 3px 6px;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    border-radius: 6px;
    letter-spacing: .04em;
  }
  @media (max-width: 560px) { .gs-kbd { display: none; } }

  .gs-panel {
    position: absolute;
    left: 0; right: 0; top: calc(100% + 8px);
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow);
    overflow: hidden;
    z-index: 40;
    animation: gs-in .15s ease-out;
  }
  @keyframes gs-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

  .gs-section {
    padding: 8px 0;
  }
  .gs-section + .gs-section { border-top: 1px solid var(--border); }
  .gs-section-label {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px 6px;
    font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
    color: var(--muted);
  }
  .gs-section-label .count {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--muted);
    background: rgba(255,255,255,0.04); padding: 1px 6px; border-radius: 999px;
  }

  .gs-row {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: 10px; align-items: center;
    padding: 9px 14px;
    cursor: pointer;
    transition: background .12s ease;
    color: inherit;
    text-decoration: none;
  }
  .gs-row:hover, .gs-row.active { background: rgba(0,229,160,0.06); }
  .gs-row.active .gs-row-title { color: var(--em); }
  .gs-row-icon {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    color: var(--soft);
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .gs-row.active .gs-row-icon { background: rgba(0,229,160,0.10); color: var(--em); }
  .gs-row-title { font-size: 13px; color: var(--text); font-weight: 600; line-height: 1.2; }
  .gs-row-sub { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; line-height: 1.3; margin-top: 2px; }
  .gs-row-hint { font-size: 10px; color: var(--muted); }

  .gs-empty {
    padding: 24px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
  .gs-empty strong { color: var(--soft); }

  .gs-foot {
    padding: 8px 14px;
    border-top: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
    font-size: 11px; color: var(--muted);
  }
  .gs-foot span { display: inline-flex; align-items: center; gap: 6px; }

  .gs-loading {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(0,229,160,0.20);
    border-top-color: var(--em);
    border-radius: 999px;
    animation: gs-spin .8s linear infinite;
  }
  @keyframes gs-spin { to { transform: rotate(360deg); } }
`;

const PAGE_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" />
  </svg>
);
const USER_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" />
  </svg>
);
const LEAD_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M3 11a9 9 0 0 1 18 0v9H6a3 3 0 0 1-3-3v-6z" strokeLinejoin="round" />
    <circle cx="12" cy="9" r="1.5" fill="currentColor" />
  </svg>
);

const RECENT_KEY = 'omnira_admin_gs_recent';
const MAX_RECENT = 6;

function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecent(item) {
  try {
    const cur = loadRecent();
    const without = cur.filter((x) => x.path !== item.path);
    const next = [{ path: item.path, title: item.title, sub: item.sub || '' }, ...without].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function rankPages(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PAGES
    .map((p) => {
      const hay = `${p.title} ${p.kw}`.toLowerCase();
      let score = 0;
      if (p.title.toLowerCase().startsWith(q)) score += 100;
      else if (p.title.toLowerCase().includes(q)) score += 50;
      if (hay.includes(q)) score += 10;
      return { ...p, _score: score };
    })
    .filter((p) => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [customers, setCustomers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recent] = useState(() => loadRecent());

  // Cmd / Ctrl + K to focus, Esc anywhere to close
  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Click outside to close
  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Debounced live search for customers + leads
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setCustomers([]); setLeads([]); setLoading(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }
    const handle = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      Promise.all([
        apiCall(`/api/admin/users?search=${encodeURIComponent(q)}&status=all`, { signal: ctrl.signal })
          .then((r) => r.users || [])
          .catch(() => []),
        apiCall(`/api/admin/leads?search=${encodeURIComponent(q)}&limit=10`, { signal: ctrl.signal })
          .then((r) => r.leads || [])
          .catch(() => []),
      ]).then(([u, l]) => {
        if (ctrl.signal.aborted) return;
        setCustomers((u || []).slice(0, 5));
        setLeads((l || []).slice(0, 5));
      }).finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    }, 220);
    return () => clearTimeout(handle);
  }, [query]);

  const pageHits = useMemo(() => rankPages(query), [query]);

  // Flat list for keyboard nav
  const flat = useMemo(() => {
    if (!query.trim()) {
      // empty state: recent + all pages
      return [
        ...recent.map((r) => ({ kind: 'recent', ...r })),
        ...PAGES.map((p) => ({ kind: 'page', ...p })),
      ];
    }
    return [
      ...pageHits.map((p) => ({ kind: 'page', ...p })),
      ...customers.map((u) => ({ kind: 'customer', ...u })),
      ...leads.map((l) => ({ kind: 'lead', ...l })),
    ];
  }, [query, pageHits, customers, leads, recent]);

  useEffect(() => {
    setActive(0);
  }, [query, customers.length, leads.length]);

  const go = useCallback((item) => {
    if (!item) return;
    let path = item.path;
    let sub = '';
    if (item.kind === 'customer') {
      path = `/clients/${item.id}`;
      sub = item.email || '';
    } else if (item.kind === 'lead') {
      path = '/leads';
      sub = item.name || `+${item.wa_from}`;
    }
    pushRecent({ path, title: item.title || item.name || item.email || `+${item.wa_from}` || 'Abrir', sub });
    navigate(path);
    setOpen(false);
    setQuery('');
  }, [navigate]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  let cursor = -1;
  const next = () => (cursor += 1);

  return (
    <div className="gs-wrap" ref={wrapRef}>
      <style>{STYLES}</style>
      <div className={`gs-input-box${open ? ' open' : ''}`}>
        <IconSearch style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          className="gs-input"
          type="search"
          placeholder="Buscar páginas, clientes, leads… (Ctrl+K)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        {loading ? <span className="gs-loading" /> : <span className="gs-kbd">Ctrl K</span>}
      </div>

      {open ? (
        <div className="gs-panel" role="listbox">
          {/* Empty-state: recent + pages */}
          {!query.trim() ? (
            <>
              {recent.length > 0 ? (
                <div className="gs-section">
                  <div className="gs-section-label">Recientes <span className="count">{recent.length}</span></div>
                  {recent.map((r) => {
                    const i = next();
                    return (
                      <div
                        key={`r-${r.path}-${i}`}
                        className={`gs-row${i === active ? ' active' : ''}`}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go({ kind: 'page', path: r.path, title: r.title })}
                        role="option"
                        aria-selected={i === active}
                      >
                        <div className="gs-row-icon">{PAGE_ICON}</div>
                        <div>
                          <div className="gs-row-title">{r.title}</div>
                          {r.sub ? <div className="gs-row-sub">{r.sub}</div> : <div className="gs-row-sub">{r.path}</div>}
                        </div>
                        <div className="gs-row-hint">↵</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="gs-section">
                <div className="gs-section-label">Todas las páginas <span className="count">{PAGES.length}</span></div>
                {PAGES.map((p) => {
                  const i = next();
                  return (
                    <div
                      key={`p-${p.path}`}
                      className={`gs-row${i === active ? ' active' : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go({ kind: 'page', ...p })}
                      role="option"
                      aria-selected={i === active}
                    >
                      <div className="gs-row-icon">{PAGE_ICON}</div>
                      <div>
                        <div className="gs-row-title">{p.title}</div>
                        <div className="gs-row-sub">{p.path}</div>
                      </div>
                      <div className="gs-row-hint">↵</div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {pageHits.length > 0 ? (
                <div className="gs-section">
                  <div className="gs-section-label">Páginas <span className="count">{pageHits.length}</span></div>
                  {pageHits.map((p) => {
                    const i = next();
                    return (
                      <div
                        key={`p-${p.path}`}
                        className={`gs-row${i === active ? ' active' : ''}`}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go({ kind: 'page', ...p })}
                        role="option"
                        aria-selected={i === active}
                      >
                        <div className="gs-row-icon">{PAGE_ICON}</div>
                        <div>
                          <div className="gs-row-title">{p.title}</div>
                          <div className="gs-row-sub">{p.path}</div>
                        </div>
                        <div className="gs-row-hint">página</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {customers.length > 0 ? (
                <div className="gs-section">
                  <div className="gs-section-label">Clientes <span className="count">{customers.length}</span></div>
                  {customers.map((u) => {
                    const i = next();
                    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email.split('@')[0];
                    return (
                      <div
                        key={`u-${u.id}`}
                        className={`gs-row${i === active ? ' active' : ''}`}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go({ kind: 'customer', id: u.id, title: name, email: u.email })}
                        role="option"
                        aria-selected={i === active}
                      >
                        <div className="gs-row-icon">{USER_ICON}</div>
                        <div>
                          <div className="gs-row-title">{name}</div>
                          <div className="gs-row-sub">{u.email}{u.plan ? ` · ${u.plan}` : ''}</div>
                        </div>
                        <div className="gs-row-hint">{u.subscription_active ? 'pagando' : 'gratis'}</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {leads.length > 0 ? (
                <div className="gs-section">
                  <div className="gs-section-label">Leads de WhatsApp <span className="count">{leads.length}</span></div>
                  {leads.map((l) => {
                    const i = next();
                    const name = l.name || `+${l.wa_from}`;
                    return (
                      <div
                        key={`l-${l.id}`}
                        className={`gs-row${i === active ? ' active' : ''}`}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go({ kind: 'lead', id: l.id, title: name, name, wa_from: l.wa_from })}
                        role="option"
                        aria-selected={i === active}
                      >
                        <div className="gs-row-icon">{LEAD_ICON}</div>
                        <div>
                          <div className="gs-row-title">{name}</div>
                          <div className="gs-row-sub">+{l.wa_from}{l.email ? ` · ${l.email}` : ''}{l.intent ? ` · ${l.intent}` : ''}</div>
                        </div>
                        <div className="gs-row-hint">{LEAD_STATUS_ES[l.status] || l.status}</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {pageHits.length === 0 && customers.length === 0 && leads.length === 0 ? (
                <div className="gs-empty">
                  Sin resultados para <strong>"{query}"</strong>.
                  {loading ? <div style={{ marginTop: 6 }}>buscando…</div> : null}
                </div>
              ) : null}
            </>
          )}

          <div className="gs-foot">
            <span><span className="gs-kbd">↑↓</span> navegar · <span className="gs-kbd">↵</span> abrir · <span className="gs-kbd">Esc</span> cerrar</span>
            <span>Búsqueda global de Omnira</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
