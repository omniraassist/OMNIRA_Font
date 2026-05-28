import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiCall } from '../api/client.js';

const STYLES = `
  .inv-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 20px; }
  .inv-stat {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border); border-radius: var(--r-md); padding: 18px 20px;
  }
  .inv-stat .lbl { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
  .inv-stat .val { font-size: 25px; font-weight: 800; color: var(--text); font-family: var(--font-display); margin-top: 6px; }
  .inv-stat .val.em { background: linear-gradient(135deg, var(--em), var(--em2)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }

  .inv-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; margin-bottom: 16px; }
  .inv-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .inv-banner.ok  { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }
  .inv-banner.warn { background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.30); color: #fde68a; }

  .inv-toolbar { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .inv-toolbar input, .inv-toolbar select {
    background: rgba(0,0,0,0.30); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 14px; color: var(--text); font-size: 14px;
  }
  .inv-toolbar input { flex: 1; min-width: 200px; }
  .inv-toolbar input:focus, .inv-toolbar select:focus { outline: none; border-color: var(--em); }
  .inv-refresh {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--soft);
    border-radius: 10px; padding: 0 16px; cursor: pointer; font-size: 16px;
  }
  .inv-refresh:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }

  .inv-table-wrap {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border); border-radius: var(--r-md); overflow-x: auto;
  }
  .inv-table { width: 100%; border-collapse: collapse; min-width: 920px; }
  .inv-table thead th {
    text-align: left; padding: 13px 16px; font-size: 11px; letter-spacing: .05em; text-transform: uppercase;
    color: var(--muted); font-weight: 700; background: rgba(0,0,0,0.25); border-bottom: 1px solid var(--border); white-space: nowrap;
  }
  .inv-table thead th.num, .inv-table td.num { text-align: right; }
  .inv-table tbody td { padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); vertical-align: middle; }
  .inv-table tbody tr:hover { background: rgba(255,255,255,0.02); }

  .inv-num { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--em); cursor: pointer; }
  .inv-num small { display: block; color: var(--muted); font-size: 10px; margin-top: 2px; }

  .inv-cust { min-width: 200px; }
  .inv-cust .av {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, rgba(0,229,160,0.25), rgba(0,200,122,0.10));
    border: 1px solid var(--border-em); color: var(--em); font-weight: 700; font-size: 13px;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .inv-cust .who { display: flex; align-items: center; gap: 10px; }
  .inv-cust strong { color: var(--text); font-size: 13px; }
  .inv-cust .lines { font-size: 11px; color: var(--muted); line-height: 1.5; margin-top: 3px; }
  .inv-cust .lines a { color: var(--soft); text-decoration: none; }
  .inv-cust .lines a:hover { color: var(--em); }
  .inv-cid { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #64748b; }

  .inv-plan { display: inline-block; padding: 3px 10px; border-radius: 999px; background: rgba(0,229,160,0.10); color: var(--em); font-size: 12px; font-weight: 600; white-space: nowrap; }
  .inv-amount { font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .inv-date { white-space: nowrap; }
  .inv-date small { display: block; color: var(--muted); font-size: 11px; }
  .inv-paid { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .inv-paid.active { color: #34d399; }
  .inv-paid.expired { color: #fbbf24; }
  .inv-paid::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }

  .inv-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .inv-act {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--soft);
    border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap; transition: all .15s ease;
  }
  .inv-act:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }
  .inv-act.em:hover { color: var(--em); border-color: var(--border-em); background: rgba(0,229,160,0.08); }
  .inv-act:disabled { opacity: .5; cursor: not-allowed; }
  .inv-empty { padding: 40px; text-align: center; color: var(--muted); font-size: 14px; }

  .inv-modal-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(2,6,12,0.92); display: flex; flex-direction: column; padding: 0; }
  .inv-modal { background: #eef2f7; width: 100vw; height: 100dvh; max-height: none; border-radius: 0; display: flex; flex-direction: column; overflow: hidden; }
  .inv-modal-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; background: #0b1220; flex-shrink: 0; flex-wrap: wrap; box-shadow: 0 2px 14px rgba(0,0,0,0.4); }
  .inv-modal-bar .t { color: #fff; font-size: 15px; font-weight: 700; font-family: var(--font-display); }
  .inv-modal-bar .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .inv-modal-btn { border: 0; border-radius: 8px; padding: 9px 15px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .inv-modal-btn.print { background: linear-gradient(135deg, var(--em), var(--em2)); color: #04201a; }
  .inv-modal-btn.send { background: #1f6feb; color: #fff; }
  .inv-modal-btn.alt { background: rgba(255,255,255,0.16); color: #fff; }
  .inv-modal-btn.close { background: rgba(255,255,255,0.10); color: #fff; }
  .inv-modal-btn:hover { filter: brightness(1.1); }
  .inv-modal-btn:disabled { opacity: .5; cursor: not-allowed; }
  .inv-modal iframe { width: 100%; flex: 1; min-height: 0; border: 0; background: #eef2f7; }
`;

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };
  } catch {
    return { date: '—', time: '' };
  }
}

function initials(name) {
  return String(name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function InvoicesPage() {
  const [list, setList] = useState([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [preview, setPreview] = useState(null); // { id, number, html, email }
  const [resendingId, setResendingId] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const iframeRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/invoices');
      setList(res.invoices || []);
      setEmailConfigured(res.email_configured !== false);
    } catch (e) {
      setError(e?.message || 'No se pudieron cargar las facturas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openPreview = async (inv) => {
    setError('');
    try {
      const res = await apiCall(`/api/admin/invoices/${inv.id}`);
      setPreview({ id: inv.id, number: inv.number, html: res.html, email: inv.email });
    } catch (e) {
      setError(e?.message || 'No se pudo cargar la factura');
    }
  };

  const printPreview = () => {
    const f = iframeRef.current;
    if (f?.contentWindow) {
      f.contentWindow.focus();
      f.contentWindow.print();
    }
  };

  const downloadPreview = () => {
    if (!preview?.html) return;
    const blob = new Blob([preview.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preview.number}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const doResend = async (id, to, label) => {
    if (!emailConfigured) {
      setError('El email no está configurado en el servidor (variables SMTP_*).');
      return false;
    }
    setError(''); setInfo('');
    try {
      const res = await apiCall(`/api/admin/invoices/${id}/resend`, {
        method: 'POST',
        body: JSON.stringify(to ? { to } : {}),
      });
      setInfo(`${label} → enviada a ${res.sentTo}.`);
      return true;
    } catch (e) {
      setError(e?.message || 'No se pudo enviar la factura');
      return false;
    }
  };

  const resendRow = async (inv) => {
    setResendingId(inv.id);
    await doResend(inv.id, '', `Factura ${inv.number}`);
    setResendingId('');
  };

  const resendModalCustomer = async () => {
    if (!preview) return;
    setModalBusy(true);
    await doResend(preview.id, preview.email, `Factura ${preview.number}`);
    setModalBusy(false);
  };

  const resendModalCustom = async () => {
    if (!preview) return;
    const to = window.prompt('Enviar esta factura a otro email:', preview.email || '');
    if (!to || !to.trim()) return;
    setModalBusy(true);
    await doResend(preview.id, to.trim(), `Factura ${preview.number}`);
    setModalBusy(false);
  };

  const customers = useMemo(() => {
    const map = new Map();
    for (const i of list) {
      if (!map.has(i.customerId)) map.set(i.customerId, { id: i.customerId, name: i.customerName, email: i.email });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [list]);

  const plans = useMemo(() => {
    const set = new Map();
    for (const i of list) if (i.planId) set.set(i.planId, i.planLabel);
    return [...set.entries()];
  }, [list]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((i) => {
      if (planFilter !== 'all' && i.planId !== planFilter) return false;
      if (customerFilter !== 'all' && i.customerId !== customerFilter) return false;
      if (!q) return true;
      return (
        String(i.number || '').toLowerCase().includes(q) ||
        String(i.customerName || '').toLowerCase().includes(q) ||
        String(i.email || '').toLowerCase().includes(q) ||
        String(i.phone || '').toLowerCase().includes(q) ||
        String(i.planLabel || '').toLowerCase().includes(q) ||
        String(i.paymentRef || '').toLowerCase().includes(q)
      );
    });
  }, [list, search, planFilter, customerFilter]);

  const stats = useMemo(() => {
    const revenue = filtered.reduce((s, i) => s + Number(i.amountEuro || 0), 0);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRevenue = filtered
      .filter((i) => i.createdAt && new Date(i.createdAt) >= monthStart)
      .reduce((s, i) => s + Number(i.amountEuro || 0), 0);
    const uniqueCustomers = new Set(filtered.map((i) => i.customerId)).size;
    return { count: filtered.length, revenue, monthRevenue, uniqueCustomers };
  }, [filtered]);

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(
      () => setInfo(`Copiado: ${text}`),
      () => {}
    );
  };

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>Facturas</h1>
        <p>
          Todas las facturas de tus clientes de pago, con su identidad completa. Cada pago de suscripción genera
          una factura que se envía automáticamente al cliente. Aquí puedes filtrar por cliente o plan, ver el
          documento A4, imprimirlo/guardarlo como PDF, descargarlo o reenviarlo por email.
        </p>
      </header>

      {!emailConfigured ? (
        <div className="inv-banner warn">
          <strong>Aviso:</strong> el envío de email no está configurado (faltan variables <code>SMTP_*</code> en el
          servidor). Puedes ver, imprimir y descargar facturas; el reenvío por email no funcionará hasta configurarlo.
        </div>
      ) : null}
      {error ? <div className="inv-banner err"><strong>Error:</strong> {error}</div> : null}
      {info ? <div className="inv-banner ok"><strong>OK:</strong> {info}</div> : null}

      <div className="inv-stats">
        <div className="inv-stat"><div className="lbl">Facturas</div><div className="val">{stats.count}</div></div>
        <div className="inv-stat"><div className="lbl">Ingresos (filtro)</div><div className="val em">€{stats.revenue.toFixed(2)}</div></div>
        <div className="inv-stat"><div className="lbl">Este mes</div><div className="val">€{stats.monthRevenue.toFixed(2)}</div></div>
        <div className="inv-stat"><div className="lbl">Clientes de pago</div><div className="val">{stats.uniqueCustomers}</div></div>
      </div>

      <div className="inv-toolbar">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nº, cliente, email, teléfono, plan o referencia…"
        />
        <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
          <option value="all">Todos los clientes ({customers.length})</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
          ))}
        </select>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
          <option value="all">Todos los planes</option>
          {plans.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <button type="button" className="inv-refresh" title="Actualizar" onClick={load} disabled={loading}>↻</button>
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Factura</th>
              <th>Cliente</th>
              <th>Plan</th>
              <th className="num">Importe</th>
              <th>Fecha</th>
              <th>Suscripción</th>
              <th className="num">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => {
              const dt = fmtDateTime(inv.createdAt);
              return (
                <tr key={inv.id}>
                  <td>
                    <span className="inv-num" title="Copiar nº de factura" onClick={() => copy(inv.number)}>
                      {inv.number}
                      {inv.paymentRef ? <small>{inv.paymentRef}</small> : null}
                    </span>
                  </td>
                  <td className="inv-cust">
                    <div className="who">
                      <span className="av">{initials(inv.customerName)}</span>
                      <div>
                        <strong>{inv.customerName}</strong>
                        <div className="lines">
                          <a href={`mailto:${inv.email}`}>{inv.email || '—'}</a>
                          {inv.phone ? <> · {inv.phone}</> : null}
                          <div className="inv-cid">ID {String(inv.customerId).slice(0, 8)}</div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><span className="inv-plan">{inv.planLabel}</span></td>
                  <td className="num inv-amount">€{Number(inv.amountEuro).toFixed(2)}</td>
                  <td className="inv-date">{dt.date}<small>{dt.time}</small></td>
                  <td>
                    <span className={`inv-paid ${inv.subscriptionActive ? 'active' : 'expired'}`}>
                      {inv.subscriptionActive ? 'Activa' : 'Expirada'}
                    </span>
                  </td>
                  <td className="num">
                    <div className="inv-actions">
                      <button type="button" className="inv-act em" onClick={() => openPreview(inv)}>Ver</button>
                      <button
                        type="button"
                        className="inv-act"
                        onClick={() => resendRow(inv)}
                        disabled={resendingId === inv.id || !emailConfigured || !inv.email}
                      >
                        {resendingId === inv.id ? 'Enviando…' : 'Reenviar'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="inv-empty">{loading ? 'Cargando…' : 'No hay facturas que coincidan con el filtro.'}</div>
        ) : null}
      </div>

      {preview ? (
        <div className="inv-modal-overlay" onClick={() => setPreview(null)}>
          <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-bar">
              <div className="t">Factura {preview.number}</div>
              <div className="acts">
                <button type="button" className="inv-modal-btn print" onClick={printPreview}>Imprimir / PDF</button>
                <button type="button" className="inv-modal-btn alt" onClick={downloadPreview}>Descargar</button>
                <button type="button" className="inv-modal-btn send" onClick={resendModalCustomer} disabled={modalBusy || !emailConfigured || !preview.email}>
                  {modalBusy ? 'Enviando…' : 'Reenviar al cliente'}
                </button>
                <button type="button" className="inv-modal-btn alt" onClick={resendModalCustom} disabled={modalBusy || !emailConfigured}>
                  Reenviar a otro…
                </button>
                <button type="button" className="inv-modal-btn close" onClick={() => setPreview(null)}>Cerrar</button>
              </div>
            </div>
            <iframe ref={iframeRef} title={`Factura ${preview.number}`} srcDoc={preview.html} />
          </div>
        </div>
      ) : null}
    </>
  );
}
