import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';

const STYLES = `
  .tp-header { margin-bottom: 24px; }
  .tp-header h1 { margin: 0 0 4px; font-family: var(--font-display); font-size: 22px; color: var(--text); }
  .tp-header p  { margin: 0; font-size: 13px; color: var(--soft); line-height: 1.55; }

  .tp-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px; margin-bottom: 22px;
  }
  .tp-stat {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 16px 18px;
  }
  .tp-stat-val {
    font-family: var(--font-display);
    font-size: 28px; font-weight: 700;
    color: var(--text); line-height: 1;
    margin-bottom: 4px;
  }
  .tp-stat-val.green { color: var(--em); }
  .tp-stat-val.amber { color: #fbbf24; }
  .tp-stat-val.blue  { color: #60a5fa; }
  .tp-stat-lbl { font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }

  .tp-section {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 20px 22px;
    margin-bottom: 18px;
  }
  .tp-section-head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    margin-bottom: 16px; flex-wrap: wrap;
  }
  .tp-section-head h2 { margin: 0; font-family: var(--font-display); font-size: 16px; color: var(--text); }
  .tp-section-head p  { margin: 4px 0 0; font-size: 12px; color: var(--soft); }

  .tp-banner { padding: 11px 14px; border-radius: var(--r-md); font-size: 13px; margin-bottom: 14px; line-height: 1.5; }
  .tp-banner.err  { background: rgba(239,68,68,0.08);  border: 1px solid rgba(239,68,68,0.28);  color: #fecaca; }
  .tp-banner.ok   { background: rgba(34,197,94,0.08);  border: 1px solid rgba(34,197,94,0.28);  color: #bbf7d0; }
  .tp-banner.warn { background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.28); color: #fde68a; }
  .tp-banner.info { background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.28); color: #bfdbfe; }

  /* Table */
  .tp-table-wrap { border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; overflow-x: auto; }
  .tp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 700px; }
  .tp-table thead th {
    padding: 9px 13px; text-align: left;
    font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted); border-bottom: 1px solid var(--border);
    background: rgba(0,0,0,0.15); white-space: nowrap;
  }
  .tp-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background .1s; }
  .tp-table tbody tr:last-child { border-bottom: none; }
  .tp-table tbody tr:hover { background: rgba(255,255,255,0.02); }
  .tp-table td { padding: 10px 13px; vertical-align: middle; color: var(--soft); }
  .tp-table td.mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text); }
  .tp-table td.num  { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: var(--em); }

  .tp-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 999px;
    font-size: 10px; font-weight: 700; letter-spacing: .04em;
  }
  .tp-badge.available { background: rgba(0,229,160,0.12); color: var(--em); border: 1px solid rgba(0,229,160,0.25); }
  .tp-badge.assigned  { background: rgba(96,165,250,0.12); color: #60a5fa; border: 1px solid rgba(96,165,250,0.25); }
  .tp-badge.suspended { background: rgba(239,68,68,0.10); color: #fca5a5; border: 1px solid rgba(239,68,68,0.22); }

  .tp-wa-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 999px;
    font-size: 10px; font-weight: 700; letter-spacing: .04em; white-space: nowrap;
  }
  .tp-wa-badge.active  { background: rgba(37,211,102,0.15); color: #4ade80; border: 1px solid rgba(37,211,102,0.30); }
  .tp-wa-badge.pending { background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px solid rgba(251,191,36,0.28); }
  .tp-wa-badge.failed  { background: rgba(239,68,68,0.10); color: #fca5a5; border: 1px solid rgba(239,68,68,0.22); }

  .tp-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
  .tp-dot.available { background: var(--em); box-shadow: 0 0 6px var(--em); }
  .tp-dot.assigned  { background: #60a5fa; }
  .tp-dot.suspended { background: #fca5a5; }
  .tp-dot.active    { background: #4ade80; box-shadow: 0 0 5px rgba(74,222,128,.6); }
  .tp-dot.pending   { background: #fbbf24; }
  .tp-dot.failed    { background: #fca5a5; }

  /* Buttons */
  .tp-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: linear-gradient(180deg, var(--em) 0%, var(--em2) 100%);
    color: #00120a; font-weight: 700; border: 0; border-radius: 10px;
    padding: 9px 18px; font-size: 13px; cursor: pointer;
    transition: filter .15s ease, transform .15s ease;
    white-space: nowrap;
  }
  .tp-btn:disabled { filter: grayscale(.55) brightness(.7); cursor: not-allowed; transform: none; }
  .tp-btn:not(:disabled):hover { filter: brightness(1.08); transform: translateY(-1px); }
  .tp-btn.ghost {
    background: transparent; color: var(--soft);
    border: 1px solid var(--border);
  }
  .tp-btn.ghost:not(:disabled):hover { color: var(--text); border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.03); }
  .tp-btn.danger {
    background: rgba(239,68,68,0.12); color: #fca5a5;
    border: 1px solid rgba(239,68,68,0.30);
  }
  .tp-btn.danger:not(:disabled):hover { background: rgba(239,68,68,0.22); color: #fecaca; }
  .tp-btn.xs { padding: 5px 10px; font-size: 11px; border-radius: 7px; }

  .tp-icon-btn {
    background: transparent; border: 1px solid var(--border);
    color: var(--soft); border-radius: 8px; padding: 5px 9px; cursor: pointer;
    font-size: 12px; transition: all .15s; line-height: 1;
  }
  .tp-icon-btn:hover { color: #fca5a5; border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.06); }
  .tp-icon-btn:disabled { opacity: .4; cursor: not-allowed; }

  .tp-row-actions { display: flex; gap: 5px; align-items: center; }

  /* Form */
  .tp-form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px; margin-bottom: 14px;
  }
  .tp-field { display: flex; flex-direction: column; gap: 5px; }
  .tp-label { font-size: 11px; font-weight: 700; color: var(--soft); letter-spacing: .04em; text-transform: uppercase; }
  .tp-input {
    background: rgba(0,0,0,0.28); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 12px; color: var(--text); font-size: 13px; outline: none;
    font-family: inherit; transition: border-color .15s ease;
  }
  .tp-input:focus { border-color: var(--em); }
  .tp-input::placeholder { color: var(--muted); }

  /* Search results */
  .tp-search-grid { display: grid; gap: 8px; margin-top: 14px; }
  .tp-search-row {
    display: flex; align-items: center; gap: 12px;
    background: rgba(0,0,0,0.20); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 14px; flex-wrap: wrap;
  }
  .tp-search-row .num { font-family: monospace; font-size: 14px; font-weight: 700; color: var(--em); flex: 1; min-width: 140px; }
  .tp-search-row .loc { font-size: 11px; color: var(--muted); }
  .tp-search-row .caps { font-size: 10px; color: var(--soft); background: rgba(255,255,255,0.05); border-radius: 6px; padding: 2px 7px; }

  /* Provision result card */
  .tp-provision-result {
    margin-top: 14px; padding: 14px 16px;
    border-radius: var(--r-md);
    border: 1px solid rgba(0,229,160,0.28);
    background: rgba(0,229,160,0.06);
  }
  .tp-provision-result h4 { margin: 0 0 8px; font-size: 14px; color: var(--em); }
  .tp-provision-result .pr-row { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--soft); margin-bottom: 5px; }
  .tp-provision-result .pr-row strong { color: var(--text); min-width: 120px; }

  .tp-empty { padding: 28px; text-align: center; color: var(--muted); font-size: 13px; }

  .tp-note {
    margin-top: 14px; padding: 12px 14px;
    background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.22);
    border-radius: var(--r-md);
    font-size: 12px; color: #fde68a; line-height: 1.6;
  }
  .tp-note strong { color: #fbbf24; }
  .tp-note.info {
    background: rgba(96,165,250,0.06); border-color: rgba(96,165,250,0.22);
    color: #bfdbfe;
  }
  .tp-note.info strong { color: #93c5fd; }

  .tp-steps {
    counter-reset: step;
    list-style: none; margin: 12px 0 0; padding: 0;
    display: flex; flex-direction: column; gap: 8px;
  }
  .tp-steps li {
    counter-increment: step;
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 12.5px; color: var(--soft);
  }
  .tp-steps li::before {
    content: counter(step);
    min-width: 22px; height: 22px; border-radius: 50%;
    background: rgba(0,229,160,0.15); color: var(--em);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 1px;
  }
`;

function StatusBadge({ status }) {
  const label = status === 'available' ? 'Disponible' : status === 'assigned' ? 'Asignado' : 'Suspendido';
  return (
    <span className={`tp-badge ${status}`}>
      <span className={`tp-dot ${status}`} />
      {label}
    </span>
  );
}

function WaBadge({ status }) {
  const labels = { active: '✓ WhatsApp', pending: '⏳ Pendiente', failed: '✗ Fallido' };
  return (
    <span className={`tp-wa-badge ${status || 'pending'}`}>
      <span className={`tp-dot ${status || 'pending'}`} />
      {labels[status] || 'Pendiente'}
    </span>
  );
}

function capsList(caps) {
  if (!caps) return '—';
  const list = [];
  if (caps.sms) list.push('SMS');
  if (caps.mms) list.push('MMS');
  if (caps.voice) list.push('Voz');
  return list.join(' · ') || '—';
}

export function TwilioPoolPage() {
  const [pool, setPool]         = useState([]);
  const [stats, setStats]       = useState({ available: 0, assigned: 0, total: 0 });
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [ok, setOk]             = useState('');
  const [deleting, setDeleting] = useState(null);

  // Per-number WhatsApp actions
  const [activating, setActivating] = useState(null);
  const [verifying, setVerifying]   = useState(null);

  // Search
  const [searching, setSearching]         = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [searchErr, setSearchErr]         = useState('');
  const [country, setCountry]             = useState('ES');
  const [contains, setContains]           = useState('');

  // Provision
  const [provisioning, setProvisioning]       = useState(null);
  const [provisionResult, setProvisionResult] = useState(null);
  const [provisionErr, setProvisionErr]       = useState('');

  // Manual add
  const [manual, setManual]   = useState({ phone_number: '', twilio_sid: '', friendly_name: '', monthly_cost_cents: '100' });
  const [addingManual, setAddingManual] = useState(false);
  const [manualErr, setManualErr]       = useState('');
  const [manualOk, setManualOk]         = useState('');

  // Release expired
  const [releasing, setReleasing] = useState(false);

  // Messaging service
  const [settingUpMs, setSettingUpMs] = useState(false);
  const [msResult, setMsResult]       = useState(null);

  const loadPool = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await apiCall('/api/admin/twilio/pool');
      setPool(res.numbers || []);
      setStats(res.stats || { available: 0, assigned: 0, total: 0 });
    } catch (e) {
      setErr(e?.message || 'Error cargando el pool');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPool(); }, [loadPool]);

  const flash = (setter, msg, ms = 5000) => {
    setter(msg);
    setTimeout(() => setter(''), ms);
  };

  // ── Pool table actions ──────────────────────────────────────────────────────

  async function deleteNumber(id, phone) {
    if (!window.confirm(`¿Eliminar ${phone} del pool?`)) return;
    setDeleting(id);
    try {
      await apiCall(`/api/admin/twilio/pool/${id}`, { method: 'DELETE' });
      flash(setOk, `${phone} eliminado del pool.`);
      await loadPool();
    } catch (e) {
      flash(setErr, e?.message || 'Error eliminando número');
    } finally {
      setDeleting(null);
    }
  }

  async function activateWhatsApp(id, phone) {
    setActivating(id);
    try {
      const res = await apiCall(`/api/admin/twilio/pool/${id}/activate-whatsapp`, { method: 'POST' });
      if (res.status === 'active') {
        flash(setOk, `✅ WhatsApp activado para ${phone}.`);
      } else {
        flash(setErr, `WhatsApp pendiente para ${phone}. ${res.reason === 'waba_not_connected' ? 'Actívalo manualmente en Twilio Console.' : res.reason || ''}`);
      }
      await loadPool();
    } catch (e) {
      flash(setErr, e?.message || 'Error activando WhatsApp');
    } finally {
      setActivating(null);
    }
  }

  async function verifyWhatsApp(id, phone) {
    setVerifying(id);
    try {
      const res = await apiCall(`/api/admin/twilio/pool/${id}/whatsapp-status`);
      if (res.status === 'active') {
        flash(setOk, `✅ ${phone} verificado como activo en WhatsApp.`);
      } else {
        flash(setErr, `${phone} aún no está activo en WhatsApp (${res.status}).`);
      }
      await loadPool();
    } catch (e) {
      flash(setErr, e?.message || 'Error verificando estado');
    } finally {
      setVerifying(null);
    }
  }

  async function releaseExpired() {
    setReleasing(true); setErr(''); setOk('');
    try {
      const res = await apiCall('/api/admin/twilio/release-expired', { method: 'POST' });
      flash(setOk, `${res.released} número${res.released === 1 ? '' : 's'} liberado${res.released === 1 ? '' : 's'}.`);
      await loadPool();
    } catch (e) {
      flash(setErr, e?.message || 'Error liberando números');
    } finally {
      setReleasing(false);
    }
  }

  async function setupMessagingService() {
    setSettingUpMs(true); setMsResult(null);
    try {
      const res = await apiCall('/api/admin/twilio/setup-messaging-service', { method: 'POST' });
      setMsResult({ ok: true, sid: res.sid, created: res.created });
    } catch (e) {
      setMsResult({ ok: false, reason: e?.message });
    } finally {
      setSettingUpMs(false);
    }
  }

  // ── Twilio Search ──────────────────────────────────────────────────────────

  async function searchNumbers() {
    setSearching(true); setSearchErr(''); setSearchResults(null);
    setProvisionResult(null); setProvisionErr('');
    try {
      const qs = `country=${encodeURIComponent(country)}&limit=20${contains ? `&contains=${encodeURIComponent(contains)}` : ''}`;
      const res = await apiCall(`/api/admin/twilio/search-numbers?${qs}`);
      setSearchResults(res.numbers || []);
      if (!res.numbers?.length) setSearchErr('No hay números disponibles con esos criterios.');
    } catch (e) {
      setSearchErr(e?.message || 'Error buscando números en Twilio');
    } finally {
      setSearching(false);
    }
  }

  async function provisionNumber(phoneNumber) {
    if (!window.confirm(`¿Comprar y configurar ${phoneNumber}? Se cargará a tu cuenta de Twilio.`)) return;
    setProvisioning(phoneNumber); setProvisionErr(''); setProvisionResult(null);
    try {
      const res = await apiCall('/api/admin/twilio/provision', {
        method: 'POST',
        body: JSON.stringify({ phone_number: phoneNumber }),
      });
      setProvisionResult(res);
      setSearchResults((prev) => prev?.filter((n) => n.phone_number !== phoneNumber));
      await loadPool();
    } catch (e) {
      setProvisionErr(`Error comprando ${phoneNumber}: ${e?.message || e}`);
    } finally {
      setProvisioning(null);
    }
  }

  // ── Manual Add ──────────────────────────────────────────────────────────────

  async function addManual(e) {
    e.preventDefault();
    setAddingManual(true); setManualErr(''); setManualOk('');
    try {
      await apiCall('/api/admin/twilio/pool', {
        method: 'POST',
        body: JSON.stringify({
          phone_number:       manual.phone_number.trim(),
          twilio_sid:         manual.twilio_sid.trim(),
          friendly_name:      manual.friendly_name.trim() || null,
          monthly_cost_cents: Number(manual.monthly_cost_cents) || 100,
        }),
      });
      setManualOk(`${manual.phone_number} añadido al pool.`);
      setManual({ phone_number: '', twilio_sid: '', friendly_name: '', monthly_cost_cents: '100' });
      await loadPool();
    } catch (e) {
      setManualErr(e?.message || 'Error añadiendo número');
    } finally {
      setAddingManual(false);
    }
  }

  const pendingWhatsApp = pool.filter((n) => n.whatsapp_status !== 'active');

  return (
    <>
      <style>{STYLES}</style>

      <header className="tp-header">
        <h1>Pool de números Twilio</h1>
        <p>
          Gestiona los números WhatsApp que Omnira asigna automáticamente a los clientes al pagar.
          Compra números directamente desde Twilio y se configuran solos: webhook, Messaging Service y activación de WhatsApp.
        </p>
      </header>

      {/* Stats */}
      <div className="tp-stats">
        <div className="tp-stat">
          <div className={`tp-stat-val${stats.available > 0 ? ' green' : ' amber'}`}>{stats.available}</div>
          <div className="tp-stat-lbl">Disponibles</div>
        </div>
        <div className="tp-stat">
          <div className="tp-stat-val blue">{stats.assigned}</div>
          <div className="tp-stat-lbl">Asignados</div>
        </div>
        <div className="tp-stat">
          <div className="tp-stat-val">{stats.total}</div>
          <div className="tp-stat-lbl">Total en pool</div>
        </div>
        <div className="tp-stat">
          <div className={`tp-stat-val${pendingWhatsApp.length === 0 ? ' green' : ' amber'}`}>
            {pendingWhatsApp.length}
          </div>
          <div className="tp-stat-lbl">WhatsApp pendiente</div>
        </div>
      </div>

      {stats.available === 0 && stats.total > 0 && (
        <div className="tp-banner warn">
          ⚠️ <strong>Sin números disponibles.</strong> No se pueden asignar números a nuevos clientes.
          Compra más números o libera los expirados.
        </div>
      )}

      {err  && <div className="tp-banner err">{err}</div>}
      {ok   && <div className="tp-banner ok">{ok}</div>}

      {/* ── Pool table ────────────────────────────────────────────────────── */}
      <div className="tp-section">
        <div className="tp-section-head">
          <div>
            <h2>Números en el pool</h2>
            <p>Estado actual de todos los números — incluyendo activación de WhatsApp.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="tp-btn ghost" onClick={loadPool} disabled={loading}>
              {loading ? 'Cargando…' : '↻ Actualizar'}
            </button>
            <button type="button" className="tp-btn ghost" onClick={releaseExpired} disabled={releasing || loading}>
              {releasing ? 'Liberando…' : 'Liberar expirados'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="tp-empty">Cargando pool…</div>
        ) : !pool.length ? (
          <div className="tp-empty">No hay números en el pool. Compra uno abajo.</div>
        ) : (
          <div className="tp-table-wrap">
            <table className="tp-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Estado pool</th>
                  <th>WhatsApp</th>
                  <th>Twilio SID</th>
                  <th>Cliente</th>
                  <th>€/mes</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pool.map((n) => (
                  <tr key={n.id}>
                    <td className="num">{n.phone_number}</td>
                    <td><StatusBadge status={n.status} /></td>
                    <td><WaBadge status={n.whatsapp_status} /></td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{n.twilio_sid}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {n.customer_user_id
                        ? <span style={{ color: '#60a5fa' }}>{n.customer_user_id.slice(0, 8)}…</span>
                        : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--soft)', fontSize: 12 }}>€{((n.monthly_cost_cents || 100) / 100).toFixed(2)}</td>
                    <td>
                      <div className="tp-row-actions">
                        {n.whatsapp_status !== 'active' && (
                          <button
                            type="button"
                            className="tp-btn ghost xs"
                            title="Intentar activar WhatsApp"
                            disabled={activating === n.id}
                            onClick={() => activateWhatsApp(n.id, n.phone_number)}
                          >
                            {activating === n.id ? '…' : '⚡ Activar WA'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="tp-btn ghost xs"
                          title="Verificar estado WhatsApp"
                          disabled={verifying === n.id}
                          onClick={() => verifyWhatsApp(n.id, n.phone_number)}
                        >
                          {verifying === n.id ? '…' : '✓ Verificar'}
                        </button>
                        <button
                          type="button"
                          className="tp-icon-btn"
                          title="Eliminar del pool"
                          disabled={deleting === n.id || n.status === 'assigned'}
                          onClick={() => deleteNumber(n.id, n.phone_number)}
                        >
                          {deleting === n.id ? '…' : '🗑'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Buscar y comprar en Twilio ──────────────────────────────────── */}
      <div className="tp-section">
        <div className="tp-section-head">
          <div>
            <h2>Comprar número en Twilio</h2>
            <p>Un clic: compra, configura webhook, añade al Messaging Service e intenta activar WhatsApp automáticamente.</p>
          </div>
        </div>

        <div className="tp-note info">
          <strong>Automatización:</strong> Al pulsar "Comprar y configurar" el servidor hace todo de forma encadenada:
          <ol className="tp-steps">
            <li>Compra el número en Twilio y configura el webhook de recepción</li>
            <li>Crea o reutiliza el Messaging Service de Omnira y añade el número</li>
            <li>Intenta la activación de WhatsApp vía API (si tu cuenta ya tiene WABA conectada se activa solo; si no, queda pendiente)</li>
            <li>Guarda todo en la base de datos con el estado final</li>
          </ol>
        </div>

        <div className="tp-form-grid" style={{ marginTop: 16 }}>
          <div className="tp-field">
            <label className="tp-label">País</label>
            <select
              className="tp-input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="ES">🇪🇸 España (+34)</option>
              <option value="US">🇺🇸 Estados Unidos (+1)</option>
              <option value="GB">🇬🇧 Reino Unido (+44)</option>
              <option value="MX">🇲🇽 México (+52)</option>
              <option value="DE">🇩🇪 Alemania (+49)</option>
              <option value="FR">🇫🇷 Francia (+33)</option>
            </select>
          </div>
          <div className="tp-field">
            <label className="tp-label">Filtro numérico (opcional)</label>
            <input
              className="tp-input"
              value={contains}
              onChange={(e) => setContains(e.target.value)}
              placeholder="ej. 91 para Madrid"
            />
          </div>
        </div>

        <button type="button" className="tp-btn" onClick={searchNumbers} disabled={searching}>
          {searching ? 'Buscando…' : '🔍 Buscar números disponibles'}
        </button>

        {searchErr  && <div className="tp-banner err"  style={{ marginTop: 14 }}>{searchErr}</div>}
        {provisionErr && <div className="tp-banner err" style={{ marginTop: 14 }}>{provisionErr}</div>}

        {/* Provision result */}
        {provisionResult && (
          <div className="tp-provision-result">
            <h4>✅ Número añadido al pool</h4>
            <div className="pr-row"><strong>Número:</strong> {provisionResult.phoneNumber}</div>
            <div className="pr-row"><strong>Twilio SID:</strong> {provisionResult.twilioSid}</div>
            <div className="pr-row">
              <strong>WhatsApp:</strong>
              <WaBadge status={provisionResult.whatsappStatus} />
            </div>
            {provisionResult.messagingService && (
              <div className="pr-row"><strong>Messaging Service:</strong> {provisionResult.messagingService}</div>
            )}
            {provisionResult.needsConsoleSetup && (
              <div className="tp-note" style={{ marginTop: 10 }}>
                <strong>Paso manual requerido:</strong> Ve a{' '}
                <strong>Twilio Console → Messaging → Senders → WhatsApp senders</strong> y añade este número.
                La aprobación de Meta puede tardar 1-3 días. Usa el botón <em>"✓ Verificar"</em> en la tabla
                para que el sistema detecte la activación automáticamente.
              </div>
            )}
          </div>
        )}

        {searchResults !== null && (
          searchResults.length === 0 ? (
            <div className="tp-empty" style={{ marginTop: 14 }}>Sin resultados para los filtros aplicados.</div>
          ) : (
            <div className="tp-search-grid">
              {searchResults.map((n) => (
                <div key={n.phone_number} className="tp-search-row">
                  <span className="num">{n.phone_number}</span>
                  {(n.locality || n.region) && (
                    <span className="loc">{[n.locality, n.region].filter(Boolean).join(', ')}</span>
                  )}
                  <span className="caps">{capsList(n.capabilities)}</span>
                  <button
                    type="button"
                    className="tp-btn"
                    style={{ padding: '7px 14px', fontSize: 12 }}
                    disabled={!!provisioning}
                    onClick={() => provisionNumber(n.phone_number)}
                  >
                    {provisioning === n.phone_number ? 'Configurando…' : '⚡ Comprar y configurar'}
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Messaging Service setup ────────────────────────────────────── */}
      <div className="tp-section">
        <div className="tp-section-head">
          <div>
            <h2>Messaging Service</h2>
            <p>Crea o verifica el Messaging Service de Omnira en Twilio (se hace una vez, luego es automático).</p>
          </div>
          <button type="button" className="tp-btn ghost" onClick={setupMessagingService} disabled={settingUpMs}>
            {settingUpMs ? 'Configurando…' : '⚙️ Configurar Messaging Service'}
          </button>
        </div>

        {msResult && (
          msResult.ok ? (
            <div className="tp-banner ok">
              {msResult.created ? '✅ Messaging Service creado:' : '✅ Messaging Service existente:'} {msResult.sid}
            </div>
          ) : (
            <div className="tp-banner err">Error: {msResult.reason}</div>
          )
        )}

        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          El Messaging Service agrupa todos los números del pool para un enrutamiento unificado.
          Se crea automáticamente al comprar el primer número, pero puedes forzar su creación aquí.
        </p>
      </div>

      {/* ── Añadir número manualmente ──────────────────────────────────── */}
      <div className="tp-section">
        <div className="tp-section-head">
          <div>
            <h2>Añadir número manualmente</h2>
            <p>Si ya tienes el número y el SID de Twilio, añádelo directamente al pool.</p>
          </div>
        </div>

        {manualErr && <div className="tp-banner err">{manualErr}</div>}
        {manualOk  && <div className="tp-banner ok">{manualOk}</div>}

        <form onSubmit={addManual} autoComplete="off">
          <div className="tp-form-grid">
            <div className="tp-field">
              <label className="tp-label">Número E.164 *</label>
              <input
                className="tp-input"
                required
                value={manual.phone_number}
                onChange={(e) => setManual((m) => ({ ...m, phone_number: e.target.value }))}
                placeholder="+34911234567"
              />
            </div>
            <div className="tp-field">
              <label className="tp-label">Twilio SID *</label>
              <input
                className="tp-input"
                required
                value={manual.twilio_sid}
                onChange={(e) => setManual((m) => ({ ...m, twilio_sid: e.target.value }))}
                placeholder="PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
            <div className="tp-field">
              <label className="tp-label">Nombre amigable</label>
              <input
                className="tp-input"
                value={manual.friendly_name}
                onChange={(e) => setManual((m) => ({ ...m, friendly_name: e.target.value }))}
                placeholder="Madrid Omnira #1"
              />
            </div>
            <div className="tp-field">
              <label className="tp-label">Coste mensual (céntimos)</label>
              <input
                className="tp-input"
                type="number"
                min="0"
                value={manual.monthly_cost_cents}
                onChange={(e) => setManual((m) => ({ ...m, monthly_cost_cents: e.target.value }))}
                placeholder="100"
              />
            </div>
          </div>
          <button type="submit" className="tp-btn" disabled={addingManual}>
            {addingManual ? 'Añadiendo…' : '+ Añadir al pool'}
          </button>
        </form>
      </div>
    </>
  );
}
