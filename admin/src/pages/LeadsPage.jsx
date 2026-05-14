import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

const STATUS_OPTIONS = [
  { value: 'all',       label: 'Todos',       color: 'all' },
  { value: 'new',       label: 'Nuevos',      color: 'green' },
  { value: 'contacted', label: 'Contactados', color: 'blue' },
  { value: 'qualified', label: 'Cualificados',color: 'amber' },
  { value: 'converted', label: 'Convertidos', color: 'em' },
  { value: 'lost',      label: 'Perdidos',    color: 'grey' },
];

const STATUS_FOR_DETAIL = STATUS_OPTIONS.filter((s) => s.value !== 'all');

const STYLES = `
  .l-page { display: flex; flex-direction: column; gap: 18px; }

  /* Hero header */
  .l-hero {
    background:
      radial-gradient(80% 60% at 0% 0%, rgba(0,229,160,0.10), transparent 60%),
      radial-gradient(60% 50% at 100% 0%, rgba(96,165,250,0.10), transparent 65%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 22px 24px;
    animation: l-rise .35s ease-out both;
  }
  @keyframes l-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .l-hero h1 { margin: 0; font-family: var(--font-display); font-size: 22px; color: var(--text); line-height: 1.2; }
  .l-hero h1 .grad { background: linear-gradient(90deg, var(--em) 0%, #93c5fd 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .l-hero p { margin: 6px 0 0; font-size: 13px; color: var(--soft); line-height: 1.6; }

  /* KPI strip */
  .l-kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }
  .l-kpi {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px 16px;
    transition: border-color .15s ease, transform .15s ease;
    animation: l-rise .35s ease-out both;
  }
  .l-kpi:nth-child(1) { animation-delay: .02s; }
  .l-kpi:nth-child(2) { animation-delay: .05s; }
  .l-kpi:nth-child(3) { animation-delay: .08s; }
  .l-kpi:nth-child(4) { animation-delay: .11s; }
  .l-kpi:nth-child(5) { animation-delay: .14s; }
  .l-kpi:nth-child(6) { animation-delay: .17s; }
  .l-kpi:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.12); }
  .l-kpi.em { border-color: var(--border-em); }
  .l-kpi .l-kpi-label { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .l-kpi .dot { width: 7px; height: 7px; border-radius: 999px; }
  .dot.green { background: #00e5a0; }
  .dot.blue { background: #60a5fa; }
  .dot.amber { background: #fbbf24; }
  .dot.em { background: var(--em); }
  .dot.grey { background: var(--soft); }
  .dot.all { background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%); }
  .l-kpi .l-kpi-value { font-family: var(--font-display); font-size: 26px; font-weight: 700; color: var(--text); margin-top: 4px; line-height: 1.1; }

  /* Toolbar */
  .l-toolbar {
    display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
    padding: 14px 16px;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
  }
  .l-search {
    flex: 1; min-width: 220px;
    display: flex; align-items: center; gap: 8px;
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 12px;
    transition: border-color .15s ease;
  }
  .l-search:focus-within { border-color: var(--em); }
  .l-search input {
    flex: 1; min-width: 0;
    background: transparent;
    border: 0;
    color: var(--text);
    font-size: 13px;
    outline: none;
  }
  .l-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .l-chip {
    padding: 7px 14px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--soft);
    font-size: 12px; font-weight: 600;
    cursor: pointer;
    transition: all .15s ease;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .l-chip:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }
  .l-chip.active { background: rgba(0,229,160,0.10); border-color: var(--border-em); color: var(--em); }
  .l-chip .count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; padding: 1px 6px;
    background: rgba(255,255,255,0.06);
    border-radius: 999px;
  }
  .l-chip.active .count { background: rgba(0,229,160,0.20); color: var(--em); }
  .l-refresh {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
    width: 36px; height: 36px;
    border-radius: 10px;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all .15s ease;
  }
  .l-refresh:hover { color: var(--em); border-color: var(--border-em); }
  .l-refresh.spin { animation: l-spin .8s linear infinite; }
  @keyframes l-spin { to { transform: rotate(360deg); } }

  /* Lead cards grid */
  .l-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }

  .l-card {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 18px;
    display: flex; flex-direction: column; gap: 12px;
    cursor: pointer;
    transition: all .2s ease;
    animation: l-rise .35s ease-out both;
    position: relative;
    overflow: hidden;
  }
  .l-card::after {
    content: ''; position: absolute; right: -40px; top: -40px;
    width: 140px; height: 140px;
    background: radial-gradient(closest-side, rgba(0,229,160,0.06), transparent 70%);
    pointer-events: none;
  }
  .l-card:hover { border-color: var(--border-em); transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,229,160,0.06); }
  .l-card.open { border-color: var(--em); box-shadow: 0 0 0 1px rgba(0,229,160,0.20), 0 16px 36px rgba(0,229,160,0.10); }

  .l-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .l-card-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .l-card-av {
    width: 44px; height: 44px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    color: #00120a;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 700; font-size: 15px;
    flex-shrink: 0;
    box-shadow: 0 6px 16px rgba(0,229,160,0.20);
  }
  .l-card-meta { min-width: 0; }
  .l-card-name { font-weight: 700; color: var(--text); font-size: 14px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .l-card-sub { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
  .l-status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
  .l-status-badge.green  { background: rgba(0,229,160,0.10); color: var(--em); }
  .l-status-badge.blue   { background: rgba(96,165,250,0.14); color: #93c5fd; }
  .l-status-badge.amber  { background: rgba(251,191,36,0.12); color: #fde68a; }
  .l-status-badge.em     { background: rgba(0,229,160,0.18); color: var(--em); }
  .l-status-badge.grey   { background: rgba(148,163,184,0.12); color: var(--soft); }

  .l-card-info { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 12px; }
  .l-card-info div { color: var(--soft); }
  .l-card-info div strong { color: var(--text); font-family: 'JetBrains Mono', monospace; font-weight: 500; margin-left: 4px; }

  .l-card-conf { display: flex; align-items: center; gap: 8px; }
  .l-conf-track { flex: 1; height: 6px; background: rgba(255,255,255,0.05); border-radius: 999px; overflow: hidden; }
  .l-conf-fill { height: 100%; border-radius: 999px; transition: width .5s ease; }
  .l-conf-fill.high { background: linear-gradient(90deg, var(--em), #34d399); }
  .l-conf-fill.med  { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
  .l-conf-fill.low  { background: rgba(148,163,184,0.45); }
  .l-conf-pct { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); min-width: 36px; text-align: right; }

  .l-card-foot { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; padding-top: 8px; border-top: 1px solid var(--border); }
  .l-card-foot .open-cta { color: var(--em); font-weight: 700; }

  /* Detail panel (slides in below the active card row visually, full-width) */
  .l-detail {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-md);
    padding: 20px;
    box-shadow: 0 16px 40px rgba(0,229,160,0.06);
    animation: l-rise .25s ease-out both;
  }
  .l-detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; }
  .l-detail-title { font-family: var(--font-display); font-size: 18px; color: var(--text); margin: 0; }
  .l-detail-sub { font-size: 12px; color: var(--soft); font-family: 'JetBrains Mono', monospace; margin-top: 4px; }
  .l-close { background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--soft); width: 34px; height: 34px; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  .l-close:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }

  .l-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
  .l-field { display: flex; flex-direction: column; gap: 6px; }
  .l-field label { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .l-field input, .l-field select, .l-field textarea {
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color .15s ease;
  }
  .l-field input:focus, .l-field select:focus, .l-field textarea:focus { border-color: var(--em); }
  .l-field textarea { min-height: 80px; resize: vertical; line-height: 1.5; }
  .l-field input.mono { font-family: 'JetBrains Mono', monospace; }

  .l-detail-actions { display: flex; gap: 8px; margin-top: 14px; }
  .l-btn {
    background: linear-gradient(180deg, var(--em) 0%, var(--em2) 100%);
    color: #00120a; font-weight: 700;
    border: 0; border-radius: 10px;
    padding: 10px 20px;
    cursor: pointer;
    font-size: 13px;
    transition: filter .15s ease, transform .15s ease;
  }
  .l-btn:disabled { filter: grayscale(.6) brightness(.7); cursor: not-allowed; }
  .l-btn:not(:disabled):hover { filter: brightness(1.08); transform: translateY(-1px); }

  /* Conversation */
  .l-thread {
    margin-top: 18px;
    background: rgba(0,0,0,0.25);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    max-height: 420px;
    overflow-y: auto;
    display: flex; flex-direction: column; gap: 8px;
  }
  .l-msg { max-width: 78%; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border); animation: l-rise .25s ease-out both; }
  .l-msg.out { align-self: flex-end; background: rgba(0,229,160,0.10); border-color: rgba(0,229,160,0.20); }
  .l-msg.in  { align-self: flex-start; background: rgba(255,255,255,0.04); }
  .l-msg-who { font-size: 10px; color: var(--muted); margin-bottom: 3px; }
  .l-msg-body { white-space: pre-wrap; font-size: 13px; color: var(--text); line-height: 1.5; }

  .l-empty {
    padding: 36px 20px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px dashed rgba(255,255,255,0.08);
    border-radius: var(--r-md);
  }
  .l-empty strong { color: var(--soft); display: block; margin-bottom: 6px; font-family: var(--font-display); font-size: 16px; }

  .l-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; }
  .l-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .l-banner.ok { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }

  /* Mobile */
  @media (max-width: 560px) {
    .l-hero { padding: 18px; }
    .l-hero h1 { font-size: 18px; }
    .l-toolbar { padding: 12px; }
    .l-card { padding: 14px; }
    .l-detail { padding: 16px; }
  }
`;

const STATUS_COLOR = {
  new: 'green',
  contacted: 'blue',
  qualified: 'amber',
  converted: 'em',
  lost: 'grey',
};

const STATUS_LABEL_ES = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Cualificado',
  converted: 'Convertido',
  lost: 'Perdido',
};

function getStatusColor(status) {
  return STATUS_COLOR[status] || 'grey';
}

function getStatusLabel(status) {
  return STATUS_LABEL_ES[status] || status || '—';
}

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'ahora mismo';
  if (diff < 3600_000) return `hace ${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `hace ${Math.round(diff / 3600_000)} h`;
  return new Date(iso).toLocaleDateString('es-ES');
}

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-ES'); } catch { return '—'; }
}

function ConfBar({ value }) {
  const pct = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
  const cls = pct >= 70 ? 'high' : pct >= 40 ? 'med' : 'low';
  return (
    <div className="l-card-conf">
      <div className="l-conf-track">
        <div className={`l-conf-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="l-conf-pct">{pct}%</span>
    </div>
  );
}

export function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [statusDraft, setStatusDraft] = useState('new');
  const [notesDraft, setNotesDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (search) params.set('search', search);
      const res = await apiCall(`/api/admin/leads?${params.toString()}`);
      setLeads(res.leads || []);
    } catch (e) {
      setLeads([]);
      setError(e?.message || 'No se pudieron cargar los leads');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (lead) => {
    setSelectedId(lead.id);
    setSelected(lead);
    setStatusDraft(lead.status || 'new');
    setNotesDraft(lead.notes || '');
    setMessages([]);
    setInfo('');
    try {
      const res = await apiCall(`/api/admin/leads/${lead.id}`);
      setSelected(res.lead || lead);
      setMessages(res.messages || []);
    } catch {
      /* keep summary */
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setSelected(null);
    setMessages([]);
  };

  const saveLead = async () => {
    if (!selected) return;
    setSaving(true);
    setError(''); setInfo('');
    try {
      const res = await apiCall(`/api/admin/leads/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusDraft, notes: notesDraft }),
      });
      setSelected(res.lead || selected);
      setInfo('Guardado.');
      await load();
    } catch (e) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  // Status counts (this view)
  const stats = useMemo(() => {
    const acc = { all: leads.length, new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };
    for (const l of leads) if (acc[l.status] !== undefined) acc[l.status] += 1;
    return acc;
  }, [leads]);

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head" style={{ marginBottom: 0, padding: 0, height: 0, overflow: 'hidden' }} aria-hidden>
        <h1>Leads</h1>
      </header>

      <div className="l-page">
        {/* Hero */}
        <section className="l-hero">
          <h1>Leads de <span className="grad">WhatsApp</span></h1>
          <p>
            Cada prospecto con el que ha hablado el agente, capturado automáticamente por el extractor de OpenAI
            y actualizado con cada nuevo mensaje. Gestiona el embudo desde{' '}
            <strong>nuevo → contactado → cualificado → convertido</strong>.
          </p>
        </section>

        {/* KPI strip */}
        <div className="l-kpis">
          <article className="l-kpi em">
            <div className="l-kpi-label"><span className="dot all" /> Total</div>
            <div className="l-kpi-value">{stats.all}</div>
          </article>
          <article className="l-kpi">
            <div className="l-kpi-label"><span className="dot green" /> Nuevos</div>
            <div className="l-kpi-value">{stats.new}</div>
          </article>
          <article className="l-kpi">
            <div className="l-kpi-label"><span className="dot blue" /> Contactados</div>
            <div className="l-kpi-value">{stats.contacted}</div>
          </article>
          <article className="l-kpi">
            <div className="l-kpi-label"><span className="dot amber" /> Cualificados</div>
            <div className="l-kpi-value">{stats.qualified}</div>
          </article>
          <article className="l-kpi em">
            <div className="l-kpi-label"><span className="dot em" /> Convertidos</div>
            <div className="l-kpi-value">{stats.converted}</div>
          </article>
          <article className="l-kpi">
            <div className="l-kpi-label"><span className="dot grey" /> Perdidos</div>
            <div className="l-kpi-value">{stats.lost}</div>
          </article>
        </div>

        {/* Toolbar */}
        <div className="l-toolbar">
          <label className="l-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ color: 'var(--muted)' }}>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Buscar por nombre, email, teléfono, número o notas…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="l-chips">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`l-chip${status === s.value ? ' active' : ''}`}
                onClick={() => setStatus(s.value)}
              >
                <span className={`dot ${s.color}`} />
                {s.label}
                <span className="count">{s.value === 'all' ? stats.all : stats[s.value] ?? 0}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`l-refresh${loading ? ' spin' : ''}`}
            onClick={load}
            disabled={loading}
            title="Actualizar"
            aria-label="Actualizar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M3 12a9 9 0 0 1 15.5-6.3M21 4v6h-6M21 12a9 9 0 0 1-15.5 6.3M3 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {error ? <div className="l-banner err"><strong>Error:</strong> {error}</div> : null}
        {info ? <div className="l-banner ok"><strong>OK:</strong> {info}</div> : null}

        {/* Detail panel */}
        {selectedId && selected ? (
          <section className="l-detail">
            <div className="l-detail-head">
              <div>
                <h2 className="l-detail-title">{selected.name || `+${selected.wa_from}`}</h2>
                <div className="l-detail-sub">
                  +{selected.wa_from}
                  {selected.intent ? ` · ${selected.intent}` : ''}
                  {selected.language ? ` · ${selected.language}` : ''}
                </div>
              </div>
              <button type="button" className="l-close" onClick={closeDetail} aria-label="Cerrar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="l-form">
              <div className="l-field">
                <label>Email</label>
                <input className="mono" value={selected.email || ''} readOnly />
              </div>
              <div className="l-field">
                <label>Teléfono extra</label>
                <input className="mono" value={selected.phone || ''} readOnly />
              </div>
              <div className="l-field">
                <label>Estado</label>
                <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
                  {STATUS_FOR_DETAIL.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="l-field">
                <label>Confianza</label>
                <ConfBar value={selected.confidence} />
              </div>
              <div className="l-field" style={{ gridColumn: '1 / -1' }}>
                <label>Notas</label>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Notas internas sobre este lead"
                />
              </div>
            </div>

            <div className="l-detail-actions">
              <button type="button" className="l-btn" onClick={saveLead} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>

            <h3 style={{ marginTop: 22, marginBottom: 8, fontSize: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Conversación
            </h3>
            <div className="l-thread">
              {messages.length === 0 ? (
                <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Aún no hay mensajes guardados.</div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`l-msg ${m.direction === 'outbound' ? 'out' : 'in'}`}>
                    <div className="l-msg-who">
                      {m.direction === 'outbound' ? 'Agente Omnira' : `+${selected.wa_from}`} · {formatDate(m.created_at)}
                    </div>
                    <div className="l-msg-body">{m.body}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {/* Lead cards */}
        {leads.length === 0 && !loading ? (
          <div className="l-empty">
            <strong>Ningún lead coincide con los filtros actuales.</strong>
            Cuando alguien escriba al número de WhatsApp, los leads aparecerán aquí automáticamente.
          </div>
        ) : (
          <div className="l-grid">
            {leads.map((l) => {
              const isOpen = l.id === selectedId;
              const name = l.name || `+${l.wa_from}`;
              const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <article
                  key={l.id}
                  className={`l-card${isOpen ? ' open' : ''}`}
                  onClick={() => (isOpen ? closeDetail() : openDetail(l))}
                >
                  <div className="l-card-head">
                    <div className="l-card-id">
                      <div className="l-card-av">{initials}</div>
                      <div className="l-card-meta">
                        <div className="l-card-name">{name}</div>
                        <div className="l-card-sub">+{l.wa_from}</div>
                      </div>
                    </div>
                    <span className={`l-status-badge ${getStatusColor(l.status)}`}>{getStatusLabel(l.status)}</span>
                  </div>
                  <div className="l-card-info">
                    {l.email ? <div>email <strong>{l.email}</strong></div> : null}
                    {l.intent ? <div>intención <strong>{l.intent}</strong></div> : null}
                    {l.language ? <div>idioma <strong>{l.language}</strong></div> : null}
                    <div>msjs <strong>{l.message_count ?? 0}</strong></div>
                  </div>
                  <ConfBar value={l.confidence} />
                  <div className="l-card-foot">
                    <span>última actividad · {formatRelative(l.last_message_at)}</span>
                    <span className="open-cta">{isOpen ? '✕ Cerrar' : 'Abrir →'}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
