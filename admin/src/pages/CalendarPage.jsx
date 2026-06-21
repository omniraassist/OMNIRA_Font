import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const STATUS_META = {
  pending:   { label: 'Pendiente',  color: 'amber' },
  confirmed: { label: 'Confirmado', color: 'green' },
  cancelled: { label: 'Cancelado',  color: 'red' },
};

const STATUS_OPTS = [
  { value: 'all',       label: 'Todos' },
  { value: 'pending',   label: 'Pendientes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'cancelled', label: 'Cancelados' },
];

const STYLES = `
  .cal-page { display: flex; flex-direction: column; gap: 18px; }

  /* Hero */
  .cal-hero {
    background:
      radial-gradient(80% 60% at 0% 0%, rgba(0,229,160,0.10), transparent 60%),
      radial-gradient(60% 50% at 100% 0%, rgba(96,165,250,0.10), transparent 65%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 22px 24px;
    animation: cal-rise .35s ease-out both;
  }
  @keyframes cal-rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  .cal-hero h1 { margin: 0; font-family: var(--font-display); font-size: 22px; color: var(--text); }
  .cal-hero h1 .grad { background: linear-gradient(90deg, var(--em) 0%, #93c5fd 100%); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .cal-hero p { margin: 6px 0 0; font-size: 13px; color: var(--soft); line-height: 1.6; }

  /* KPIs */
  .cal-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px,1fr)); gap: 10px; }
  .cal-kpi {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px 16px;
    animation: cal-rise .35s ease-out both;
    transition: border-color .15s ease, transform .15s ease;
  }
  .cal-kpi:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.12); }
  .cal-kpi.em { border-color: var(--border-em); }
  .cal-kpi .k-label { display:flex; align-items:center; gap:6px; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
  .cal-kpi .k-dot { width:7px; height:7px; border-radius:999px; flex-shrink:0; }
  .k-dot.amber { background: #fbbf24; }
  .k-dot.green { background: #00e5a0; }
  .k-dot.red   { background: #f87171; }
  .k-dot.all   { background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%); }
  .cal-kpi .k-val { font-family: var(--font-display); font-size: 28px; font-weight:700; color:var(--text); margin-top:4px; line-height:1.1; }

  /* Toolbar */
  .cal-toolbar {
    display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
    padding: 14px 16px;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
  }
  .cal-search {
    flex: 1; min-width: 200px;
    display: flex; align-items: center; gap: 8px;
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 12px;
    transition: border-color .15s ease;
  }
  .cal-search:focus-within { border-color: var(--em); }
  .cal-search input { flex:1; min-width:0; background:transparent; border:0; color:var(--text); font-size:13px; outline:none; }
  .cal-chips { display:flex; gap:6px; flex-wrap:wrap; }
  .cal-chip {
    padding: 7px 14px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--soft);
    font-size: 12px; font-weight: 600;
    cursor: pointer;
    transition: all .15s ease;
  }
  .cal-chip:hover { color:var(--text); border-color:rgba(255,255,255,0.18); }
  .cal-chip.active { background:rgba(0,229,160,0.10); border-color:var(--border-em); color:var(--em); }
  .cal-icon-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
    width: 36px; height: 36px;
    border-radius: 10px;
    display: inline-flex; align-items:center; justify-content:center;
    cursor: pointer; transition: all .15s ease;
    flex-shrink: 0;
  }
  .cal-icon-btn:hover { color:var(--em); border-color:var(--border-em); }
  .cal-icon-btn.spin { animation: cal-spin .8s linear infinite; }
  @keyframes cal-spin { to { transform:rotate(360deg); } }

  /* Main layout: calendar + sidebar */
  .cal-body { display: grid; grid-template-columns: 1fr 340px; gap: 14px; align-items: flex-start; }
  @media (max-width: 900px) { .cal-body { grid-template-columns: 1fr; } }

  /* Calendar card */
  .cal-card {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    overflow: hidden;
    animation: cal-rise .35s ease-out both;
  }
  .cal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .cal-month-label { font-family: var(--font-display); font-size: 16px; color: var(--text); }
  .cal-nav { display:flex; gap:6px; }
  .cal-nav-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
    width: 32px; height: 32px;
    border-radius: 8px;
    display: inline-flex; align-items:center; justify-content:center;
    cursor: pointer; transition: all .15s ease;
  }
  .cal-nav-btn:hover { color:var(--em); border-color:var(--border-em); }
  .cal-today-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--soft);
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px; font-weight: 600;
    cursor: pointer; transition: all .15s ease;
  }
  .cal-today-btn:hover { color:var(--em); border-color:var(--border-em); }

  .cal-grid { display: grid; grid-template-columns: repeat(7,1fr); }
  .cal-day-name {
    padding: 10px 0;
    text-align: center;
    font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  .cal-cell {
    min-height: 80px;
    padding: 8px 6px 6px;
    border-right: 1px solid rgba(255,255,255,0.04);
    border-bottom: 1px solid rgba(255,255,255,0.04);
    cursor: pointer;
    transition: background .15s ease;
    position: relative;
  }
  .cal-cell:nth-child(7n) { border-right: 0; }
  .cal-cell:hover { background: rgba(255,255,255,0.03); }
  .cal-cell.other-month .cal-date-num { color: var(--muted); opacity: .4; }
  .cal-cell.today { background: rgba(0,229,160,0.05); }
  .cal-cell.selected { background: rgba(0,229,160,0.08); }
  .cal-cell.today .cal-date-num { color: var(--em); font-weight: 700; }
  .cal-date-num {
    font-family: var(--font-display);
    font-size: 12px; color: var(--soft);
    line-height: 1;
    margin-bottom: 5px;
    display: inline-block;
    width: 22px; height: 22px;
    line-height: 22px;
    text-align: center;
    border-radius: 6px;
  }
  .cal-cell.today .cal-date-num {
    background: rgba(0,229,160,0.15);
    border: 1px solid var(--border-em);
  }
  .cal-cell.selected .cal-date-num {
    background: var(--em);
    color: #00120a;
    font-weight: 700;
  }
  .cal-dots { display:flex; flex-direction:column; gap:3px; }
  .cal-dot {
    font-size: 10px; font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 100%;
    display: block;
  }
  .cal-dot.amber { background: rgba(251,191,36,0.14); color: #fde68a; }
  .cal-dot.green { background: rgba(0,229,160,0.12); color: var(--em); }
  .cal-dot.red   { background: rgba(248,113,113,0.12); color: #fca5a5; }
  .cal-more { font-size: 10px; color: var(--muted); padding-left: 2px; margin-top: 2px; }

  /* Sidebar panel */
  .cal-side { display: flex; flex-direction: column; gap: 14px; }

  /* Day detail */
  .cal-day-detail {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-md);
    padding: 18px;
    animation: cal-rise .25s ease-out both;
  }
  .cal-day-title { font-family: var(--font-display); font-size: 14px; color: var(--em); margin:0 0 14px; }
  .cal-ev-list { display: flex; flex-direction: column; gap: 10px; }
  .cal-ev-item {
    background: rgba(0,0,0,0.25);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    cursor: pointer;
    transition: border-color .15s ease;
  }
  .cal-ev-item:hover { border-color: rgba(255,255,255,0.16); }
  .cal-ev-item.open { border-color: var(--em); }
  .cal-ev-name { font-weight: 700; color: var(--text); font-size: 13px; }
  .cal-ev-time { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
  .cal-ev-svc  { font-size: 11px; color: var(--soft); margin-top: 3px; }
  .cal-ev-badge {
    display: inline-flex; align-items:center; gap:4px;
    padding: 2px 8px; border-radius:999px;
    font-size: 10px; font-weight: 700; text-transform:uppercase; letter-spacing:.04em;
    float: right; margin-top: 2px;
  }
  .cal-ev-badge.amber { background:rgba(251,191,36,0.12); color:#fde68a; }
  .cal-ev-badge.green { background:rgba(0,229,160,0.12); color:var(--em); }
  .cal-ev-badge.red   { background:rgba(248,113,113,0.12); color:#fca5a5; }

  /* Upcoming */
  .cal-upcoming {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 18px;
    animation: cal-rise .35s ease-out both;
  }
  .cal-upcoming h3 { font-family:var(--font-display); font-size:13px; color:var(--text); margin:0 0 14px; text-transform:uppercase; letter-spacing:.04em; }
  .cal-up-empty { font-size:13px; color:var(--muted); text-align:center; padding:20px 0; }

  /* Event detail drawer */
  .cal-detail {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-md);
    padding: 18px;
    animation: cal-rise .25s ease-out both;
  }
  .cal-detail-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:16px; }
  .cal-detail-title { font-family:var(--font-display); font-size:16px; color:var(--text); margin:0; }
  .cal-detail-sub   { font-size:11px; color:var(--soft); font-family:'JetBrains Mono',monospace; margin-top:3px; }
  .cal-close {
    background:rgba(255,255,255,0.04); border:1px solid var(--border);
    color:var(--soft); width:32px; height:32px; border-radius:8px;
    cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
    flex-shrink:0;
  }
  .cal-close:hover { color:var(--text); }

  .cal-dform { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .cal-dfield { display:flex; flex-direction:column; gap:5px; }
  .cal-dfield.full { grid-column: 1 / -1; }
  .cal-dfield label { font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); }
  .cal-dfield input, .cal-dfield select, .cal-dfield textarea {
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 9px 11px;
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color .15s ease;
  }
  .cal-dfield input:focus, .cal-dfield select:focus, .cal-dfield textarea:focus { border-color: var(--em); }
  .cal-dfield textarea { min-height:70px; resize:vertical; line-height:1.5; }

  .cal-dactions { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
  .cal-btn {
    background: linear-gradient(180deg, var(--em) 0%, var(--em2) 100%);
    color: #00120a; font-weight:700;
    border:0; border-radius:9px;
    padding: 9px 18px;
    cursor: pointer; font-size:13px;
    transition: filter .15s ease, transform .15s ease;
  }
  .cal-btn:disabled { filter:grayscale(.6) brightness(.7); cursor:not-allowed; }
  .cal-btn:not(:disabled):hover { filter:brightness(1.08); transform:translateY(-1px); }
  .cal-btn.ghost {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
  }
  .cal-btn.ghost:hover { color:var(--text); border-color:rgba(255,255,255,0.18); filter:none; transform:none; }

  .cal-banner { padding:11px 14px; border-radius:10px; font-size:13px; margin-bottom:10px; }
  .cal-banner.err { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.30); color:#fecaca; }
  .cal-banner.ok  { background:rgba(34,197,94,0.08);  border:1px solid rgba(34,197,94,0.30); color:#bbf7d0; }

  .cal-empty {
    padding:40px 20px; text-align:center; color:var(--muted); font-size:13px;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px dashed rgba(255,255,255,0.08);
    border-radius: var(--r-md);
  }
  .cal-empty strong { color:var(--soft); display:block; margin-bottom:6px; font-family:var(--font-display); font-size:16px; }

  @media (max-width: 560px) {
    .cal-hero { padding:18px; }
    .cal-hero h1 { font-size:18px; }
    .cal-dform { grid-template-columns:1fr; }
    .cal-cell { min-height: 56px; }
  }
`;

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function fmtFull(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return '—'; }
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'amber' };
  return <span className={`cal-ev-badge ${m.color}`}>{m.label}</span>;
}

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const start = new Date(firstDay);
  start.setDate(start.getDate() - startDow);

  const days = [];
  const cur = new Date(start);
  while (days.length < 42) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function EventItem({ ev, onOpen, isOpen }) {
  const m = STATUS_META[ev.status] || { label: ev.status, color: 'amber' };
  return (
    <div className={`cal-ev-item${isOpen ? ' open' : ''}`} onClick={() => onOpen(ev)}>
      <StatusBadge status={ev.status} />
      <div className="cal-ev-name">{ev.name || '(sin nombre)'}</div>
      <div className="cal-ev-time">{fmtTime(ev.datetime)}{ev.end_at ? ` – ${fmtTime(ev.end_at)}` : ''}</div>
      {ev.service ? <div className="cal-ev-svc">{ev.service}</div> : null}
      {ev.customer_name ? <div className="cal-ev-svc" style={{ color: 'var(--muted)' }}>{ev.customer_name}</div> : null}
    </div>
  );
}

export function CalendarPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(isoDate(today));
  const [events, setEvents] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [openEv, setOpenEv] = useState(null);
  const [statusDraft, setStatusDraft] = useState('pending');
  const [notesDraft, setNotesDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ month: monthKey });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await apiCall(`/api/admin/events?${params}`);
      setEvents(res.events || []);
    } catch (e) {
      setError(e?.message || 'No se pudieron cargar los eventos');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [monthKey, statusFilter, search]);

  const loadUpcoming = useCallback(async () => {
    try {
      const res = await apiCall('/api/admin/events?upcoming=1&status=pending');
      setUpcoming(res.events || []);
    } catch { setUpcoming([]); }
  }, []);

  useEffect(() => { loadMonth(); }, [loadMonth]);
  useEffect(() => { loadUpcoming(); }, [loadUpcoming]);

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const e of events) {
      const day = e.datetime ? e.datetime.slice(0, 10) : null;
      if (!day) continue;
      if (!map[day]) map[day] = [];
      map[day].push(e);
    }
    return map;
  }, [events]);

  const dayEvents = useMemo(() => eventsByDay[selectedDay] || [], [eventsByDay, selectedDay]);

  const calDays = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const todayStr = isoDate(today);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(todayStr);
  };

  const openDetail = (ev) => {
    setOpenEv(ev);
    setStatusDraft(ev.status || 'pending');
    setNotesDraft(ev.notes || '');
    setInfo('');
    setError('');
  };
  const closeDetail = () => { setOpenEv(null); };

  const saveEvent = async () => {
    if (!openEv) return;
    setSaving(true);
    setError(''); setInfo('');
    try {
      await apiCall(`/api/admin/events/${openEv.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusDraft, notes: notesDraft }),
      });
      setInfo('Guardado correctamente.');
      await loadMonth();
      await loadUpcoming();
      setOpenEv((prev) => prev ? { ...prev, status: statusDraft, notes: notesDraft } : null);
    } catch (e) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const acc = { all: events.length, pending: 0, confirmed: 0, cancelled: 0 };
    for (const e of events) if (acc[e.status] !== undefined) acc[e.status] += 1;
    return acc;
  }, [events]);

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head" style={{ marginBottom: 0, padding: 0, height: 0, overflow: 'hidden' }} aria-hidden>
        <h1>Calendario</h1>
      </header>

      <div className="cal-page">
        {/* Hero */}
        <section className="cal-hero">
          <h1>Calendario de <span className="grad">llamadas</span></h1>
          <p>
            Visualiza todas las citas agendadas por tus clientes a través del bot o manualmente.
            Marca confirmadas, gestiona pendientes y filtra por mes o estado.
          </p>
        </section>

        {/* KPIs */}
        <div className="cal-kpis">
          <article className="cal-kpi em">
            <div className="k-label"><span className="k-dot all" /> Total este mes</div>
            <div className="k-val">{stats.all}</div>
          </article>
          <article className="cal-kpi">
            <div className="k-label"><span className="k-dot amber" /> Pendientes</div>
            <div className="k-val">{stats.pending}</div>
          </article>
          <article className="cal-kpi">
            <div className="k-label"><span className="k-dot green" /> Confirmadas</div>
            <div className="k-val">{stats.confirmed}</div>
          </article>
          <article className="cal-kpi">
            <div className="k-label"><span className="k-dot red" /> Canceladas</div>
            <div className="k-val">{stats.cancelled}</div>
          </article>
        </div>

        {/* Toolbar */}
        <div className="cal-toolbar">
          <label className="cal-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ color: 'var(--muted)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Buscar por cliente, servicio, teléfono…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="cal-chips">
            {STATUS_OPTS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`cal-chip${statusFilter === s.value ? ' active' : ''}`}
                onClick={() => setStatusFilter(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`cal-icon-btn${loading ? ' spin' : ''}`}
            onClick={() => { loadMonth(); loadUpcoming(); }}
            disabled={loading}
            title="Actualizar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M3 12a9 9 0 0 1 15.5-6.3M21 4v6h-6M21 12a9 9 0 0 1-15.5 6.3M3 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {error ? <div className="cal-banner err"><strong>Error:</strong> {error}</div> : null}
        {info  ? <div className="cal-banner ok"><strong>OK:</strong> {info}</div> : null}

        {/* Body: calendar + sidebar */}
        <div className="cal-body">
          {/* Calendar */}
          <div className="cal-card">
            <div className="cal-header">
              <span className="cal-month-label">{MONTHS_ES[viewMonth]} {viewYear}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="cal-today-btn" onClick={goToday}>Hoy</button>
                <div className="cal-nav">
                  <button type="button" className="cal-nav-btn" onClick={prevMonth} title="Mes anterior">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button type="button" className="cal-nav-btn" onClick={nextMonth} title="Mes siguiente">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="cal-grid">
              {DAYS_ES.map((d) => (
                <div key={d} className="cal-day-name">{d}</div>
              ))}
              {calDays.map((d) => {
                const key = isoDate(d);
                const isCurrentMonth = d.getMonth() === viewMonth;
                const isToday = key === todayStr;
                const isSelected = key === selectedDay;
                const dayEvs = eventsByDay[key] || [];
                const visible = dayEvs.slice(0, 3);
                const extra = dayEvs.length - visible.length;

                return (
                  <div
                    key={key}
                    className={[
                      'cal-cell',
                      !isCurrentMonth && 'other-month',
                      isToday && 'today',
                      isSelected && 'selected',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setSelectedDay(key)}
                  >
                    <span className="cal-date-num">{d.getDate()}</span>
                    <div className="cal-dots">
                      {visible.map((e) => {
                        const m = STATUS_META[e.status] || { color: 'amber' };
                        return (
                          <span key={e.id} className={`cal-dot ${m.color}`}>
                            {e.name || fmtTime(e.datetime)}
                          </span>
                        );
                      })}
                      {extra > 0 ? <span className="cal-more">+{extra} más</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="cal-side">
            {/* Detail of open event */}
            {openEv ? (
              <div className="cal-detail">
                <div className="cal-detail-head">
                  <div>
                    <h2 className="cal-detail-title">{openEv.name || '(sin nombre)'}</h2>
                    <div className="cal-detail-sub">{fmtFull(openEv.datetime)}</div>
                  </div>
                  <button type="button" className="cal-close" onClick={closeDetail}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                <div className="cal-dform">
                  {openEv.customer_name ? (
                    <div className="cal-dfield">
                      <label>Cliente</label>
                      <input value={openEv.customer_name} readOnly style={{ fontFamily: 'inherit' }} />
                    </div>
                  ) : null}
                  {openEv.customer_email ? (
                    <div className="cal-dfield">
                      <label>Email cliente</label>
                      <input value={openEv.customer_email} readOnly style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
                    </div>
                  ) : null}
                  {openEv.service ? (
                    <div className="cal-dfield">
                      <label>Servicio</label>
                      <input value={openEv.service} readOnly />
                    </div>
                  ) : null}
                  {openEv.phone ? (
                    <div className="cal-dfield">
                      <label>Teléfono</label>
                      <input value={openEv.phone} readOnly style={{ fontFamily: 'JetBrains Mono, monospace' }} />
                    </div>
                  ) : null}
                  <div className="cal-dfield">
                    <label>Hora inicio</label>
                    <input value={fmtFull(openEv.datetime)} readOnly />
                  </div>
                  {openEv.end_at ? (
                    <div className="cal-dfield">
                      <label>Hora fin</label>
                      <input value={fmtFull(openEv.end_at)} readOnly />
                    </div>
                  ) : null}
                  <div className="cal-dfield">
                    <label>Estado</label>
                    <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
                      <option value="pending">Pendiente</option>
                      <option value="confirmed">Confirmado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                  <div className="cal-dfield full">
                    <label>Notas internas</label>
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Notas sobre esta cita…"
                    />
                  </div>
                </div>

                {error ? <div className="cal-banner err" style={{ marginTop: 10 }}>{error}</div> : null}
                {info  ? <div className="cal-banner ok"  style={{ marginTop: 10 }}>{info}</div>  : null}

                <div className="cal-dactions">
                  <button type="button" className="cal-btn" onClick={saveEvent} disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button type="button" className="cal-btn ghost" onClick={closeDetail}>
                    Cerrar
                  </button>
                </div>
              </div>
            ) : null}

            {/* Day events */}
            <div className="cal-day-detail">
              <h3 className="cal-day-title">
                {fmtDateShort(selectedDay + 'T12:00:00')}
                <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8 }}>
                  · {dayEvents.length} cita{dayEvents.length !== 1 ? 's' : ''}
                </span>
              </h3>
              {dayEvents.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
                  Sin citas este día.
                </div>
              ) : (
                <div className="cal-ev-list">
                  {dayEvents.map((ev) => (
                    <EventItem
                      key={ev.id}
                      ev={ev}
                      onOpen={openDetail}
                      isOpen={openEv?.id === ev.id}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming pending reminders */}
            <div className="cal-upcoming">
              <h3>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ display:'inline', verticalAlign:'middle', marginRight:6, color:'var(--em)' }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" strokeLinecap="round" />
                </svg>
                Recordatorios pendientes
              </h3>
              {upcoming.length === 0 ? (
                <div className="cal-up-empty">No hay citas pendientes en los próximos 30 días.</div>
              ) : (
                <div className="cal-ev-list">
                  {upcoming.slice(0, 8).map((ev) => (
                    <div
                      key={ev.id}
                      className="cal-ev-item"
                      onClick={() => {
                        const d = ev.datetime ? ev.datetime.slice(0, 10) : null;
                        if (d) {
                          const dt = new Date(d + 'T12:00:00');
                          setViewYear(dt.getFullYear());
                          setViewMonth(dt.getMonth());
                          setSelectedDay(d);
                        }
                        openDetail(ev);
                      }}
                    >
                      <StatusBadge status={ev.status} />
                      <div className="cal-ev-name">{ev.name || '(sin nombre)'}</div>
                      <div className="cal-ev-time">{fmtFull(ev.datetime)}</div>
                      {ev.service ? <div className="cal-ev-svc">{ev.service}</div> : null}
                      {ev.customer_name ? <div className="cal-ev-svc" style={{ color: 'var(--muted)' }}>{ev.customer_name}</div> : null}
                    </div>
                  ))}
                  {upcoming.length > 8 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', paddingTop: 8 }}>
                      +{upcoming.length - 8} más…
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {events.length === 0 && !loading ? (
          <div className="cal-empty">
            <strong>Sin citas este mes.</strong>
            Las citas agendadas por el bot o por tus clientes aparecerán aquí.
          </div>
        ) : null}
      </div>
    </>
  );
}
