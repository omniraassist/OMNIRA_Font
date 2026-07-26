import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { apiCall } from '../../api/client.js';
import { canAccessDashboardPage } from '../../constants/plans.js';
import { LogoMark } from '../brand/LogoMark.jsx';
import { ModernCalendar } from './ModernCalendar.jsx';
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

function TemplatesPage({ leads, showToast, page }) {
  const [templates, setTemplates] = useState([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState(null);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (page !== 'templates') return;
    setTplLoading(true);
    apiCall('/api/customer/whatsapp/templates')
      .then((d) => setTemplates(Array.isArray(d?.templates) ? d.templates : []))
      .catch(() => {})
      .finally(() => setTplLoading(false));
  }, [page]);

  async function syncTemplates() {
    setSyncing(true);
    try {
      const d = await apiCall('/api/customer/whatsapp/templates/sync', { method: 'POST' });
      showToast(`${d.synced} plantillas sincronizadas`, 'ok');
      const d2 = await apiCall('/api/customer/whatsapp/templates');
      setTemplates(Array.isArray(d2?.templates) ? d2.templates : []);
    } catch (e) { showToast(e?.message || 'Error al sincronizar', 'error'); }
    finally { setSyncing(false); }
  }

  async function sendTemplate() {
    if (!selectedTpl || selectedLeads.length === 0) return;
    setSending(true);
    try {
      const d = await apiCall('/api/customer/whatsapp/templates/send', {
        method: 'POST',
        body: JSON.stringify({
          template_name: selectedTpl.template_name,
          language_code: selectedTpl.language_code || 'es',
          recipients: selectedLeads
        })
      });
      showToast(`Enviado: ${d.sent} ok · ${d.failed} fallidos`, 'ok');
      setSelectedLeads([]);
    } catch (e) { showToast(e?.message || 'Error al enviar', 'error'); }
    finally { setSending(false); }
  }

  const approvedTpls = templates.filter((t) => t.status === 'APPROVED');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="p-card">
        <div className="p-card-header">
          <span className="p-card-title">Plantillas aprobadas ({approvedTpls.length})</span>
          <button type="button" className="p-btn-sm" onClick={syncTemplates} disabled={syncing}>
            <i className={`fa-solid fa-rotate${syncing ? ' fa-spin' : ''}`} />
            {syncing ? ' Sincronizando…' : ' Sincronizar con Meta'}
          </button>
        </div>
        {tplLoading ? (
          <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Cargando…</div>
        ) : approvedTpls.length === 0 ? (
          <div className="p-empty">
            <i className="fa-brands fa-whatsapp" />
            <p>No hay plantillas aprobadas. Crea y aprueba plantillas en Meta Business Manager, luego pulsa "Sincronizar".</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {approvedTpls.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTpl(selectedTpl?.id === t.id ? null : t)}
                style={{
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${selectedTpl?.id === t.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: selectedTpl?.id === t.id ? 'var(--accent)11' : 'transparent'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>{t.template_name}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#10b98122', color: '#10b981', fontWeight: 600 }}>{t.category}</span>
                </div>
                {t.body_text && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>{t.body_text.slice(0, 120)}{t.body_text.length > 120 ? '…' : ''}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTpl && (
        <div className="p-card">
          <div className="p-card-header">
            <span className="p-card-title">Enviar "{selectedTpl.template_name}" a leads</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Selecciona los leads a los que quieres enviar esta plantilla:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {leads.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>No hay leads todavía.</div>
            ) : leads.map((l) => {
              const checked = selectedLeads.includes(l.wa_from);
              return (
                <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 0' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelectedLeads(checked
                      ? selectedLeads.filter((x) => x !== l.wa_from)
                      : [...selectedLeads, l.wa_from]
                    )}
                  />
                  <span style={{ fontSize: 13 }}>{l.name || `+${l.wa_from}`}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>+{l.wa_from}</span>
                </label>
              );
            })}
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className="btn-save-form"
              style={{ margin: 0 }}
              disabled={selectedLeads.length === 0 || sending}
              onClick={sendTemplate}
            >
              {sending ? 'Enviando…' : `Enviar a ${selectedLeads.length} lead${selectedLeads.length !== 1 ? 's' : ''}`}
            </button>
            <button type="button" style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setSelectedLeads(leads.map((l) => l.wa_from))}>
              Seleccionar todos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BotTestPage() {
  const [testHistory, setTestHistory] = useState([]);
  const [testInput, setTestInput] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [testHistory, testLoading]);

  async function sendTestMessage() {
    const msg = testInput.trim();
    if (!msg || testLoading) return;
    const newHistory = [...testHistory, { role: 'user', content: msg }];
    setTestHistory(newHistory);
    setTestInput('');
    setTestLoading(true);
    try {
      const data = await apiCall('/api/customer/bot/test', {
        method: 'POST',
        body: JSON.stringify({ message: msg, history: testHistory })
      });
      setTestHistory([...newHistory, { role: 'assistant', content: data.reply }]);
    } catch {
      setTestHistory([...newHistory, { role: 'assistant', content: '⚠️ Error al conectar con el bot.' }]);
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className="p-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 420, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {testHistory.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            <i className="fa-solid fa-comments" style={{ fontSize: 32, marginBottom: 10, display: 'block', opacity: 0.3 }} />
            Escribe un mensaje para ver cómo responde tu bot
          </div>
        )}
        {testHistory.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '75%', padding: '10px 14px',
              borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: m.role === 'user' ? 'var(--accent)' : 'var(--card-bg-2, rgba(255,255,255,0.06))',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
              fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {testLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: 'var(--card-bg-2, rgba(255,255,255,0.06))', fontSize: 13, color: 'var(--muted)' }}>
              <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 6 }} />escribiendo…
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', gap: 10 }}>
        <input
          className="form-input"
          style={{ flex: 1, margin: 0 }}
          placeholder="Escribe un mensaje de prueba..."
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTestMessage(); } }}
          disabled={testLoading}
        />
        <button
          type="button"
          className="btn-save-form"
          style={{ margin: 0, padding: '0 20px', minWidth: 80 }}
          onClick={sendTestMessage}
          disabled={testLoading || !testInput.trim()}
        >
          Enviar
        </button>
        {testHistory.length > 0 && (
          <button
            type="button"
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}
            onClick={() => setTestHistory([])}
            title="Limpiar conversación"
          >
            <i className="fa-solid fa-trash" />
          </button>
        )}
      </div>
    </div>
  );
}

export function Dashboard({ mockData = null }) {
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
  const [leads, setLeads] = useState([]);
  const [leadsExporting, setLeadsExporting] = useState(false);
  const [twilioNumber, setTwilioNumber] = useState(null);
  const [twilioUsage, setTwilioUsage] = useState(null);
  const [twilioConversations, setTwilioConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [convMessages, setConvMessages] = useState([]);
  const [convLoading, setConvLoading] = useState(false);
  const [allEvents, setAllEvents] = useState([]);
  const [calDate, setCalDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [events, setEvents] = useState([]);
  const [biz, setBiz] = useState({});
  const [bot, setBot] = useState({});
  const [waIsActive, setWaIsActive] = useState(false);
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
  const [waBizProfile, setWaBizProfile] = useState(null);
  const [waBizProfileSource, setWaBizProfileSource] = useState(null);
  const [waBizProfileForm, setWaBizProfileForm] = useState({ about: '', description: '', address: '', email: '', website: '', vertical: '' });
  const [waBizProfileLoading, setWaBizProfileLoading] = useState(false);
  const [waBizProfileSaving, setWaBizProfileSaving] = useState(false);
  const [waBizPhotoPreview, setWaBizPhotoPreview] = useState(null);
  const [waBizPhotoFile, setWaBizPhotoFile] = useState(null);
  const [waBizPhotoUploading, setWaBizPhotoUploading] = useState(false);
  const [convPackBuying, setConvPackBuying] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);

  const name = user?.businessName || user?.name || 'Cliente';
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const isPro = Boolean(user?.subscriptionActive);

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
    // Notifications — the panel call is authenticated (JWT) so the server
    // also auto-generates the daily ≤5-days-remaining warnings and the
    // expired notice when relevant. We still pass ?email= as a back-compat
    // fallback in case the token gets stripped somewhere along the way.
    try {
      const q = user?.email ? `?email=${encodeURIComponent(user.email)}` : '';
      const n = await apiCall(`/api/customer/notifications${q}`);
      setNotifications(Array.isArray(n.notifications) ? n.notifications : []);
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
    // Leads list
    try {
      const l = await apiCall('/api/customer/leads?limit=200');
      setLeads(Array.isArray(l?.leads) ? l.leads : []);
    } catch { /* ignore */ }
    // Twilio virtual number + usage + conversations
    try {
      const n = await apiCall('/api/customer/twilio-number');
      setTwilioNumber(n?.number || null);
    } catch { /* ignore */ }
    try {
      const u = await apiCall('/api/customer/twilio-usage');
      setTwilioUsage(u?.ok ? u : null);
    } catch { /* ignore */ }
    try {
      const c = await apiCall('/api/customer/twilio-conversations?limit=50');
      setTwilioConversations(Array.isArray(c?.conversations) ? c.conversations : []);
    } catch { /* ignore */ }
  }, [user?.email]);

  useEffect(() => {
    if (mockData) {
      if (mockData.stats)               setStats(mockData.stats);
      if (mockData.upcomingBookings)    setUpcomingBookings(mockData.upcomingBookings);
      if (mockData.latestPayment)       setLatestPayment(mockData.latestPayment);
      if (mockData.twilioNumber)        setTwilioNumber(mockData.twilioNumber);
      if (mockData.twilioUsage)         setTwilioUsage(mockData.twilioUsage);
      if (mockData.twilioConversations) setTwilioConversations(mockData.twilioConversations);
      if (mockData.bot)                 setBot(mockData.bot);
      return;
    }
    loadData();
  }, [loadData, mockData]);

  useEffect(() => {
    if (user?.subscription_plan_id && !canAccessDashboardPage(user.subscription_plan_id, page)) {
      setPage('dash');
    }
  }, [user?.subscription_plan_id, page]);

  useEffect(() => {
    if (page !== 'calendar') return;
    let cancelled = false;
    apiCall('/api/customer/events')
      .catch(() => [])
      .then((ev) => {
        if (!cancelled) setEvents(Array.isArray(ev) ? ev : []);
      });
    return () => { cancelled = true; };
  }, [page, calDate]);

  const toastTimerRef = useRef(null);
  const waBizPhotoInputRef = useRef(null);
  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast({ msg: '', type: '' }), 3500);
  }, []);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pack_success') === '1') {
      showToast('¡Pack de conversaciones activado! Ya puedes usarlas.', 'success');
      window.history.replaceState({}, '', window.location.pathname);
      loadConvUsage();
    } else if (params.get('pack_cancel') === '1') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWaBizProfile = useCallback(async () => {
    setWaBizProfileLoading(true);
    try {
      const data = await apiCall('/api/customer/whatsapp-profile');
      if (data?.ok) {
        setWaBizProfile(data.profile || {});
        setWaBizProfileSource(data.source || null);
        setWaBizProfileForm({
          about: data.profile?.about || '',
          description: data.profile?.description || '',
          address: data.profile?.address || '',
          email: data.profile?.email || '',
          website: data.profile?.websites?.[0] || '',
          vertical: data.profile?.vertical || '',
        });
      }
    } catch { /* ignore */ }
    setWaBizProfileLoading(false);
  }, []);

  const loadConvUsage = useCallback(async () => {
    try {
      const data = await apiCall('/api/customer/twilio-usage');
      if (data?.ok) setTwilioUsage(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (page === 'whatsapp') { loadWaBizProfile(); loadConvUsage(); }
  }, [page, loadWaBizProfile, loadConvUsage]);

  const buyConvPack = async (packId) => {
    setConvPackBuying(true);
    try {
      const data = await apiCall('/api/customer/conversation-pack/checkout', {
        method: 'POST',
        body: JSON.stringify({ packId }),
      });
      if (data?.ok && data.url) {
        window.location.href = data.url;
      } else {
        showToast(data?.message || 'Error al procesar el pago', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Error al conectar con el servidor', 'error');
    }
    setConvPackBuying(false);
  };

  const saveWaBizProfile = async (e) => {
    e.preventDefault();
    setWaBizProfileSaving(true);
    try {
      const data = await apiCall('/api/customer/whatsapp-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          about: waBizProfileForm.about,
          description: waBizProfileForm.description,
          address: waBizProfileForm.address,
          email: waBizProfileForm.email,
          websites: waBizProfileForm.website ? [waBizProfileForm.website] : [],
          vertical: waBizProfileForm.vertical || undefined,
        }),
      });
      if (data?.ok) {
        if (data.synced) {
          showToast('Perfil sincronizado con WhatsApp Business', 'success');
        } else {
          showToast(data.warning || 'Guardado localmente', 'success');
        }
      } else {
        showToast(data?.message || 'Error al guardar el perfil', 'error');
      }
    } catch {
      showToast('Error al guardar el perfil', 'error');
    }
    setWaBizProfileSaving(false);
  };

  const onWaBizPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWaBizPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setWaBizPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const uploadWaBizPhoto = async () => {
    if (!waBizPhotoFile) return;
    setWaBizPhotoUploading(true);
    try {
      const canvas = document.createElement('canvas');
      const img = new Image();
      const objectUrl = URL.createObjectURL(waBizPhotoFile);
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = objectUrl; });
      const MAX = 640;
      const scale = Math.min(1, MAX / img.width, MAX / img.height);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
      const data = await apiCall('/api/customer/whatsapp-profile/photo', {
        method: 'POST',
        body: JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg' }),
      });
      if (data?.ok) {
        showToast('Foto de perfil actualizada en WhatsApp', 'success');
        setWaBizPhotoFile(null);
      } else {
        showToast(data?.message || 'Error al subir la foto', 'error');
      }
    } catch {
      showToast('Error al procesar la imagen', 'error');
    }
    setWaBizPhotoUploading(false);
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

  const openConv = async (conv) => {
    setSelectedConv(conv);
    setConvMessages([]);
    setConvLoading(true);
    try {
      const data = await apiCall(`/api/customer/twilio-messages?from=${encodeURIComponent(conv.wa_from)}&limit=200`);
      setConvMessages(data.messages || []);
    } catch {
      setConvMessages([]);
    } finally {
      setConvLoading(false);
    }
  };

  const openAddModal = (dateStr, timeStr) => {
    setEvForm({
      id: '',
      name: '',
      date: dateStr || new Date().toISOString().split('T')[0],
      time: timeStr || '10:00',
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
          throw new Error('El formato .doc antiguo no se puede leer en el navegador. Sube un archivo .docx.');
        } else {
          throw new Error('Formato no compatible');
        }

        const normalized = (text || '').trim();
        if (!normalized) throw new Error('No se encontró texto legible en el archivo');

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
      showToast('Entrenamiento guardado', 'success');
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
              <img src="/logo.svg" alt="Omnira" height={36} style={{ display: 'block' }} />
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
                <i className="fa-solid fa-calendar-check" /> Reservas
              </button>
              <button type="button" className={`p-nav-item${page === 'convs' ? ' active' : ''}`} onClick={() => openNavPage('convs')}>
                <i className="fa-brands fa-whatsapp" /> Conversaciones
              </button>
              <button type="button" className={`p-nav-item${page === 'leads' ? ' active' : ''}`} onClick={() => openNavPage('leads')}>
                <i className="fa-solid fa-users" /> Leads
              </button>
              <button type="button" className={`p-nav-item${page === 'templates' ? ' active' : ''}`} onClick={() => openNavPage('templates')}>
                <i className="fa-solid fa-paper-plane" /> Plantillas WA
              </button>
              <button type="button" className={`p-nav-item${page === 'stats' ? ' active' : ''}`} onClick={() => openNavPage('stats')}>
                <i className="fa-solid fa-chart-line" /> Estadísticas
              </button>
            </div>
            <div className="p-nav-section">
              <div className="p-nav-label">Configuración</div>
              <button type="button" className={`p-nav-item${page === 'negocio' ? ' active' : ''}`} onClick={() => openNavPage('negocio')}>
                <i className="fa-solid fa-building" /> Mi Negocio
              </button>
              <button type="button" className={`p-nav-item${page === 'whatsapp' ? ' active' : ''}`} onClick={() => openNavPage('whatsapp')}>
                <i className="fa-brands fa-whatsapp" /> WhatsApp
              </button>
              <button type="button" className={`p-nav-item${page === 'knowledge' ? ' active' : ''}`} onClick={() => openNavPage('knowledge')}>
                <i className="fa-solid fa-robot" /> Entrenar Chatbot
              </button>
              <button type="button" className={`p-nav-item${page === 'bottest' ? ' active' : ''}`} onClick={() => openNavPage('bottest')}>
                <i className="fa-solid fa-flask" /> Probar Bot
              </button>
              <button type="button" className={`p-nav-item${page === 'factura' ? ' active' : ''}`} onClick={() => openNavPage('factura')}>
                <i className="fa-solid fa-credit-card" /> Facturación
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
          {/* Sticky top bar — always-visible notification bell + dropdown */}
          <style>{`
            /* Sticky top bar — fully transparent so the page content reads
               through it without the dark "shade" that was making the
               welcome line + cards behind look dimmed on scroll. The bell
               carries its own background, so it stays legible on its own. */
            .p-tb {
              position: sticky; top: 0; z-index: 50;
              display: flex; align-items: center; justify-content: flex-end;
              gap: 12px;
              padding: 12px 16px;
              background: transparent;
              border-bottom: 0;
              margin: -16px -16px 18px;
              pointer-events: none;
            }
            .p-tb > * { pointer-events: auto; }
            @media (max-width: 720px) { .p-tb { margin: -12px -12px 14px; padding: 10px 12px; } }
            .p-tb-bell {
              position: relative;
              width: 38px; height: 38px;
              display: inline-flex; align-items: center; justify-content: center;
              background: rgba(255,255,255,0.04);
              border: 1px solid var(--border, rgba(255,255,255,0.06));
              border-radius: 12px;
              color: var(--soft, #8fa3c0);
              cursor: pointer;
              transition: all .15s ease;
            }
            .p-tb-bell:hover { color: var(--em); border-color: rgba(0,229,160,0.30); background: rgba(0,229,160,0.06); }
            .p-tb-bell .dot {
              position: absolute; top: 8px; right: 8px;
              min-width: 16px; height: 16px;
              padding: 0 4px;
              border-radius: 999px;
              background: linear-gradient(135deg, var(--em), #34d399);
              color: #00120a;
              font-size: 10px; font-weight: 700;
              display: inline-flex; align-items: center; justify-content: center;
              border: 2px solid #0a0f17;
              animation: p-pulse 2.4s ease-in-out infinite;
            }
            @keyframes p-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(0,229,160,0); } 50% { box-shadow: 0 0 0 4px rgba(0,229,160,0.20); } }

            .p-tb-panel {
              position: absolute; right: 16px; top: 64px;
              width: 380px; max-width: calc(100vw - 32px);
              background: #0c1220;
              border: 1px solid rgba(255,255,255,0.08);
              border-radius: 14px;
              box-shadow: 0 24px 60px rgba(0,0,0,0.55);
              overflow: hidden;
              z-index: 60;
              animation: p-tb-in .15s ease-out;
            }
            @keyframes p-tb-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
            .p-tb-panel-head {
              display: flex; justify-content: space-between; align-items: center;
              padding: 14px 16px;
              border-bottom: 1px solid rgba(255,255,255,0.06);
            }
            .p-tb-panel-head strong { color: var(--text, #e2eaf4); font-size: 14px; }
            .p-tb-panel-head span { color: var(--muted, #4d6080); font-size: 11px; font-family: monospace; }
            .p-tb-list { max-height: 440px; overflow-y: auto; }
            .p-tb-item {
              padding: 12px 16px;
              border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
              transition: background .12s ease;
              position: relative;
            }
            .p-tb-item:last-child { border-bottom: 0; }
            .p-tb-item:hover { background: rgba(255,255,255,0.03); }
            .p-tb-item.system { background: rgba(0,229,160,0.04); }
            .p-tb-item.warn { background: rgba(251,191,36,0.05); }
            .p-tb-item.danger { background: rgba(239,68,68,0.05); }
            .p-tb-item strong {
              display: block; font-size: 13px;
              color: var(--text, #e2eaf4);
              margin-bottom: 4px;
              padding-right: 8px;
            }
            .p-tb-item p {
              margin: 0 0 6px;
              font-size: 12px;
              color: var(--soft, #8fa3c0);
              line-height: 1.55;
            }
            .p-tb-item .ts {
              font-family: monospace;
              font-size: 10px;
              color: var(--muted, #4d6080);
            }
            .p-tb-empty {
              padding: 32px 20px;
              text-align: center;
              color: var(--muted, #4d6080);
              font-size: 13px;
            }
          `}</style>
          <div className="p-tb">
            <button
              type="button"
              className="p-tb-bell"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Notificaciones"
              aria-expanded={notifOpen}
            >
              <i className="fa-solid fa-bell" />
              {notifications.length > 0 ? (
                <span className="dot">{notifications.length > 9 ? '9+' : notifications.length}</span>
              ) : null}
            </button>
            {notifOpen ? (
              <div className="p-tb-panel" role="dialog" aria-label="Notificaciones">
                <div className="p-tb-panel-head">
                  <strong>Notificaciones</strong>
                  <span>{notifications.length} total</span>
                </div>
                <div className="p-tb-list">
                  {notifications.length === 0 ? (
                    <div className="p-tb-empty">No tienes notificaciones todavía.</div>
                  ) : (
                    notifications.map((n) => {
                      const cb = String(n.created_by || '');
                      const cls = cb.startsWith('system:expired')
                        ? 'danger'
                        : cb.startsWith('system:expiry-')
                          ? 'warn'
                          : cb.startsWith('system:purchase')
                            ? 'system'
                            : '';
                      const diff = Date.now() - new Date(n.created_at).getTime();
                      const ago = diff < 60_000
                        ? 'ahora'
                        : diff < 3_600_000
                          ? `hace ${Math.round(diff / 60_000)} min`
                          : diff < 86_400_000
                            ? `hace ${Math.round(diff / 3_600_000)} h`
                            : `hace ${Math.round(diff / 86_400_000)} d`;
                      return (
                        <div key={n.id} className={`p-tb-item ${cls}`}>
                          <strong>{n.title}</strong>
                          <p>{n.message}</p>
                          <span className="ts">{ago}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
          {(() => {
            const daysLeft = user?.subscription_ends_at ? subscriptionDaysLeft(user.subscription_ends_at) : 0;
            const expired = user?.subscription_ends_at && new Date(user.subscription_ends_at) <= new Date();
            const lowDays = !expired && daysLeft <= 7;
            if (!user?.subscription_ends_at && !user?.subscriptionActive) {
              // No subscription info at all → don't render banner
              return null;
            }
            const accentBg = expired
              ? 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(239,68,68,0.05))'
              : lowDays
                ? 'linear-gradient(135deg, rgba(251,191,36,0.20), rgba(251,191,36,0.04))'
                : undefined;
            const accentBorder = expired
              ? 'rgba(239,68,68,0.45)'
              : lowDays
                ? 'rgba(251,191,36,0.45)'
                : undefined;
            const daysColor = expired ? '#fca5a5' : lowDays ? '#fde68a' : undefined;
            return (
              <div
                className="p-subscription-banner"
                role="status"
                style={{
                  ...(accentBg ? { background: accentBg } : {}),
                  ...(accentBorder ? { borderColor: accentBorder } : {}),
                  position: 'relative',
                }}
              >
                <div className="p-subscription-banner-shine" aria-hidden />
                <div className="p-subscription-banner-content">
                  <span className="p-subscription-badge" style={daysColor ? { color: daysColor, borderColor: daysColor } : undefined}>
                    <i className={`fa-solid ${expired ? 'fa-triangle-exclamation' : 'fa-gem'}`} />
                    {expired ? 'Plan expirado' : planDisplayName(user.subscription_plan_id)}
                  </span>
                  <div className="p-subscription-countdown">
                    <span className="p-subscription-days" style={daysColor ? { color: daysColor } : undefined}>
                      {expired ? '0' : daysLeft}
                    </span>
                    <span className="p-subscription-days-label">
                      {expired ? 'tu agente está pausado' : daysLeft === 1 ? 'día restante' : 'días restantes'}
                    </span>
                  </div>
                  <div className="p-subscription-until">
                    {expired ? (
                      <>
                        Tu WhatsApp dejó de responder.{' '}
                        <button
                          type="button"
                          onClick={() => setUpgradeOpen(true)}
                          style={{
                            background: 'none', border: 0, color: 'var(--em)',
                            fontWeight: 700, cursor: 'pointer', textDecoration: 'underline',
                          }}
                        >
                          Renovar plan →
                        </button>
                      </>
                    ) : (
                      <>
                        Acceso hasta el{' '}
                        <strong>
                          {new Date(user.subscription_ends_at).toLocaleDateString('es-ES', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </strong>
                        {lowDays ? (
                          <>
                            {' · '}
                            <button
                              type="button"
                              onClick={() => setUpgradeOpen(true)}
                              style={{
                                background: 'none', border: 0, color: 'var(--em)',
                                fontWeight: 700, cursor: 'pointer', textDecoration: 'underline',
                              }}
                            >
                              Renovar ahora
                            </button>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          <div id="page-dash" className={`p-page${page === 'dash' ? ' active' : ''}`}>
            {/* Setup checklist — shown until all 3 steps are complete */}
            {!mockData && (() => {
              const setupItems = [
                { key: 'biz', label: 'Info del negocio configurada', done: Boolean(biz.name), page: 'negocio', icon: 'fa-building' },
                { key: 'bot', label: 'Bot personalizado', done: Boolean(bot.greeting || bot.instructions), page: 'knowledge', icon: 'fa-robot' },
                { key: 'wa', label: 'Número de WhatsApp activo', done: Boolean(twilioNumber), page: 'whatsapp', icon: 'fa-brands fa-whatsapp' },
              ];
              const doneCount = setupItems.filter((i) => i.done).length;
              if (doneCount === setupItems.length) return null;
              const pct = Math.round((doneCount / setupItems.length) * 100);
              return (
                <div className="p-card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(96,165,250,0.06) 0%, rgba(0,229,160,0.04) 100%)', borderColor: 'rgba(96,165,250,0.22)' }}>
                  <div className="p-card-header" style={{ marginBottom: 10 }}>
                    <span className="p-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="fa-solid fa-rocket" style={{ color: 'var(--em)', fontSize: 14 }} />
                      Completa tu configuración
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{doneCount}/{setupItems.length} pasos</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', marginBottom: 14, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: 'linear-gradient(90deg, var(--em), #93c5fd)', transition: 'width .5s ease' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {setupItems.map((item) => (
                      <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: item.done ? 'rgba(0,229,160,0.15)' : 'rgba(255,255,255,0.04)',
                          border: `1.5px solid ${item.done ? 'rgba(0,229,160,0.40)' : 'rgba(255,255,255,0.08)'}`,
                          fontSize: 12,
                          color: item.done ? 'var(--em)' : 'var(--muted)',
                        }}>
                          {item.done
                            ? <i className="fa-solid fa-check" />
                            : <i className={`fa-solid ${item.icon}`} />}
                        </div>
                        <span style={{ flex: 1, fontSize: 13, color: item.done ? 'var(--soft)' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.6 : 1 }}>
                          {item.label}
                        </span>
                        {!item.done && (
                          <button
                            type="button"
                            onClick={() => showPage(item.page)}
                            style={{ background: 'none', border: '1px solid rgba(0,229,160,0.30)', borderRadius: 7, padding: '3px 10px', color: 'var(--em)', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                          >
                            Configurar →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
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
                <div className="bot-live-badge" id="dashBotBadge" style={{ display: twilioNumber ? 'inline-flex' : 'none' }}>
                  <div className="bot-live-dot" /> Bot activo
                </div>
              </div>
            </div>
            {notifOpen && (
              <div className="p-card" style={{ marginBottom: 16 }}>
                <div className="p-card-header">
                  <span className="p-card-title">Notificaciones</span>
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
                    <p>Sin notificaciones</p>
                  </div>
                )}
              </div>
            )}
            {twilioNumber ? (
              <div className="p-card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(0,229,160,0.07) 0%, rgba(0,229,160,0.02) 100%)', borderColor: 'rgba(0,229,160,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--em) 0%, #34d399 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📱</div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--em)', marginBottom: 2 }}>Tu número de WhatsApp</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{twilioNumber.phone_number}</div>
                    </div>
                  </div>
                  {twilioUsage && (
                    <div style={{ minWidth: 160 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--soft)', marginBottom: 4 }}>
                        <span>Conversaciones este mes</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{twilioUsage.used}/{twilioUsage.limit}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--em), #34d399)', width: `${Math.min(100, Math.round((twilioUsage.used / twilioUsage.limit) * 100))}%`, transition: 'width .5s ease' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

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
            <p className="p-page-sub">
              Visualiza tus reservas hora por hora. Cambia entre vista mes, semana y día.
            </p>
            <ModernCalendar events={events} onAdd={openAddModal} onEdit={openEditModal} />
          </div>

          <div id="page-booking" className={`p-page${page === 'booking' ? ' active' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '32px' }}>
              <div>
                <h1 className="p-page-title">Reservas</h1>
                <p className="p-page-sub" style={{ marginBottom: 0 }}>
                  Gestiona todas tus citas desde un solo lugar.
                </p>
              </div>
              <button type="button" className="cal-add-btn" onClick={() => openAddModal()}>
                <i className="fa-solid fa-plus" /> Nueva reserva
              </button>
            </div>
            <div className="p-card">
              <div className="p-card-header">
                <span className="p-card-title">Todas las reservas</span>
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
              Todos los hilos de WhatsApp recibidos en tu número Omnira.
            </p>
            {(() => {
              const convs = twilioConversations.length ? twilioConversations : recentConversations;
              return (
                <div className="p-card">
                  <div className="p-card-header">
                    <span className="p-card-title">{convs.length} conversaciones</span>
                    {twilioUsage && (
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>
                        {twilioUsage.used}/{twilioUsage.limit} este mes
                      </span>
                    )}
                  </div>
                  {convs.length === 0 ? (
                    <div className="p-empty">
                      <i className="fa-brands fa-whatsapp" />
                      <p>Las conversaciones aparecerán cuando tu bot reciba mensajes</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {convs.map((c) => {
                        const cname = c.lead?.name || `+${c.wa_from}`;
                        const cinits = cname.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                        return (
                          <div key={`${c.phone_number_id || ''}|${c.wa_from}`} className="p-res-item" style={{ alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => openConv(c)}>
                            <div className="p-res-av">{cinits}</div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="p-res-name">{cname}</div>
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
              );
            })()}
          </div>

          <div id="page-leads" className={`p-page${page === 'leads' ? ' active' : ''}`}>
            <h1 className="p-page-title">Leads</h1>
            <p className="p-page-sub">Contactos captados automáticamente por tu bot de WhatsApp.</p>
            <div className="p-card">
              <div className="p-card-header">
                <span className="p-card-title">{leads.length} leads</span>
                <button
                  type="button"
                  className="p-btn-sm"
                  disabled={leadsExporting || leads.length === 0}
                  onClick={async () => {
                    setLeadsExporting(true);
                    try {
                      const token = localStorage.getItem('omnira_customer_token');
                      const { API_BASE } = await import('../../constants/site.js');
                      const res = await fetch(`${API_BASE}/api/customer/leads/export`, {
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      if (!res.ok) throw new Error('Export failed');
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `omnira-leads-${new Date().toISOString().slice(0,10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      showToast('Error al exportar leads', 'error');
                    } finally {
                      setLeadsExporting(false);
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="fa-solid fa-download" />
                  {leadsExporting ? 'Exportando…' : 'Exportar CSV'}
                </button>
              </div>
              {leads.length === 0 ? (
                <div className="p-empty">
                  <i className="fa-solid fa-users" />
                  <p>Los leads aparecerán cuando tu bot capture contactos en WhatsApp</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {leads.map((l) => {
                    const display = l.name || `+${l.wa_from}`;
                    const initials = display.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                    const statusColor = { new: '#6b7280', contacted: '#3b82f6', qualified: '#f59e0b', converted: '#10b981', lost: '#ef4444' }[l.status] || '#6b7280';
                    return (
                      <div key={l.id} className="p-res-item" style={{ alignItems: 'flex-start' }}>
                        <div className="p-res-av">{initials}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="p-res-name">{display}</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3, fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                            {l.email && <span>{l.email}</span>}
                            {l.phone && <span>{l.phone}</span>}
                            {!l.email && !l.phone && <span>+{l.wa_from}</span>}
                            {l.intent && <><span>·</span><span>{l.intent}</span></>}
                            {l.language && <><span>·</span><span>{l.language}</span></>}
                            <span>·</span><span>{l.message_count} msg</span>
                          </div>
                        </div>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: statusColor + '22', color: statusColor, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {l.status}
                        </span>
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
                    <textarea className="form-input" rows={3} value={biz.hours || ''} onChange={(e) => setBiz({ ...biz, hours: e.target.value })} style={{ resize: 'vertical', fontFamily: "'Plus Jakarta Sans',sans-serif" }} placeholder={'Lunes a Viernes: 9:00 - 20:00\nSábado: 10:00 - 14:00'} />
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Servicios y precios</label>
                    <textarea className="form-input" rows={4} value={biz.services || ''} onChange={(e) => setBiz({ ...biz, services: e.target.value })} style={{ resize: 'vertical', fontFamily: "'Plus Jakarta Sans',sans-serif" }} placeholder={'Limpieza dental — 60€ — 30 min\nEmpaste — 80€ — 45 min'} />
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
                      <div style={{ fontFamily: "'Geist',sans-serif", fontSize: 42, fontWeight: 800, color: 'var(--em)' }}>
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
                  <span className="p-card-title">Renovación</span>
                  {user?.stripe_subscription_id && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#10b98122', color: '#10b981', fontWeight: 600 }}>
                      Auto-renovación activa
                    </span>
                  )}
                </div>
                <div style={{ padding: '20px 0' }}>
                  <div style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 6 }}>
                    {user?.stripe_subscription_id ? 'Se renueva el' : 'Acceso hasta'}
                  </div>
                  <div style={{ fontSize: 20, color: 'var(--text)', fontWeight: 700 }}>
                    {user?.subscription_ends_at
                      ? new Date(user.subscription_ends_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'Sin suscripción activa'}
                  </div>
                  {user?.stripe_subscription_id ? (
                    <div style={{ marginTop: 16 }}>
                      <button
                        type="button"
                        style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                        onClick={async () => {
                          if (!window.confirm('¿Cancelar la renovación automática? Tu plan seguirá activo hasta la fecha de vencimiento.')) return;
                          try {
                            await apiCall('/api/customer/stripe/subscription/cancel', { method: 'POST' });
                            showToast('Renovación cancelada. Tu plan sigue activo hasta la fecha indicada.', 'ok');
                            await loadData();
                          } catch { showToast('Error al cancelar. Inténtalo de nuevo.', 'error'); }
                        }}
                      >
                        Cancelar renovación automática
                      </button>
                    </div>
                  ) : user?.subscriptionActive ? (
                    <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
                      Pago único · No se renueva automáticamente
                    </div>
                  ) : null}
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

          {/* WhatsApp Templates */}
          <div id="page-templates" className={`p-page${page === 'templates' ? ' active' : ''}`}>
            <h1 className="p-page-title">Plantillas WhatsApp</h1>
            <p className="p-page-sub">Envía mensajes proactivos a tus leads usando plantillas aprobadas por Meta.</p>
            <TemplatesPage leads={leads} showToast={showToast} page={page} />
          </div>

          {/* Bot testing tool — live chat simulation */}
          <div id="page-bottest" className={`p-page${page === 'bottest' ? ' active' : ''}`}>
            <h1 className="p-page-title">Probar Bot</h1>
            <p className="p-page-sub">Prueba cómo responde tu agente sin enviar ningún WhatsApp real.</p>
            <BotTestPage />
          </div>

          {/* Single chatbot training page — greeting + instructions + knowledge base, one save */}
          <div id="page-knowledge" className={`p-page${page === 'knowledge' ? ' active' : ''}`}>
            <h1 className="p-page-title">Entrenar Chatbot</h1>
            <p className="p-page-sub">
              Todo el entrenamiento de tu agente en un solo sitio: mensaje de bienvenida, instrucciones y base
              de conocimiento. Rellena lo que quieras y pulsa <strong>Guardar entrenamiento</strong>.
            </p>
            <div className="p-card">
              <div className="form-group">
                <label className="form-label">Mensaje de bienvenida</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={bot.greeting || ''}
                  onChange={(e) => setBot({ ...bot, greeting: e.target.value })}
                  style={{ resize: 'vertical', fontFamily: "'Plus Jakarta Sans',sans-serif" }}
                  placeholder="¡Hola! Soy el asistente de [Negocio]. ¿En qué puedo ayudarte?"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Instrucciones especiales</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={bot.instructions || bot.instr || ''}
                  onChange={(e) => setBot({ ...bot, instructions: e.target.value })}
                  style={{ resize: 'vertical', fontFamily: "'Plus Jakarta Sans',sans-serif" }}
                  placeholder="Tono, reglas, qué debe y qué no debe decir el agente..."
                />
              </div>

              <div className="panel-kb-wrap" style={{ marginTop: 4 }}>
                <div className="panel-kb-head">
                  <h3>Base de conocimiento</h3>
                  <p>
                    Sube `txt`, `docx`, `pdf`, `xlsx` o escribe manualmente FAQs, servicios, precios y políticas
                    sobre los que responderá tu agente.
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
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn-save-form" onClick={saveKnowledgeBase}>
                  <i className="fa-solid fa-floppy-disk" /> Guardar entrenamiento
                </button>
              </div>
            </div>
          </div>

          {/* WhatsApp page — Meta Business credentials + activation (paid customers only) */}
          <div id="page-whatsapp" className={`p-page${page === 'whatsapp' ? ' active' : ''}`}>
            <h1 className="p-page-title">Mi número de WhatsApp</h1>
            <p className="p-page-sub">
              Omnira te asigna un número de WhatsApp Business exclusivo. Compártelo con tus clientes — el bot responde automáticamente 24/7.
            </p>
            <div className="p-card" style={{ marginBottom: 16 }}>
              <div className="p-card-header">
                <span className="p-card-title">Número asignado</span>
                <span className="p-status" style={{ background: twilioNumber ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.05)', color: twilioNumber ? 'var(--em)' : 'var(--muted)' }}>
                  {twilioNumber ? '● activo' : '⏳ asignando…'}
                </span>
              </div>
              {twilioNumber ? (
                <div style={{ padding: '12px 0' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 32, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                    {twilioNumber.phone_number}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--soft)', lineHeight: 1.6, marginBottom: 16 }}>
                    Comparte este número en tu web, Instagram o tarjeta de visita. Todos los mensajes que reciba serán respondidos por tu agente Omnira.
                  </div>
                  {twilioUsage && (() => {
                    const pct = Math.min(100, Math.round((twilioUsage.used / twilioUsage.limit) * 100));
                    const isNear = pct >= 80;
                    const isOver = twilioUsage.used >= twilioUsage.limit;
                    return (
                      <div style={{ maxWidth: 400 }}>
                        {isOver && (
                          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#f87171', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <i className="fa-solid fa-triangle-exclamation" style={{ marginTop: 2, flexShrink: 0 }} />
                            <span>Has alcanzado el límite de conversaciones de tu plan. {twilioUsage.extraBalance > 0 ? `Tienes ${twilioUsage.extraBalance} conversaciones extra disponibles.` : 'Compra un pack para seguir atendiendo nuevos contactos.'}</span>
                          </div>
                        )}
                        {isNear && !isOver && (
                          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#fbbf24', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <i className="fa-solid fa-circle-exclamation" style={{ marginTop: 2, flexShrink: 0 }} />
                            <span>Llevas el {pct}% de las conversaciones de tu plan. Compra un pack antes de llegar al límite.</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--soft)', marginBottom: 6 }}>
                          <span>Conversaciones este mes</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text)', fontWeight: 600 }}>{twilioUsage.used} / {twilioUsage.limit}</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 999,
                            background: isOver ? '#ef4444' : isNear ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, var(--em), #34d399)',
                            width: `${pct}%`,
                            transition: 'width .5s ease'
                          }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            Se reinicia el 1 de cada mes
                            {twilioUsage.extraBalance > 0 && <span style={{ color: 'var(--em)', marginLeft: 6 }}>· +{twilioUsage.extraBalance} extra</span>}
                          </div>
                          <button
                            type="button"
                            style={{ background: 'rgba(0,229,160,0.12)', border: '1px solid var(--em)', color: 'var(--em)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                            onClick={() => setShowPackModal(true)}
                          >
                            <i className="fa-solid fa-plus" /> Comprar pack
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="p-empty">
                  <i className="fa-brands fa-whatsapp" />
                  <p>Tu número se está asignando. Aparecerá aquí en breve.</p>
                </div>
              )}
            </div>
            <div className="p-card" style={{ marginBottom: 16 }}>
              <div className="p-card-header">
                <span className="p-card-title">Perfil de WhatsApp Business</span>
                {waBizProfileLoading && <span style={{ fontSize: 12, color: 'var(--muted)' }}><i className="fa-solid fa-circle-notch fa-spin" /></span>}
              </div>
              {waBizProfileSource === 'local' && (
                <div style={{ background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#f0b400', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <i className="fa-solid fa-circle-info" style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>Los cambios se guardan localmente. Para sincronizarlos con WhatsApp Business, configura tus credenciales de Meta en <strong style={{ color: '#f5c518' }}>Ajustes de WhatsApp</strong>.</span>
                </div>
              )}
              <form onSubmit={saveWaBizProfile}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                    <div
                      style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
                      onClick={() => waBizPhotoInputRef.current?.click()}
                      title="Cambiar foto de perfil"
                    >
                      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '2px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {(waBizPhotoPreview || waBizProfile?.profile_picture_url) ? (
                          <img src={waBizPhotoPreview || waBizProfile.profile_picture_url} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <i className="fa-solid fa-store" style={{ fontSize: 26, color: 'var(--muted)' }} />
                        )}
                      </div>
                      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--em)', color: '#00120a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                        <i className="fa-solid fa-camera" />
                      </div>
                    </div>
                    <input ref={waBizPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={onWaBizPhotoChange} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Foto de perfil</div>
                      <div style={{ fontSize: 12, color: 'var(--soft)', marginBottom: waBizPhotoFile ? 8 : 0 }}>JPG, PNG o WebP · máx. 5 MB · visible para tus contactos en WhatsApp</div>
                      {waBizPhotoFile && (
                        <button type="button" className="btn-save-form" style={{ margin: 0, padding: '6px 14px', fontSize: 12 }} onClick={uploadWaBizPhoto} disabled={waBizPhotoUploading}>
                          {waBizPhotoUploading ? <><i className="fa-solid fa-circle-notch fa-spin" /> Subiendo…</> : <><i className="fa-solid fa-upload" /> Subir foto</>}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="settings-2col">
                    <div className="form-group full">
                      <label className="form-label">
                        Estado / About
                        <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>{waBizProfileForm.about.length}/139</span>
                      </label>
                      <input
                        className="form-input"
                        maxLength={139}
                        value={waBizProfileForm.about}
                        onChange={(e) => setWaBizProfileForm({ ...waBizProfileForm, about: e.target.value })}
                        placeholder="Atención al cliente 24/7 · Reservas y consultas por WhatsApp"
                      />
                    </div>
                    <div className="form-group full">
                      <label className="form-label">Descripción del negocio</label>
                      <textarea
                        className="form-input"
                        rows={2}
                        style={{ resize: 'vertical', fontFamily: "'Plus Jakarta Sans',sans-serif" }}
                        value={waBizProfileForm.description}
                        onChange={(e) => setWaBizProfileForm({ ...waBizProfileForm, description: e.target.value })}
                        placeholder="Describe brevemente tu empresa o servicio"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Dirección</label>
                      <input
                        className="form-input"
                        value={waBizProfileForm.address}
                        onChange={(e) => setWaBizProfileForm({ ...waBizProfileForm, address: e.target.value })}
                        placeholder="Calle Mayor 12, Madrid"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email de contacto</label>
                      <input
                        className="form-input"
                        type="email"
                        value={waBizProfileForm.email}
                        onChange={(e) => setWaBizProfileForm({ ...waBizProfileForm, email: e.target.value })}
                        placeholder="hola@tunegocio.com"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sitio web</label>
                      <input
                        className="form-input"
                        type="url"
                        value={waBizProfileForm.website}
                        onChange={(e) => setWaBizProfileForm({ ...waBizProfileForm, website: e.target.value })}
                        placeholder="https://tunegocio.com"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Categoría de negocio</label>
                      <select
                        className="form-input"
                        value={waBizProfileForm.vertical}
                        onChange={(e) => setWaBizProfileForm({ ...waBizProfileForm, vertical: e.target.value })}
                        style={{ cursor: 'pointer' }}
                      >
                        <option value="">Seleccionar…</option>
                        <option value="AUTO">Automoción</option>
                        <option value="BEAUTY">Belleza y estética</option>
                        <option value="APPAREL">Moda y ropa</option>
                        <option value="EDU">Educación</option>
                        <option value="ENTERTAIN">Entretenimiento</option>
                        <option value="EVENT_PLAN">Eventos</option>
                        <option value="FINANCE">Finanzas</option>
                        <option value="GROCERY">Alimentación</option>
                        <option value="GOVT">Administración pública</option>
                        <option value="HOTEL">Hostelería y turismo</option>
                        <option value="HEALTH">Salud y bienestar</option>
                        <option value="NONPROFIT">Sin ánimo de lucro</option>
                        <option value="PROF_SERVICES">Servicios profesionales</option>
                        <option value="RETAIL">Comercio</option>
                        <option value="TRAVEL">Viajes</option>
                        <option value="RESTAURANT">Restauración</option>
                        <option value="OTHER">Otro</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="submit" className="btn-save-form" disabled={waBizProfileSaving}>
                      {waBizProfileSaving
                        ? <><i className="fa-solid fa-circle-notch fa-spin" /> Guardando…</>
                        : <><i className="fa-solid fa-floppy-disk" /> Guardar perfil</>}
                    </button>
                  </div>
                </form>
            </div>

            <div className="p-card">
              <div className="p-card-header"><span className="p-card-title">¿Cómo funciona?</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
                {[
                  ['1', 'Tu cliente escribe a tu número de WhatsApp', 'El mensaje llega directamente a tu bot Omnira.'],
                  ['2', 'El bot responde automáticamente con IA', 'Usa la información de tu negocio para dar respuestas precisas.'],
                  ['3', 'Se genera un lead automático', 'Cada conversación queda registrada con nombre, intención y datos de contacto.'],
                ].map(([n, title, desc]) => (
                  <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--em)', color: '#00120a', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{title}</div>
                      <div style={{ fontSize: 12, color: 'var(--soft)' }}>{desc}</div>
                    </div>
                  </div>
                ))}
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
                <textarea className="form-input" rows={2} value={evForm.notes} onChange={(e) => setEvForm({ ...evForm, notes: e.target.value })} style={{ resize: 'vertical', fontFamily: "'Plus Jakarta Sans',sans-serif" }} />
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
                    <div style={{ fontFamily: "'Geist',sans-serif", fontSize: 28, fontWeight: 800, color: '#fff' }}>{plan.priceNum}€</div>
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

      {selectedConv && (
        <div className="modal-overlay active" style={{ zIndex: 10003 }} onClick={(e) => { if (e.target === e.currentTarget) setSelectedConv(null); }}>
          <div className="modal-box" style={{ maxWidth: 540, height: '80vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 className="modal-title" style={{ fontSize: 15 }}>
                {selectedConv.lead?.name || `+${selectedConv.wa_from}`}
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', marginLeft: 8 }}>+{selectedConv.wa_from}</span>
              </h3>
              <button type="button" className="modal-close-btn" onClick={() => setSelectedConv(null)}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {convLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', paddingTop: 40 }}>Cargando mensajes…</div>
              ) : convMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', paddingTop: 40 }}>Sin mensajes</div>
              ) : (
                convMessages.map((m) => {
                  const isOut = m.direction === 'outbound' || m.direction === 'outbound-reply';
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '78%',
                        padding: '8px 12px',
                        borderRadius: isOut ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isOut ? 'var(--accent, #c8a96e)' : 'var(--card-bg, #1e1e2e)',
                        color: isOut ? '#111' : 'var(--text)',
                        fontSize: 13,
                        lineHeight: 1.45,
                      }}>
                        <div>{m.body}</div>
                        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: isOut ? 'right' : 'left' }}>
                          {new Date(m.created_at).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showPackModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={() => setShowPackModal(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 440, width: '92%', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setShowPackModal(false)} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>Packs de conversaciones</div>
            <div style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 20 }}>
              Las conversaciones extra no caducan y se usan cuando superas el límite de tu plan.
            </div>
            {[
              { id: 'pack_100', label: '+100 conversaciones', price: '9€', desc: '0,09€ por conversación' },
              { id: 'pack_300', label: '+300 conversaciones', price: '22€', desc: '0,07€ por conversación · Ahorra 25%' },
              { id: 'pack_600', label: '+600 conversaciones', price: '39€', desc: '0,065€ por conversación · Ahorro máximo' },
            ].map(pack => (
              <div key={pack.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>{pack.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{pack.desc}</div>
                </div>
                <button
                  type="button"
                  disabled={convPackBuying}
                  onClick={() => buyConvPack(pack.id)}
                  style={{ background: 'var(--em)', color: '#00120a', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: convPackBuying ? 'not-allowed' : 'pointer', opacity: convPackBuying ? 0.7 : 1, flexShrink: 0, marginLeft: 12 }}
                >
                  {convPackBuying ? <i className="fa-solid fa-circle-notch fa-spin" /> : pack.price}
                </button>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
              Pago único · Las conversaciones se añaden inmediatamente tras el pago
            </div>
          </div>
        </div>
      )}

      <div id="pToast" className={`p-toast ${toast.type} ${toast.msg ? 'show' : ''}`}>
        {toast.msg}
      </div>
    </>
  );
}
