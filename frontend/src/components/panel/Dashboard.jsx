import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { apiCall } from '../../api/client.js';
import { canAccessDashboardPage } from '../../constants/plans.js';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';
import { usePricing } from '../../hooks/usePricing.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
GlobalWorkerOptions.workerSrc = pdfWorker;

async function readTxtLike(file) {
  return file.text();
}

async function readDocx(file) {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || '';
}

async function readPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    pages.push(text.trim());
  }
  return pages.filter(Boolean).join('\n\n');
}

async function readXlsx(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const chunks = workbook.SheetNames.map((sheetName) => {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
    const textRows = rows
      .map((row) =>
        Array.isArray(row)
          ? row
              .map((cell) => (cell == null ? '' : String(cell).trim()))
              .filter(Boolean)
              .join(' | ')
          : ''
      )
      .filter(Boolean)
      .join('\n');
    return `# ${sheetName}\n${textRows}`;
  });
  return chunks.filter(Boolean).join('\n\n');
}

function guessExtension(name = '') {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function ResList({ list }) {
  if (!list?.length) return null;
  return list.map((r) => {
    const dt = new Date(r.datetime || r.date);
    const fecha = dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const hora = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const status =
      r.status === 'pending' ? 'Pendiente' : r.status === 'cancelled' ? 'Cancelada' : 'Confirmada';
    return (
      <div key={r.id || fecha + hora} className="p-res-item">
        <div className="p-res-av">{(r.name || '?')[0]}</div>
        <div>
          <div className="p-res-name">{r.name || 'Cliente'}</div>
          <div className="p-res-detail">
            {r.service || ''} · {fecha} {hora}
          </div>
        </div>
        <span className="p-status">{status}</span>
      </div>
    );
  });
}

export function Dashboard() {
  const { user, handleLogout } = usePanel();
  const { plansByCheapest } = usePricing();
  const [page, setPage] = useState('dash');
  const [stats, setStats] = useState({
    messagesMonth: 0,
    messagesTotal: 0,
    leadsTotal: 0,
    leadsMonth: 0,
    bookingsMonth: 0,
    bookingsTotal: 0,
  });
  const [messagesSeries, setMessagesSeries] = useState([]);
  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [latestPayment, setLatestPayment] = useState(null);
  const [recentConversations, setRecentConversations] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [calDate, setCalDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [events, setEvents] = useState([]);
  const [biz, setBiz] = useState({});
  const [bot, setBot] = useState({});
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [kbBusy, setKbBusy] = useState(false);
  const [kbErr, setKbErr] = useState('');
  const [eventOpen, setEventOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [evForm, setEvForm] = useState({
    id: '',
    name: '',
    date: '',
    time: '10:00',
    service: '',
    phone: '',
    notes: '',
    source: 'manual',
  });

  const name = user?.businessName || user?.name || 'Cliente';
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const isPro = user?.plan === 'pro';

  const loadData = useCallback(async () => {
    // Aggregated dashboard stats — real wa_messages + wa_leads + customer_events + customer_payments
    try {
      const data = await apiCall('/api/customer/dashboard');
      if (data?.stats) setStats(data.stats);
      setMessagesSeries(Array.isArray(data?.messagesSeries) ? data.messagesSeries : []);
      setUpcomingBookings(Array.isArray(data?.upcomingBookings) ? data.upcomingBookings : []);
      setLatestPayment(data?.latestPayment || null);
    } catch {
      /* ignore */
    }
    // Bookings (calendar / booking pages) — real customer_events
    try {
      const evs = await apiCall('/api/customer/events').catch(() => []);
      setAllEvents(Array.isArray(evs) ? evs : []);
    } catch {
      /* ignore */
    }
    // Business info — real customer_business_info
    try {
      const b = await apiCall('/api/customer/business');
      setBiz(b || {});
    } catch {
      /* ignore */
    }
    // Bot config + knowledge base — real bot_configs (customer scope)
    try {
      const real = await apiCall('/api/customer/bot-config');
      const c = real?.config || {};
      setBot({
        greeting: c.greeting || '',
        instructions: c.system_prompt || '',
        knowledgeBaseText: c.knowledge_base || '',
        knowledgeBaseSources: [],
      });
    } catch {
      /* ignore */
    }
    // Notifications for this email
    try {
      if (user?.email) {
        const n = await apiCall(`/api/customer/notifications?email=${encodeURIComponent(user.email)}`);
        setNotifications(Array.isArray(n.notifications) ? n.notifications : []);
      }
    } catch {
      /* ignore */
    }
    // Recent WhatsApp conversations for the "Conversaciones" page
    try {
      const c = await apiCall('/api/customer/wa-conversations?limit=20');
      setRecentConversations(Array.isArray(c?.conversations) ? c.conversations : []);
    } catch {
      /* ignore */
    }
  }, [user?.email]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (user?.subscription_plan_id && !canAccessDashboardPage(user.subscription_plan_id, page)) {
      setPage('dash');
    }
  }, [user?.subscription_plan_id, page]);

  useEffect(() => {
    if (page !== 'calendar') return;
    (async () => {
      const ev = await apiCall('/api/customer/events').catch(() => []);
      setEvents(Array.isArray(ev) ? ev : []);
    })();
  }, [page, calDate]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3500);
  };

  function planDisplayName(planId) {
    return plansByCheapest.find((p) => p.id === planId)?.name || planId || 'Plan';
  }

  function subscriptionDaysLeft(endsAt) {
    if (!endsAt) return 0;
    const ms = new Date(endsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  const openNavPage = (p) => {
    if (!canAccessDashboardPage(user?.subscription_plan_id, p)) {
      showToast('Tu plan no incluye esta sección. Elige un pack superior en Facturación.', 'error');
      setUpgradeOpen(true);
      return;
    }
    showPage(p);
  };

  const showPage = (p) => {
    setPage(p);
    document.querySelector('.p-main')?.scrollTo(0, 0);
  };

  const changeMonth = (d) => {
    setCalDate((prev) => {
      const n = new Date(prev);
      n.setMonth(n.getMonth() + d);
      return n;
    });
  };

  const goToToday = () => {
    const n = new Date();
    n.setDate(1);
    setCalDate(n);
  };

  const openAddModal = (dateStr) => {
    setEvForm({
      id: '',
      name: '',
      date: dateStr || new Date().toISOString().split('T')[0],
      time: '10:00',
      service: '',
      phone: '',
      notes: '',
      source: 'manual',
    });
    setEventOpen(true);
  };

  const openEditModal = (ev) => {
    const dt = new Date(ev.datetime);
    setEvForm({
      id: ev.id,
      name: ev.name || '',
      date: dt.toISOString().split('T')[0],
      time: dt.toTimeString().slice(0, 5),
      service: ev.service || '',
      phone: ev.phone || '',
      notes: ev.notes || '',
      source: ev.source || 'manual',
    });
    setEventOpen(true);
  };

  const saveEvent = async (e) => {
    e.preventDefault();
    const payload = {
      name: evForm.name,
      datetime: `${evForm.date}T${evForm.time}:00`,
      service: evForm.service,
      phone: evForm.phone,
      notes: evForm.notes,
      source: 'manual',
      status: 'confirmed',
    };
    if (evForm.id) payload.id = evForm.id;
    try {
      if (evForm.id) await apiCall('/api/customer/events/' + evForm.id, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiCall('/api/customer/events', { method: 'POST', body: JSON.stringify(payload) });
      setEventOpen(false);
      const ev = await apiCall('/api/customer/events').catch(() => []);
      setEvents(Array.isArray(ev) ? ev : []);
      loadData();
      showToast(evForm.id ? 'Reserva actualizada' : 'Reserva creada', 'success');
    } catch (ex) {
      showToast('Error: ' + ex.message, 'error');
    }
  };

  const deleteEvent = async () => {
    if (!evForm.id || !confirm('¿Eliminar esta reserva?')) return;
    try {
      await apiCall('/api/customer/events/' + evForm.id, { method: 'DELETE' });
      setEventOpen(false);
      const ev = await apiCall('/api/customer/events').catch(() => []);
      setEvents(Array.isArray(ev) ? ev : []);
      loadData();
      showToast('Reserva eliminada', 'success');
    } catch (ex) {
      showToast('Error: ' + ex.message, 'error');
    }
  };

  const saveBusiness = async (e) => {
    e.preventDefault();
    const data = {
      name: biz.name,
      type: biz.type,
      phone: biz.phone,
      email: biz.email,
      address: biz.address,
      hours: biz.hours,
      services: biz.services,
    };
    try {
      await apiCall('/api/customer/business', { method: 'PUT', body: JSON.stringify(data) });
      showToast('Datos guardados', 'success');
    } catch (ex) {
      showToast('Error: ' + ex.message, 'error');
    }
  };

  const saveBotCfg = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/api/customer/bot-config', {
        method: 'PATCH',
        body: JSON.stringify({
          greeting: bot.greeting || '',
          system_prompt: bot.instructions || bot.instr || '',
        }),
      });
      showToast('Configuración guardada', 'success');
    } catch (ex) {
      showToast('Error: ' + ex.message, 'error');
    }
  };

  async function handleKbUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setKbBusy(true);
    setKbErr('');

    let merged = (bot.knowledgeBaseText || '').trim();
    const imported = [...(Array.isArray(bot.knowledgeBaseSources) ? bot.knowledgeBaseSources : [])];

    for (const file of files) {
      const ext = guessExtension(file.name);
      try {
        let text = '';
        if (['txt', 'md', 'csv', 'json'].includes(ext)) {
          text = await readTxtLike(file);
        } else if (ext === 'docx') {
          text = await readDocx(file);
        } else if (ext === 'pdf') {
          text = await readPdf(file);
        } else if (['xlsx', 'xls'].includes(ext)) {
          text = await readXlsx(file);
        } else if (ext === 'doc') {
          throw new Error('.doc legacy format is not readable in browser. Please upload .docx');
        } else {
          throw new Error('Unsupported format');
        }

        const normalized = (text || '').trim();
        if (!normalized) throw new Error('No readable text found in file');

        merged = `${merged}${merged ? '\n\n' : ''}----- ${file.name} -----\n${normalized}`;
        imported.push({ name: file.name, size: file.size, at: new Date().toISOString() });
      } catch (err) {
        setKbErr(`No se pudo importar ${file.name}: ${err.message || 'Error'}`);
      }
    }

    setBot((prev) => ({ ...prev, knowledgeBaseText: merged, knowledgeBaseSources: imported }));
    setKbBusy(false);
    e.target.value = '';
  }

  function removeKbFile(index) {
    setBot((prev) => ({
      ...prev,
      knowledgeBaseSources: (prev.knowledgeBaseSources || []).filter((_, i) => i !== index),
    }));
  }

  async function saveKnowledgeBase() {
    try {
      await apiCall('/api/customer/bot-config', {
        method: 'PATCH',
        body: JSON.stringify({
          greeting: bot.greeting || '',
          system_prompt: bot.instructions || bot.instr || '',
          knowledge_base: bot.knowledgeBaseText || '',
        }),
      });
      showToast('Knowledge Base guardada', 'success');
    } catch (ex) {
      showToast('Error: ' + ex.message, 'error');
    }
  }

  const y = calDate.getFullYear();
  const m = calDate.getMonth();
  const calLabel = `${MONTHS[m]} ${y}`;

  const renderCalCells = () => {
    const grid = [];
    const firstDay = new Date(y, m, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    for (let i = 0; i < offset; i++) grid.push(<div key={`e-${i}`} className="cal-day empty" />);
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = (events || []).filter((ev) => {
        const ed = new Date(ev.datetime);
        return ed.getFullYear() === y && ed.getMonth() === m && ed.getDate() === d;
      });
      grid.push(
        <div
          key={d}
          className={`cal-day${isToday ? ' today' : ''}`}
          onClick={(ev) => {
            const tag = ev.target.closest('.cal-event-tag');
            if (tag?.dataset?.id) {
              const found = (events || []).find((x) => x.id === tag.dataset.id);
              if (found) openEditModal(found);
            } else openAddModal(dateStr);
          }}
          role="presentation"
        >
          <div className="cal-day-num">{d}</div>
            {dayEvents.slice(0, 2).map((e) => {
            const t = new Date(e.datetime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            return (
              <div
                key={e.id}
                role="presentation"
                className={`cal-event-tag${e.source === 'manual' ? ' manual' : ''}`}
                data-id={e.id}
                onClick={(ev) => ev.stopPropagation()}
              >
                {t} {e.name || ''}
              </div>
            );
          })}
          {dayEvents.length > 2 && (
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>+{dayEvents.length - 2} más</div>
          )}
        </div>
      );
    }
    return grid;
  };

  return (
    <>
      <div id="panelDash" className="panel-dashboard active">
        <aside className="p-sidebar">
          <div className="p-sidebar-header">
            <div className="p-sidebar-logo">
              <div className="p-sidebar-logo-icon">
                <LogoMark size={22} alt="" />
              </div>
              <span className="p-sidebar-logo-text">Omnira</span>
            </div>
          </div>
          <nav className="p-sidebar-nav">
            <div className="p-nav-section">
              <div className="p-nav-label">Panel</div>
              <button type="button" className={`p-nav-item${page === 'dash' ? ' active' : ''}`} onClick={() => openNavPage('dash')}>
                <i className="fa-solid fa-table-cells-large" /> Resumen
              </button>
              <button type="button" className={`p-nav-item${page === 'calendar' ? ' active' : ''}`} onClick={() => openNavPage('calendar')}>
                <i className="fa-solid fa-calendar-days" /> Calendario
              </button>
              <button type="button" className={`p-nav-item${page === 'booking' ? ' active' : ''}`} onClick={() => openNavPage('booking')}>
                <i className="fa-solid fa-calendar-check" /> Booking
              </button>
              <button type="button" className={`p-nav-item${page === 'convs' ? ' active' : ''}`} onClick={() => openNavPage('convs')}>
                <i className="fa-brands fa-whatsapp" /> Conversaciones
              </button>
              <button
                type="button"
                className={`p-nav-item${page === 'stats' ? ' active' : ''}${!canAccessDashboardPage(user?.subscription_plan_id, 'stats') ? ' p-nav-locked' : ''}`}
                onClick={() => openNavPage('stats')}
              >
                <i className="fa-solid fa-chart-line" /> Estadísticas
                {!canAccessDashboardPage(user?.subscription_plan_id, 'stats') ? (
                  <i className="fa-solid fa-lock" style={{ marginLeft: 'auto', opacity: 0.45, fontSize: 11 }} />
                ) : null}
              </button>
            </div>
            <div className="p-nav-section">
              <div className="p-nav-label">Configuración</div>
              <button type="button" className={`p-nav-item${page === 'negocio' ? ' active' : ''}`} onClick={() => openNavPage('negocio')}>
                <i className="fa-solid fa-building" /> Mi Negocio
              </button>
              <button type="button" className={`p-nav-item${page === 'bot' ? ' active' : ''}`} onClick={() => openNavPage('bot')}>
                <i className="fa-solid fa-robot" /> Bot
              </button>
              <button
                type="button"
                className={`p-nav-item${page === 'factura' ? ' active' : ''}${!canAccessDashboardPage(user?.subscription_plan_id, 'factura') ? ' p-nav-locked' : ''}`}
                onClick={() => openNavPage('factura')}
              >
                <i className="fa-solid fa-credit-card" /> Facturación
                {!canAccessDashboardPage(user?.subscription_plan_id, 'factura') ? (
                  <i className="fa-solid fa-lock" style={{ marginLeft: 'auto', opacity: 0.45, fontSize: 11 }} />
                ) : null}
              </button>
              <button
                type="button"
                className={`p-nav-item${page === 'knowledge' ? ' active' : ''}${!canAccessDashboardPage(user?.subscription_plan_id, 'knowledge') ? ' p-nav-locked' : ''}`}
                onClick={() => openNavPage('knowledge')}
              >
                <i className="fa-solid fa-brain" /> Knowledge Training
                {!canAccessDashboardPage(user?.subscription_plan_id, 'knowledge') ? (
                  <i className="fa-solid fa-lock" style={{ marginLeft: 'auto', opacity: 0.45, fontSize: 11 }} />
                ) : null}
              </button>
            </div>
          </nav>
          <div className="p-sidebar-footer">
            <div className="p-user-block">
              <div className="p-user-av">{initials}</div>
              <div style={{ minWidth: 0 }}>
                <div className="p-user-name">{name}</div>
                <div className="p-user-email">{user?.email || ''}</div>
              </div>
            </div>
            <button type="button" className="p-nav-item" onClick={handleLogout}>
              <i className="fa-solid fa-right-from-bracket" /> Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="p-main">
          {user?.subscriptionActive && user?.subscription_ends_at ? (
            <div className="p-subscription-banner" role="status">
              <div className="p-subscription-banner-shine" aria-hidden />
              <div className="p-subscription-banner-content">
                <span className="p-subscription-badge">
                  <i className="fa-solid fa-gem" /> {planDisplayName(user.subscription_plan_id)}
                </span>
                <div className="p-subscription-countdown">
                  <span className="p-subscription-days">{subscriptionDaysLeft(user.subscription_ends_at)}</span>
                  <span className="p-subscription-days-label">días restantes</span>
                </div>
                <div className="p-subscription-until">
                  Acceso hasta el{' '}
                  <strong>
                    {new Date(user.subscription_ends_at).toLocaleDateString('es-ES', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </strong>
                </div>
              </div>
            </div>
          ) : null}
          <div id="page-dash" className={`p-page${page === 'dash' ? ' active' : ''}`}>
            <div id="dashUpgradeBanner" className="upgrade-banner" style={{ display: isPro ? 'none' : 'flex' }}>
              <div className="upgrade-text">
                <h4>Activa el bot de WhatsApp para tu negocio</h4>
                <p>Con el plan Pro, Omnira responde a tus clientes 24/7 y gestiona reservas automáticamente.</p>
              </div>
              <button type="button" className="btn-upgrade" onClick={() => setUpgradeOpen(true)}>
                Ver planes Pro →
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '32px' }}>
              <div>
                <h1 className="p-page-title" id="dashWelcome">
                  Hola, <span style={{ color: 'var(--em)' }}>{name}</span>
                </h1>
                <p className="p-page-sub" style={{ marginBottom: 0 }}>
                  Aquí tienes el resumen de tu negocio.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="p-nav-item"
                  style={{ minWidth: 46, justifyContent: 'center', position: 'relative' }}
                  onClick={() => setNotifOpen((v) => !v)}
                >
                  <i className="fa-solid fa-bell" />
                  {notifications.length > 0 && (
                    <span style={{ position: 'absolute', top: 6, right: 8, fontSize: 10, color: '#00e5a0' }}>
                      {notifications.length}
                    </span>
                  )}
                </button>
                <div className="bot-live-badge" id="dashBotBadge" style={{ display: isPro && user?.botActive ? 'inline-flex' : 'none' }}>
                  <div className="bot-live-dot" /> Bot activo
                </div>
              </div>
            </div>
            {notifOpen && (
              <div className="p-card" style={{ marginBottom: 16 }}>
                <div className="p-card-header">
                  <span className="p-card-title">Notifications</span>
                </div>
                {notifications.length ? (
                  notifications.slice(0, 8).map((n) => (
                    <div key={n.id} className="p-res-item" style={{ marginBottom: 8 }}>
                      <div className="p-res-av"><i className="fa-solid fa-bell" /></div>
                      <div>
                        <div className="p-res-name">{n.title}</div>
                        <div className="p-res-detail">{n.message}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-empty">
                    <i className="fa-solid fa-bell-slash" />
                    <p>No notifications</p>
                  </div>
                )}
              </div>
            )}
            <div className="p-stats-grid">
              <div className="p-stat-card">
                <div className="p-stat-top">
                  <div className="p-stat-icon"><i className="fa-solid fa-calendar" /></div>
                </div>
                <div className="p-stat-val">{stats.bookingsMonth}</div>
                <div className="p-stat-lbl">Reservas este mes</div>
              </div>
              <div className="p-stat-card">
                <div className="p-stat-top">
                  <div className="p-stat-icon"><i className="fa-brands fa-whatsapp" /></div>
                </div>
                <div className="p-stat-val">{stats.messagesMonth}</div>
                <div className="p-stat-lbl">Mensajes este mes</div>
              </div>
              <div className="p-stat-card">
                <div className="p-stat-top">
                  <div className="p-stat-icon"><i className="fa-solid fa-user-plus" /></div>
                </div>
                <div className="p-stat-val">{stats.leadsMonth}</div>
                <div className="p-stat-lbl">Leads este mes</div>
              </div>
              <div className="p-stat-card">
                <div className="p-stat-top">
                  <div className="p-stat-icon"><i className="fa-solid fa-comments" /></div>
                </div>
                <div className="p-stat-val">{stats.leadsTotal}</div>
                <div className="p-stat-lbl">Leads totales</div>
              </div>
            </div>
            <div className="p-content-grid">
              <div className="p-card">
                <div className="p-card-header">
                  <span className="p-card-title">Próximas reservas</span>
                  <button type="button" className="p-card-link" onClick={() => showPage('calendar')}>
                    Ver calendario →
                  </button>
                </div>
                <div id="dashResList">
                  {upcomingBookings?.length ? (
                    <ResList list={upcomingBookings} />
                  ) : (
                    <div className="p-empty">
                      <i className="fa-solid fa-calendar-xmark" />
                      <p>No hay reservas próximas</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-card">
                <div className="p-card-header">
                  <span className="p-card-title">Últimas conversaciones</span>
                  <button type="button" className="p-card-link" onClick={() => showPage('convs')}>
                    Ver todas →
                  </button>
                </div>
                <div id="dashConvList">
                  {recentConversations.length ? (
                    recentConversations.slice(0, 5).map((c) => (
                      <div key={`${c.phone_number_id || ''}|${c.wa_from}`} className="p-res-item">
                        <div className="p-res-av">{(c.lead?.name || `+${c.wa_from}`)[0]?.toUpperCase()}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="p-res-name">{c.lead?.name || `+${c.wa_from}`}</div>
                          <div className="p-res-detail" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.last_body || '—'}
                          </div>
                        </div>
                        <span className="p-status" style={{ fontFamily: 'monospace', fontSize: 10 }}>
                          {c.message_count} msg
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-empty">
                      <i className="fa-brands fa-whatsapp" />
                      <p>Sin mensajes recientes</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div id="page-calendar" className={`p-page${page === 'calendar' ? ' active' : ''}`}>
            <h1 className="p-page-title">Calendario</h1>
            <p className="p-page-sub">Visualiza y gestiona todas tus citas en un solo lugar.</p>
            <div className="p-card">
              <div className="cal-toolbar">
                <div className="cal-nav">
                  <button type="button" className="cal-btn-nav" onClick={() => changeMonth(-1)}>
                    <i className="fa-solid fa-chevron-left" />
                  </button>
                  <div className="cal-month-label" id="calLabel">
                    {calLabel}
                  </div>
                  <button type="button" className="cal-btn-nav" onClick={() => changeMonth(1)}>
                    <i className="fa-solid fa-chevron-right" />
                  </button>
                  <button type="button" className="cal-btn-nav" onClick={goToToday} style={{ width: 'auto', padding: '0 14px', fontSize: 12, fontFamily: "'Outfit',sans-serif" }}>
                    Hoy
                  </button>
                </div>
                <button type="button" className="cal-add-btn" onClick={() => openAddModal()}>
                  <i className="fa-solid fa-plus" /> Añadir cita
                </button>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 12, color: 'var(--muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--em)' }} />
                  Por bot
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--gold)' }} />
                  Manual
                </div>
              </div>
              <div className="cal-grid">
                <div className="cal-weekday">L</div>
                <div className="cal-weekday">M</div>
                <div className="cal-weekday">X</div>
                <div className="cal-weekday">J</div>
                <div className="cal-weekday">V</div>
                <div className="cal-weekday">S</div>
                <div className="cal-weekday">D</div>
              </div>
              <div className="cal-grid" id="calGrid" style={{ marginTop: 6 }}>
                {renderCalCells()}
              </div>
            </div>
          </div>

          <div id="page-booking" className={`p-page${page === 'booking' ? ' active' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '32px' }}>
              <div>
                <h1 className="p-page-title">Booking</h1>
                <p className="p-page-sub" style={{ marginBottom: 0 }}>
                  Manage all your appointments from one place.
                </p>
              </div>
              <button type="button" className="cal-add-btn" onClick={() => openAddModal()}>
                <i className="fa-solid fa-plus" /> New booking
              </button>
            </div>
            <div className="p-card">
              <div className="p-card-header">
                <span className="p-card-title">All bookings</span>
              </div>
              <div id="allResList">
                {allEvents?.length ? (
                  <ResList
                    list={[...allEvents].sort((a, b) => new Date(a.datetime) - new Date(b.datetime))}
                  />
                ) : (
                  <div className="p-empty">
                    <i className="fa-solid fa-calendar-xmark" />
                    <p>Las reservas aparecerán aquí automáticamente</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div id="page-convs" className={`p-page${page === 'convs' ? ' active' : ''}`}>
            <h1 className="p-page-title">Conversaciones</h1>
            <p className="p-page-sub">
              Todos los hilos en tu número de WhatsApp Business. Cada fila proviene de{' '}
              <code style={{ background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 4 }}>wa_messages</code> en Supabase.
            </p>
            <div className="p-card">
              <div className="p-card-header">
                <span className="p-card-title">{recentConversations.length} conversaciones</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>
                  {stats.messagesTotal} mensajes totales
                </span>
              </div>
              {recentConversations.length === 0 ? (
                <div className="p-empty">
                  <i className="fa-brands fa-whatsapp" />
                  <p>Las conversaciones aparecerán cuando tu bot reciba mensajes</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentConversations.map((c) => {
                    const name = c.lead?.name || `+${c.wa_from}`;
                    const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                    return (
                      <div key={`${c.phone_number_id || ''}|${c.wa_from}`} className="p-res-item" style={{ alignItems: 'flex-start' }}>
                        <div className="p-res-av">{initials}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="p-res-name">{name}</div>
                          <div className="p-res-detail" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.last_body || '—'}
                          </div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                            <span>+{c.wa_from}</span>
                            <span>·</span>
                            <span>{c.message_count} msg</span>
                            {c.lead?.intent ? <><span>·</span><span>{c.lead.intent}</span></> : null}
                          </div>
                        </div>
                        <span className="p-status">{c.lead?.status || 'inbound'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div id="page-stats" className={`p-page${page === 'stats' ? ' active' : ''}`}>
            <h1 className="p-page-title">Estadísticas</h1>
            <p className="p-page-sub">
              Datos en vivo de tu cuenta: <strong>{stats.messagesTotal}</strong> mensajes,{' '}
              <strong>{stats.leadsTotal}</strong> leads y <strong>{stats.bookingsTotal}</strong> reservas registrados.
            </p>
            <div className="p-stats-grid" style={{ marginBottom: 20 }}>
              <div className="p-stat-card"><div className="p-stat-val">{stats.messagesMonth}</div><div className="p-stat-lbl">Mensajes este mes</div></div>
              <div className="p-stat-card"><div className="p-stat-val">{stats.leadsMonth}</div><div className="p-stat-lbl">Leads este mes</div></div>
              <div className="p-stat-card"><div className="p-stat-val">{stats.bookingsMonth}</div><div className="p-stat-lbl">Reservas este mes</div></div>
              <div className="p-stat-card"><div className="p-stat-val">{stats.messagesTotal}</div><div className="p-stat-lbl">Mensajes totales</div></div>
            </div>
            <div className="p-card">
              <div className="p-card-header">
                <span className="p-card-title">Mensajes · últimos 7 días</span>
              </div>
              {messagesSeries.length === 0 ? (
                <div className="p-empty"><i className="fa-solid fa-chart-line" /><p>Aún sin actividad esta semana</p></div>
              ) : (
                (() => {
                  const max = Math.max(1, ...messagesSeries.map((d) => Number(d.messages || 0)));
                  return (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 200, padding: '14px 4px 0' }}>
                      {messagesSeries.map((d) => {
                        const pct = (Number(d.messages || 0) / max) * 100;
                        return (
                          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--em)' }}>{d.messages}</div>
                            <div
                              style={{
                                width: '100%', maxWidth: 48,
                                height: `${Math.max(2, pct)}%`,
                                background: 'linear-gradient(180deg, var(--em) 0%, rgba(0,229,160,0.25) 100%)',
                                borderRadius: '8px 8px 2px 2px',
                                transition: 'height .5s ease',
                              }}
                            />
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{d.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          <div id="page-negocio" className={`p-page${page === 'negocio' ? ' active' : ''}`}>
            <h1 className="p-page-title">Mi Negocio</h1>
            <p className="p-page-sub">Información que el bot usa para responder a tus clientes.</p>
            <div className="p-card">
              <form onSubmit={saveBusiness}>
                <div className="settings-2col">
                  <div className="form-group">
                    <label className="form-label">Nombre del negocio</label>
                    <input className="form-input" value={biz.name || ''} onChange={(e) => setBiz({ ...biz, name: e.target.value })} placeholder="Clínica Dental Sonrisas" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo de negocio</label>
                    <input className="form-input" value={biz.type || ''} onChange={(e) => setBiz({ ...biz, type: e.target.value })} placeholder="Clínica dental" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" value={biz.phone || ''} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} placeholder="+34 600 000 000" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" value={biz.email || ''} onChange={(e) => setBiz({ ...biz, email: e.target.value })} placeholder="contacto@negocio.com" />
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Dirección</label>
                    <input className="form-input" value={biz.address || ''} onChange={(e) => setBiz({ ...biz, address: e.target.value })} placeholder="Calle Mayor 12, Madrid" />
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Horario</label>
                    <textarea className="form-input" rows={3} value={biz.hours || ''} onChange={(e) => setBiz({ ...biz, hours: e.target.value })} style={{ resize: 'vertical', fontFamily: "'Outfit',sans-serif" }} placeholder={'Lunes a Viernes: 9:00 - 20:00\nSábado: 10:00 - 14:00'} />
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Servicios y precios</label>
                    <textarea className="form-input" rows={4} value={biz.services || ''} onChange={(e) => setBiz({ ...biz, services: e.target.value })} style={{ resize: 'vertical', fontFamily: "'Outfit',sans-serif" }} placeholder={'Limpieza dental — 60€ — 30 min\nEmpaste — 80€ — 45 min'} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="submit" className="btn-save-form">
                    <i className="fa-solid fa-floppy-disk" /> Guardar cambios
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div id="page-bot" className={`p-page${page === 'bot' ? ' active' : ''}`}>
            <h1 className="p-page-title">Configuración del Bot</h1>
            <p className="p-page-sub">Ajusta el comportamiento de tu asistente Omnira.</p>
            <div className="p-card" style={{ marginBottom: 20 }}>
              <div className="p-card-header">
                <span className="p-card-title">Estado del bot</span>
                <div className="bot-live-badge">
                  <div className="bot-live-dot" />
                  Activo
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--soft)', lineHeight: 1.7 }}>
                Tu bot está respondiendo automáticamente a los mensajes de WhatsApp Business. Contacta con soporte para pausarlo.
              </p>
            </div>
            <div className="p-card">
              <div className="p-card-header">
                <span className="p-card-title">Personalidad del bot</span>
              </div>
              <form onSubmit={saveBotCfg}>
                <div className="form-group">
                  <label className="form-label">Mensaje de bienvenida</label>
                  <textarea className="form-input" rows={2} value={bot.greeting || ''} onChange={(e) => setBot({ ...bot, greeting: e.target.value })} style={{ resize: 'vertical', fontFamily: "'Outfit',sans-serif" }} placeholder="¡Hola! Soy el asistente de [Negocio]. ¿En qué puedo ayudarte?" />
                </div>
                <div className="form-group">
                  <label className="form-label">Instrucciones especiales</label>
                  <textarea className="form-input" rows={4} value={bot.instructions || bot.instr || ''} onChange={(e) => setBot({ ...bot, instructions: e.target.value })} style={{ resize: 'vertical', fontFamily: "'Outfit',sans-serif" }} placeholder="Información adicional para el bot..." />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn-save-form">
                    <i className="fa-solid fa-floppy-disk" /> Guardar cambios
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div id="page-factura" className={`p-page${page === 'factura' ? ' active' : ''}`}>
            <h1 className="p-page-title">Facturación</h1>
            <p className="p-page-sub">
              Tu plan actual, fecha de renovación y último pago. Todo viene de Stripe vía Supabase{' '}
              (<code style={{ background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 4 }}>customer_payments</code>).
            </p>
            <div className="p-content-grid">
              <div className="p-card">
                <div className="p-card-header">
                  <span className="p-card-title">Tu plan actual</span>
                </div>
                {(() => {
                  const planMatch = plansByCheapest.find((p) => p.id === user?.subscription_plan_id);
                  return (
                    <div style={{ padding: '20px 0' }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 42, fontWeight: 800, color: 'var(--em)' }}>
                        {planMatch ? `${planMatch.priceNum}€` : '—'}
                        <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>
                          {planMatch?.period || '/mes'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--soft)', marginTop: 8 }}>
                        {planMatch?.name || (user?.subscription_plan_id || 'Sin plan activo')}
                      </div>
                      <div style={{ marginTop: 24 }}>
                        <button type="button" className="btn-save-form" onClick={() => setUpgradeOpen(true)}>
                          Cambiar plan →
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="p-card">
                <div className="p-card-header">
                  <span className="p-card-title">Próxima renovación</span>
                </div>
                <div style={{ padding: '20px 0' }}>
                  <div style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 6 }}>Acceso hasta</div>
                  <div style={{ fontSize: 20, color: 'var(--text)', fontWeight: 700 }}>
                    {user?.subscription_ends_at
                      ? new Date(user.subscription_ends_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'Sin suscripción activa'}
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '18px 0' }} />
                  <div style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 6 }}>Último pago</div>
                  {latestPayment ? (
                    <>
                      <div style={{ fontSize: 16, color: 'var(--text)', fontWeight: 700 }}>
                        €{latestPayment.amount_euro.toFixed(2)} · {latestPayment.plan_id}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, fontFamily: 'monospace' }}>
                        {new Date(latestPayment.created_at).toLocaleDateString('es-ES')}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 14, color: 'var(--muted)' }}>Sin pagos registrados</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div id="page-knowledge" className={`p-page${page === 'knowledge' ? ' active' : ''}`}>
            <h1 className="p-page-title">Knowledge Training</h1>
            <p className="p-page-sub">Sube documentos o escribe texto para entrenar el contexto de tu chatbot.</p>
            <div className="p-card">
              <div className="panel-kb-wrap" style={{ marginTop: 0 }}>
                <div className="panel-kb-head">
                  <h3>Base de conocimiento</h3>
                  <p>
                    Puedes subir `txt`, `docx`, `pdf`, `xlsx` o escribir manualmente el contexto de negocio sobre el que
                    trabajará tu agente.
                  </p>
                </div>

                <div className="panel-kb-actions">
                  <label className="btn-ghost panel-kb-upload">
                    <input
                      type="file"
                      accept=".txt,.md,.csv,.json,.doc,.docx,.pdf,.xlsx,.xls"
                      multiple
                      onChange={handleKbUpload}
                      disabled={kbBusy}
                    />
                    <i className="fa-solid fa-upload" /> {kbBusy ? 'Importando…' : 'Subir archivos'}
                  </label>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setBot((prev) => ({ ...prev, knowledgeBaseText: '' }))}
                  >
                    <i className="fa-solid fa-eraser" /> Limpiar texto
                  </button>
                  <button type="button" className="btn-save-form" onClick={saveKnowledgeBase}>
                    <i className="fa-solid fa-floppy-disk" /> Guardar KB
                  </button>
                </div>

                {kbErr ? <div className="auth-error show">{kbErr}</div> : null}

                <textarea
                  className="form-input panel-kb-textarea"
                  value={bot.knowledgeBaseText || ''}
                  onChange={(e) => setBot((prev) => ({ ...prev, knowledgeBaseText: e.target.value }))}
                  placeholder="Escribe aquí FAQs, servicios, políticas, tono, guías de reserva, etc."
                />

                {Array.isArray(bot.knowledgeBaseSources) && bot.knowledgeBaseSources.length ? (
                  <div className="panel-kb-files">
                    {bot.knowledgeBaseSources.map((f, idx) => (
                      <div key={`${f.name}-${f.at}-${idx}`} className="panel-kb-file">
                        <div>
                          <strong>{f.name}</strong>
                          <span>{Math.max(1, Math.round((f.size || 0) / 1024))} KB</span>
                        </div>
                        <button type="button" onClick={() => removeKbFile(idx)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </main>
      </div>

      {eventOpen && (
        <div id="eventModal" className="modal-overlay active">
          <div className="modal-box">
            <div className="modal-header">
              <h3 className="modal-title">{evForm.id ? 'Editar reserva' : 'Nueva reserva'}</h3>
              <button type="button" className="modal-close-btn" onClick={() => setEventOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={saveEvent}>
              <input type="hidden" value={evForm.id} />
              <div className="form-group">
                <label className="form-label">Nombre del cliente</label>
                <input className="form-input" value={evForm.name} onChange={(e) => setEvForm({ ...evForm, name: e.target.value })} placeholder="María García" required />
              </div>
              <div className="settings-2col">
                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input className="form-input" type="date" value={evForm.date} onChange={(e) => setEvForm({ ...evForm, date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora</label>
                  <input className="form-input" type="time" value={evForm.time} onChange={(e) => setEvForm({ ...evForm, time: e.target.value })} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Servicio</label>
                <input className="form-input" value={evForm.service} onChange={(e) => setEvForm({ ...evForm, service: e.target.value })} placeholder="Limpieza dental" />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono (opcional)</label>
                <input className="form-input" type="tel" value={evForm.phone} onChange={(e) => setEvForm({ ...evForm, phone: e.target.value })} placeholder="+34 600 000 000" />
              </div>
              <div className="form-group">
                <label className="form-label">Notas (opcional)</label>
                <textarea className="form-input" rows={2} value={evForm.notes} onChange={(e) => setEvForm({ ...evForm, notes: e.target.value })} style={{ resize: 'vertical', fontFamily: "'Outfit',sans-serif" }} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel-modal" onClick={() => setEventOpen(false)}>
                  Cancelar
                </button>
                {evForm.id && evForm.source === 'manual' && (
                  <button type="button" className="btn-del-modal" onClick={deleteEvent}>
                    Eliminar
                  </button>
                )}
                <button type="submit" className="btn-save-modal">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {upgradeOpen && (
        <div id="upgradeModal" className="modal-overlay active" style={{ zIndex: 10002, position: 'fixed' }}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Activa el bot de WhatsApp</h3>
              <button type="button" className="modal-close-btn" onClick={() => setUpgradeOpen(false)}>
                ×
              </button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--soft)', lineHeight: 1.75, marginBottom: 22 }}>
              Con Omnira Pro, tu negocio responde automáticamente, confirma citas y gestiona tu agenda{' '}
              <strong style={{ color: 'var(--text)' }}>24/7 sin esfuerzo</strong>.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
              {plansByCheapest.map((plan) => {
                const totalEuro = Math.round((plan.amount_cents || 0) / 100);
                const months = Math.max(1, Math.round((plan.duration_days || 30) / 30));
                const monthlyTextLabel = months === 1 ? `/mes · total ${totalEuro}€` : `/mes equiv. · total ${totalEuro}€`;
                const cardStyle = plan.featured
                  ? { textAlign: 'center', padding: 14, borderColor: 'var(--em)', background: 'rgba(0,229,160,0.04)' }
                  : { textAlign: 'center', padding: 14 };
                const labelStyle = plan.featured
                  ? { fontSize: 10, color: 'var(--em)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }
                  : { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 };
                const wa = `https://wa.me/34682497790?text=${encodeURIComponent(`Hola, quiero el pack ${plan.name} (${totalEuro}€)`)}`;
                return (
                  <div key={plan.id} className="p-card" style={cardStyle}>
                    <div style={labelStyle}>{plan.featured ? '⚡ ' : ''}{plan.name}</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, color: '#fff' }}>{plan.priceNum}€</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{monthlyTextLabel}</div>
                    {plan.savings ? (
                      <div style={{ fontSize: 10, color: 'var(--em)', marginTop: 2 }}>{plan.savings.replace(/^[^A-Za-z]+/, '')}</div>
                    ) : null}
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-save-form" style={{ display: 'flex', justifyContent: 'center', marginTop: 8, textDecoration: 'none', fontSize: 13 }}>
                      Contratar
                    </a>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {['Bot responde por WhatsApp 24/7', 'Reservas ilimitadas en el calendario', 'Recordatorios automáticos', '14 días de prueba gratis'].map((t) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--soft)' }}>
                  <i className="fa-solid fa-check" style={{ color: 'var(--em)', width: 14 }} />
                  {t}
                </div>
              ))}
            </div>
            <button type="button" className="btn-cancel-modal" style={{ width: '100%' }} onClick={() => setUpgradeOpen(false)}>
              Ahora no, seguir con plan gratis
            </button>
          </div>
        </div>
      )}

      <div id="pToast" className={`p-toast ${toast.type} ${toast.msg ? 'show' : ''}`}>
        {toast.msg}
      </div>
    </>
  );
}
