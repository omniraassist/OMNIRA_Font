import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { apiCall } from '../../api/client.js';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';

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
  const [page, setPage] = useState('dash');
  const [stats, setStats] = useState({ reservas: 0, mensajes: 0, respuesta: '2s' });
  const [recent, setRecent] = useState([]);
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
    try {
      const data = await apiCall('/api/dashboard');
      setStats(data.stats || { reservas: 0, mensajes: 0, respuesta: '2s' });
      setRecent(data.recentReservations || []);
    } catch {
      /* ignore */
    }
    try {
      const evs = await apiCall('/api/events').catch(() => []);
      setAllEvents(Array.isArray(evs) ? evs : []);
    } catch {
      /* ignore */
    }
    try {
      const b = await apiCall('/api/business');
      setBiz(b || {});
    } catch {
      /* ignore */
    }
    try {
      const bt = await apiCall('/api/bot');
      setBot(bt || {});
    } catch {
      /* ignore */
    }
    try {
      if (user?.email) {
        const n = await apiCall(`/api/customer/notifications?email=${encodeURIComponent(user.email)}`);
        setNotifications(Array.isArray(n.notifications) ? n.notifications : []);
      }
    } catch {
      /* ignore */
    }
  }, [user?.email]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (page !== 'calendar') return;
    (async () => {
      const ev = await apiCall('/api/events').catch(() => []);
      setEvents(Array.isArray(ev) ? ev : []);
    })();
  }, [page, calDate]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3500);
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
      if (evForm.id) await apiCall('/api/events/' + evForm.id, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiCall('/api/events', { method: 'POST', body: JSON.stringify(payload) });
      setEventOpen(false);
      const ev = await apiCall('/api/events').catch(() => []);
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
      await apiCall('/api/events/' + evForm.id, { method: 'DELETE' });
      setEventOpen(false);
      const ev = await apiCall('/api/events').catch(() => []);
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
      await apiCall('/api/business', { method: 'PUT', body: JSON.stringify(data) });
      showToast('Datos guardados', 'success');
    } catch (ex) {
      showToast('Error: ' + ex.message, 'error');
    }
  };

  const saveBotCfg = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/api/bot', {
        method: 'PUT',
        body: JSON.stringify({ greeting: bot.greeting, instructions: bot.instructions || bot.instr || '' }),
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
      await apiCall('/api/bot', {
        method: 'PUT',
        body: JSON.stringify({
          greeting: bot.greeting || '',
          instructions: bot.instructions || bot.instr || '',
          knowledgeBaseText: bot.knowledgeBaseText || '',
          knowledgeBaseSources: bot.knowledgeBaseSources || [],
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

  const nextBilling = new Date();
  nextBilling.setMonth(nextBilling.getMonth() + 1);

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
              <button type="button" className={`p-nav-item${page === 'dash' ? ' active' : ''}`} onClick={() => showPage('dash')}>
                <i className="fa-solid fa-table-cells-large" /> Resumen
              </button>
              <button type="button" className={`p-nav-item${page === 'calendar' ? ' active' : ''}`} onClick={() => showPage('calendar')}>
                <i className="fa-solid fa-calendar-days" /> Calendario
              </button>
              <button type="button" className={`p-nav-item${page === 'booking' ? ' active' : ''}`} onClick={() => showPage('booking')}>
                <i className="fa-solid fa-calendar-check" /> Booking
              </button>
              <button type="button" className={`p-nav-item${page === 'convs' ? ' active' : ''}`} onClick={() => showPage('convs')}>
                <i className="fa-brands fa-whatsapp" /> Conversaciones
              </button>
              <button type="button" className={`p-nav-item${page === 'stats' ? ' active' : ''}`} onClick={() => showPage('stats')}>
                <i className="fa-solid fa-chart-line" /> Estadísticas
              </button>
            </div>
            <div className="p-nav-section">
              <div className="p-nav-label">Configuración</div>
              <button type="button" className={`p-nav-item${page === 'negocio' ? ' active' : ''}`} onClick={() => showPage('negocio')}>
                <i className="fa-solid fa-building" /> Mi Negocio
              </button>
              <button type="button" className={`p-nav-item${page === 'bot' ? ' active' : ''}`} onClick={() => showPage('bot')}>
                <i className="fa-solid fa-robot" /> Bot
              </button>
              <button type="button" className={`p-nav-item${page === 'factura' ? ' active' : ''}`} onClick={() => showPage('factura')}>
                <i className="fa-solid fa-credit-card" /> Facturación
              </button>
              <button type="button" className={`p-nav-item${page === 'knowledge' ? ' active' : ''}`} onClick={() => showPage('knowledge')}>
                <i className="fa-solid fa-brain" /> Knowledge Training
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
                  <div className="p-stat-icon">
                    <i className="fa-solid fa-calendar" />
                  </div>
                  <span className="p-stat-trend">+12%</span>
                </div>
                <div className="p-stat-val" id="statRes">
                  {stats.reservas}
                </div>
                <div className="p-stat-lbl">Reservas este mes</div>
              </div>
              <div className="p-stat-card">
                <div className="p-stat-top">
                  <div className="p-stat-icon">
                    <i className="fa-brands fa-whatsapp" />
                  </div>
                  <span className="p-stat-trend">+24%</span>
                </div>
                <div className="p-stat-val" id="statMsg">
                  {stats.mensajes}
                </div>
                <div className="p-stat-lbl">Mensajes recibidos</div>
              </div>
              <div className="p-stat-card">
                <div className="p-stat-top">
                  <div className="p-stat-icon">
                    <i className="fa-solid fa-clock" />
                  </div>
                  <span className="p-stat-trend">1.4s</span>
                </div>
                <div className="p-stat-val" id="statResp">
                  {stats.respuesta}
                </div>
                <div className="p-stat-lbl">Tiempo respuesta</div>
              </div>
              <div className="p-stat-card">
                <div className="p-stat-top">
                  <div className="p-stat-icon">
                    <i className="fa-solid fa-star" />
                  </div>
                  <span className="p-stat-trend">★★★★★</span>
                </div>
                <div className="p-stat-val">4.9</div>
                <div className="p-stat-lbl">Valoración media</div>
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
                  {recent?.length ? (
                    <ResList list={recent} />
                  ) : (
                    <div className="p-empty">
                      <i className="fa-solid fa-calendar-xmark" />
                      <p>No hay reservas todavía</p>
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
                  <div className="p-empty">
                    <i className="fa-brands fa-whatsapp" />
                    <p>Sin mensajes recientes</p>
                  </div>
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
            <p className="p-page-sub">Todos los mensajes que recibe tu WhatsApp.</p>
            <div className="p-card">
              <div className="p-card-header">
                <span className="p-card-title">Mensajes recientes</span>
              </div>
              <div className="p-empty">
                <i className="fa-brands fa-whatsapp" />
                <p>Las conversaciones aparecerán cuando tu bot reciba mensajes</p>
              </div>
            </div>
          </div>

          <div id="page-stats" className={`p-page${page === 'stats' ? ' active' : ''}`}>
            <h1 className="p-page-title">Estadísticas</h1>
            <p className="p-page-sub">Mide el impacto del bot en tu negocio.</p>
            <div className="p-content-grid">
              <div className="p-card">
                <div className="p-card-header">
                  <span className="p-card-title">Evolución de reservas</span>
                </div>
                <div className="p-empty">
                  <i className="fa-solid fa-chart-line" />
                  <p>Los gráficos aparecerán cuando tengas suficientes datos</p>
                </div>
              </div>
              <div className="p-card">
                <div className="p-card-header">
                  <span className="p-card-title">Servicios populares</span>
                </div>
                <div className="p-empty">
                  <i className="fa-solid fa-chart-pie" />
                  <p>Sin datos todavía</p>
                </div>
              </div>
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
            <p className="p-page-sub">Gestiona tu plan y método de pago.</p>
            <div className="p-content-grid">
              <div className="p-card">
                <div className="p-card-header">
                  <span className="p-card-title">Tu plan actual</span>
                </div>
                <div style={{ padding: '20px 0' }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 42, fontWeight: 800, color: 'var(--em)' }}>
                    99€<span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>/mes</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--soft)', marginTop: 8 }}>Plan Mensual · Sin permanencia</div>
                  <div style={{ marginTop: 24 }}>
                    <button type="button" className="btn-save-form" onClick={() => setUpgradeOpen(true)}>
                      Cambiar plan →
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-card">
                <div className="p-card-header">
                  <span className="p-card-title">Próximo cobro</span>
                </div>
                <div style={{ padding: '20px 0' }}>
                  <div style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 6 }}>Próxima fecha</div>
                  <div style={{ fontSize: 20, color: 'var(--text)', fontWeight: 700 }} id="nextBilling">
                    {nextBilling.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '18px 0' }} />
                  <div style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 6 }}>Método de pago</div>
                  <div style={{ fontSize: 14, color: 'var(--text)' }}>Tarjeta •••• 0000</div>
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
          <div className="modal-box" style={{ maxWidth: 520 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
              <div className="p-card" style={{ textAlign: 'center', padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Mensual</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 36, fontWeight: 800, color: '#fff' }}>99€</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>/mes</div>
                <a href="https://wa.me/+34628072072?text=Pro%20mensual" target="_blank" rel="noopener noreferrer" className="btn-save-form" style={{ display: 'flex', justifyContent: 'center', marginTop: 16, textDecoration: 'none' }}>
                  Contratar
                </a>
              </div>
              <div className="p-card" style={{ textAlign: 'center', padding: 18, borderColor: 'var(--em)', background: 'rgba(0,229,160,0.04)' }}>
                <div style={{ fontSize: 11, color: 'var(--em)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>⚡ Semestral</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 36, fontWeight: 800, color: '#fff' }}>81€</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>/mes · Total 480€</div>
                <div style={{ fontSize: 11, color: 'var(--em)', marginTop: 4 }}>Ahorras 114€</div>
                <a href="https://wa.me/+34628072072?text=Pro%20semestral" target="_blank" rel="noopener noreferrer" className="btn-save-form" style={{ display: 'flex', justifyContent: 'center', marginTop: 10, textDecoration: 'none' }}>
                  Contratar
                </a>
              </div>
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
