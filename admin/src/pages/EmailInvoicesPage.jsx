import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiCall } from '../api/client.js';

/**
 * Customer-centric view of every invoice ever issued. The existing /invoices
 * page is invoice-centric (one row per invoice); this page is the email/customer
 * angle — one card per customer email, with their full invoice history nested
 * inside. From here the admin can preview/resend any invoice in a single click
 * and see, per customer, how much they have paid and when their last invoice
 * went out.
 */
const STYLES = `
  .em-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; margin-bottom: 14px; }
  .em-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .em-banner.ok  { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }
  .em-banner.warn { background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.30); color: #fde68a; }

  .em-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 18px; }
  .em-stat {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border); border-radius: var(--r-md); padding: 16px 18px;
  }
  .em-stat .lbl { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
  .em-stat .val { font-size: 24px; font-weight: 800; color: var(--text); font-family: var(--font-display); margin-top: 6px; }
  .em-stat .val.em { background: linear-gradient(135deg, var(--em), var(--em2)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }

  .em-toolbar { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .em-toolbar input, .em-toolbar select {
    background: rgba(0,0,0,0.30); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 14px; color: var(--text); font-size: 14px;
  }
  .em-toolbar input { flex: 1; min-width: 220px; }
  .em-toolbar input:focus, .em-toolbar select:focus { outline: none; border-color: var(--em); }
  .em-refresh {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--soft);
    border-radius: 10px; padding: 0 16px; cursor: pointer; font-size: 16px;
  }
  .em-refresh:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }

  .em-list { display: flex; flex-direction: column; gap: 12px; }

  .em-card {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    overflow: hidden;
    transition: border-color .2s ease;
  }
  .em-card:hover { border-color: rgba(255,255,255,0.12); }
  .em-card.open { border-color: var(--border-em); }

  .em-card-head {
    display: grid;
    grid-template-columns: 46px 1fr auto auto auto;
    gap: 14px;
    align-items: center;
    padding: 14px 18px;
    cursor: pointer;
    background: transparent;
    border: 0;
    width: 100%;
    text-align: left;
    color: inherit;
  }
  .em-card-head:hover { background: rgba(255,255,255,0.02); }
  .em-card-head:focus { outline: none; background: rgba(255,255,255,0.03); }
  .em-card-head .av {
    width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, rgba(0,229,160,0.25), rgba(0,200,122,0.10));
    border: 1px solid var(--border-em); color: var(--em); font-weight: 700; font-size: 16px;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .em-card-head .who { min-width: 0; }
  .em-card-head .who strong { color: var(--text); font-size: 14px; display: block; }
  .em-card-head .who .em { display: block; color: var(--em); font-size: 12.5px; margin-top: 2px; word-break: break-all; }
  .em-card-head .who .meta { display: block; color: var(--muted); font-size: 11px; margin-top: 3px; }

  .em-card-head .count {
    text-align: center; padding: 4px 12px;
    background: rgba(0,229,160,0.08); border: 1px solid rgba(0,229,160,0.22);
    border-radius: 999px; color: var(--em);
    font-size: 12px; font-weight: 700;
    white-space: nowrap;
  }
  .em-card-head .total {
    text-align: right;
    font-family: var(--font-display); font-weight: 800;
    color: var(--text); font-size: 16px; font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .em-card-head .total small { display: block; font-size: 10.5px; color: var(--muted); font-weight: 600; margin-top: 2px; letter-spacing: .04em; text-transform: uppercase; }
  .em-card-head .chev {
    width: 26px; height: 26px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 999px;
    color: var(--soft);
    transition: transform .2s ease, background .2s ease;
  }
  .em-card.open .em-card-head .chev { transform: rotate(180deg); background: rgba(0,229,160,0.10); color: var(--em); }

  .em-card-body {
    border-top: 1px solid var(--border);
    background: rgba(0,0,0,0.20);
    padding: 0;
    animation: em-slide .25s ease-out;
  }
  @keyframes em-slide { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

  .em-card-actions {
    display: flex; gap: 8px; padding: 12px 18px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .em-card-actions .a {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--soft);
    border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 12px; font-weight: 600;
    text-decoration: none;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .em-card-actions .a:hover { color: var(--em); border-color: var(--border-em); background: rgba(0,229,160,0.06); }
  .em-card-actions .sub {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px; border-radius: 999px; font-size: 11px; font-weight: 600;
  }
  .em-card-actions .sub.on { background: rgba(34,197,94,0.10); color: #86efac; border: 1px solid rgba(34,197,94,0.25); }
  .em-card-actions .sub.off { background: rgba(251,191,36,0.10); color: #fde68a; border: 1px solid rgba(251,191,36,0.25); }
  .em-card-actions .spacer { flex: 1; }

  .em-inv-table { width: 100%; border-collapse: collapse; }
  .em-inv-table thead th {
    text-align: left; padding: 10px 18px; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase;
    color: var(--muted); font-weight: 700; background: rgba(0,0,0,0.18); border-bottom: 1px solid var(--border); white-space: nowrap;
  }
  .em-inv-table thead th.num, .em-inv-table td.num { text-align: right; }
  .em-inv-table tbody td { padding: 11px 18px; border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--text); vertical-align: middle; }
  .em-inv-table tbody tr:hover { background: rgba(255,255,255,0.02); }
  .em-inv-table tbody tr:last-child td { border-bottom: 0; }
  .em-inv-num { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--em); cursor: pointer; }
  .em-inv-num:hover { text-decoration: underline; }
  .em-plan { display: inline-block; padding: 2px 9px; border-radius: 999px; background: rgba(0,229,160,0.10); color: var(--em); font-size: 11px; font-weight: 600; }
  .em-amount { font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .em-date small { display: block; color: var(--muted); font-size: 10.5px; }
  .em-row-acts { display: flex; gap: 6px; justify-content: flex-end; }
  .em-row-acts button {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--soft);
    border-radius: 8px; padding: 6px 11px; cursor: pointer; font-size: 11.5px; font-weight: 600;
  }
  .em-row-acts button:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }
  .em-row-acts button.em:hover { color: var(--em); border-color: var(--border-em); background: rgba(0,229,160,0.06); }
  .em-row-acts button:disabled { opacity: .5; cursor: not-allowed; }

  .em-empty { padding: 50px 20px; text-align: center; color: var(--muted); font-size: 14px; }

  /* Full-screen preview modal — same shape as InvoicesPage so the admin
     muscle memory survives. */
  .em-modal-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(2,6,12,0.92); display: flex; flex-direction: column; }
  .em-modal { background: #eef2f7; width: 100vw; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
  .em-modal-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; background: #0b1220; flex-shrink: 0; flex-wrap: wrap; }
  .em-modal-bar .t { color: #fff; font-size: 15px; font-weight: 700; font-family: var(--font-display); }
  .em-modal-bar .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .em-modal-btn { border: 0; border-radius: 8px; padding: 9px 15px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .em-modal-btn.print { background: linear-gradient(135deg, var(--em), var(--em2)); color: #04201a; }
  .em-modal-btn.send { background: #1f6feb; color: #fff; }
  .em-modal-btn.alt { background: rgba(255,255,255,0.16); color: #fff; }
  .em-modal-btn.close { background: rgba(255,255,255,0.10); color: #fff; }
  .em-modal-btn:hover { filter: brightness(1.1); }
  .em-modal-btn:disabled { opacity: .5; cursor: not-allowed; }
  .em-modal iframe { width: 100%; flex: 1; min-height: 0; border: 0; background: #eef2f7; }

  @media (max-width: 680px) {
    .em-card-head { grid-template-columns: 40px 1fr auto auto; gap: 10px; padding: 12px 14px; }
    .em-card-head .count { display: none; }
    .em-inv-table { display: block; overflow-x: auto; }
  }
`;

function fmtDate(iso) {
  if (!iso) return { date: '—', time: '' };
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

export function EmailInvoicesPage() {
  const [list, setList] = useState([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [resendingId, setResendingId] = useState('');
  const [preview, setPreview] = useState(null);
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

  // Group invoices by customer. We key on customerId (stable) and surface email
  // as the headline because this view is the "by email" angle.
  const customers = useMemo(() => {
    const map = new Map();
    for (const inv of list) {
      const key = inv.customerId;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: inv.customerName,
          email: inv.email,
          phone: inv.phone,
          subscriptionActive: inv.subscriptionActive,
          invoices: [],
          total: 0,
          lastAt: null,
        });
      }
      const row = map.get(key);
      row.invoices.push(inv);
      row.total += Number(inv.amountEuro || 0);
      const ts = inv.createdAt ? new Date(inv.createdAt).getTime() : 0;
      if (ts && (!row.lastAt || ts > row.lastAt)) row.lastAt = ts;
    }
    return [...map.values()].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  }, [list]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      String(c.email || '').toLowerCase().includes(q) ||
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.phone || '').toLowerCase().includes(q) ||
      c.invoices.some((i) =>
        String(i.number || '').toLowerCase().includes(q) ||
        String(i.planLabel || '').toLowerCase().includes(q)
      )
    );
  }, [customers, search]);

  const stats = useMemo(() => {
    const revenue = filteredCustomers.reduce((s, c) => s + c.total, 0);
    const invoiceCount = filteredCustomers.reduce((s, c) => s + c.invoices.length, 0);
    const activeCount = filteredCustomers.filter((c) => c.subscriptionActive).length;
    return { customers: filteredCustomers.length, invoiceCount, revenue, activeCount };
  }, [filteredCustomers]);

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

  const resendOne = async (inv, customEmail = '') => {
    if (!emailConfigured) {
      setError('El email no está configurado en el servidor (variables SMTP_*).');
      return;
    }
    if (!customEmail && !inv.email) {
      setError('Este cliente no tiene email registrado.');
      return;
    }
    setResendingId(inv.id);
    setError(''); setInfo('');
    try {
      const res = await apiCall(`/api/admin/invoices/${inv.id}/resend`, {
        method: 'POST',
        body: JSON.stringify(customEmail ? { to: customEmail } : {}),
      });
      setInfo(`Factura ${inv.number} → enviada a ${res.sentTo}.`);
    } catch (e) {
      setError(e?.message || 'No se pudo enviar la factura');
    } finally {
      setResendingId('');
    }
  };

  const resendAllForCustomer = async (cust) => {
    if (!emailConfigured) {
      setError('El email no está configurado en el servidor (variables SMTP_*).');
      return;
    }
    if (!cust.email) {
      setError('Este cliente no tiene email registrado.');
      return;
    }
    const ok = window.confirm(
      `Reenviar las ${cust.invoices.length} factura${cust.invoices.length === 1 ? '' : 's'} de ${cust.name} a ${cust.email}?`
    );
    if (!ok) return;
    setError(''); setInfo('');
    let sent = 0;
    const failures = [];
    for (const inv of cust.invoices) {
      try {
        await apiCall(`/api/admin/invoices/${inv.id}/resend`, { method: 'POST', body: JSON.stringify({}) });
        sent += 1;
      } catch (e) {
        failures.push(`${inv.number}: ${e?.message || 'error'}`);
      }
    }
    if (failures.length) {
      setError(`Enviadas ${sent}/${cust.invoices.length}. Fallos: ${failures.join(' · ')}`);
    } else {
      setInfo(`${sent} factura${sent === 1 ? '' : 's'} reenviada${sent === 1 ? '' : 's'} a ${cust.email}.`);
    }
  };

  const resendModalCustomer = async () => {
    if (!preview) return;
    setModalBusy(true);
    try {
      const res = await apiCall(`/api/admin/invoices/${preview.id}/resend`, {
        method: 'POST',
        body: JSON.stringify(preview.email ? { to: preview.email } : {}),
      });
      setInfo(`Factura ${preview.number} → enviada a ${res.sentTo}.`);
    } catch (e) {
      setError(e?.message || 'No se pudo enviar la factura');
    } finally {
      setModalBusy(false);
    }
  };

  const resendModalCustom = async () => {
    if (!preview) return;
    const to = window.prompt('Enviar esta factura a otro email:', preview.email || '');
    if (!to || !to.trim()) return;
    setModalBusy(true);
    try {
      const res = await apiCall(`/api/admin/invoices/${preview.id}/resend`, {
        method: 'POST',
        body: JSON.stringify({ to: to.trim() }),
      });
      setInfo(`Factura ${preview.number} → enviada a ${res.sentTo}.`);
    } catch (e) {
      setError(e?.message || 'No se pudo enviar la factura');
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>Correos · Facturas por cliente</h1>
        <p>
          Vista por correo de cada cliente con su histórico completo de facturas. Despliega cualquier tarjeta para
          ver todas las facturas enviadas a ese email, descargarlas, previsualizarlas o reenviarlas — una a una o
          todas a la vez. Los datos son los mismos que en <strong>Facturas</strong>, pero agrupados por persona en
          lugar de por documento.
        </p>
      </header>

      {!emailConfigured ? (
        <div className="em-banner warn">
          <strong>Aviso:</strong> el envío de email no está configurado (faltan variables <code>SMTP_*</code> en el
          servidor). Puedes ver y descargar facturas; el reenvío por email no funcionará hasta configurarlo.
        </div>
      ) : null}
      {error ? <div className="em-banner err"><strong>Error:</strong> {error}</div> : null}
      {info ? <div className="em-banner ok"><strong>OK:</strong> {info}</div> : null}

      <div className="em-stats">
        <div className="em-stat"><div className="lbl">Clientes</div><div className="val">{stats.customers}</div></div>
        <div className="em-stat"><div className="lbl">Facturas</div><div className="val">{stats.invoiceCount}</div></div>
        <div className="em-stat"><div className="lbl">Suscripciones activas</div><div className="val">{stats.activeCount}</div></div>
        <div className="em-stat"><div className="lbl">Ingresos (filtro)</div><div className="val em">€{stats.revenue.toFixed(2)}</div></div>
      </div>

      <div className="em-toolbar">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por email, nombre, teléfono, nº de factura o plan…"
        />
        <button type="button" className="em-refresh" title="Actualizar" onClick={load} disabled={loading}>↻</button>
      </div>

      <div className="em-list">
        {filteredCustomers.map((cust) => {
          const isOpen = openId === cust.id;
          const last = fmtDate(cust.lastAt ? new Date(cust.lastAt).toISOString() : '');
          return (
            <div key={cust.id} className={`em-card${isOpen ? ' open' : ''}`}>
              <button
                type="button"
                className="em-card-head"
                onClick={() => setOpenId(isOpen ? null : cust.id)}
                aria-expanded={isOpen}
              >
                <span className="av">{initials(cust.name)}</span>
                <div className="who">
                  <strong>{cust.name}</strong>
                  <span className="em">{cust.email || 'sin email'}</span>
                  <span className="meta">
                    {cust.phone ? `${cust.phone} · ` : ''}
                    Última factura: {last.date}
                  </span>
                </div>
                <span className="count">{cust.invoices.length} factura{cust.invoices.length === 1 ? '' : 's'}</span>
                <span className="total">
                  €{cust.total.toFixed(2)}
                  <small>total facturado</small>
                </span>
                <span className="chev" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>

              {isOpen ? (
                <div className="em-card-body">
                  <div className="em-card-actions">
                    {cust.email ? (
                      <a className="a" href={`mailto:${cust.email}`} title="Escribir un email">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 4h16v16H4z M4 4l8 8 8-8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Escribir email
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="a"
                      onClick={() => resendAllForCustomer(cust)}
                      disabled={!emailConfigured || !cust.email}
                      style={{ color: 'var(--em)', borderColor: 'var(--border-em)' }}
                    >
                      Reenviar todas ({cust.invoices.length})
                    </button>
                    <span className="spacer" />
                    <span className={`sub ${cust.subscriptionActive ? 'on' : 'off'}`}>
                      {cust.subscriptionActive ? '● Suscripción activa' : '● Suscripción expirada'}
                    </span>
                  </div>

                  <table className="em-inv-table">
                    <thead>
                      <tr>
                        <th>Factura</th>
                        <th>Plan</th>
                        <th className="num">Importe</th>
                        <th>Fecha</th>
                        <th className="num">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cust.invoices.map((inv) => {
                        const dt = fmtDate(inv.createdAt);
                        return (
                          <tr key={inv.id}>
                            <td>
                              <span className="em-inv-num" onClick={() => openPreview(inv)} title="Ver factura">
                                {inv.number}
                              </span>
                            </td>
                            <td><span className="em-plan">{inv.planLabel}</span></td>
                            <td className="num em-amount">€{Number(inv.amountEuro).toFixed(2)}</td>
                            <td className="em-date">{dt.date}<small>{dt.time}</small></td>
                            <td className="num">
                              <div className="em-row-acts">
                                <button type="button" className="em" onClick={() => openPreview(inv)}>Ver</button>
                                <button
                                  type="button"
                                  onClick={() => resendOne(inv)}
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
                </div>
              ) : null}
            </div>
          );
        })}
        {filteredCustomers.length === 0 ? (
          <div className="em-empty">
            {loading ? 'Cargando…' : 'No hay clientes que coincidan con el filtro.'}
          </div>
        ) : null}
      </div>

      {preview ? (
        <div className="em-modal-overlay" onClick={() => setPreview(null)}>
          <div className="em-modal" onClick={(e) => e.stopPropagation()}>
            <div className="em-modal-bar">
              <div className="t">Factura {preview.number}</div>
              <div className="acts">
                <button type="button" className="em-modal-btn print" onClick={printPreview}>Imprimir / PDF</button>
                <button type="button" className="em-modal-btn alt" onClick={downloadPreview}>Descargar</button>
                <button type="button" className="em-modal-btn send" onClick={resendModalCustomer} disabled={modalBusy || !emailConfigured || !preview.email}>
                  {modalBusy ? 'Enviando…' : 'Reenviar al cliente'}
                </button>
                <button type="button" className="em-modal-btn alt" onClick={resendModalCustom} disabled={modalBusy || !emailConfigured}>
                  Reenviar a otro…
                </button>
                <button type="button" className="em-modal-btn close" onClick={() => setPreview(null)}>Cerrar</button>
              </div>
            </div>
            <iframe ref={iframeRef} title={`Factura ${preview.number}`} srcDoc={preview.html} />
          </div>
        </div>
      ) : null}
    </>
  );
}
