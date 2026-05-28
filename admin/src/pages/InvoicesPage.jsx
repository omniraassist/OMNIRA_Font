import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiCall } from '../api/client.js';

const STYLES = `
  .inv-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 20px; }
  .inv-stat {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border); border-radius: var(--r-md); padding: 18px 20px;
  }
  .inv-stat .lbl { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 700; }
  .inv-stat .val { font-size: 26px; font-weight: 800; color: var(--text); font-family: var(--font-display); margin-top: 6px; }
  .inv-stat .val.em { background: linear-gradient(135deg, var(--em), var(--em2)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }

  .inv-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; margin-bottom: 16px; }
  .inv-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .inv-banner.ok  { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }
  .inv-banner.warn { background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.30); color: #fde68a; }

  .inv-toolbar { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .inv-toolbar input {
    flex: 1; min-width: 220px; background: rgba(0,0,0,0.30); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 14px; color: var(--text); font-size: 14px;
  }
  .inv-toolbar input:focus { outline: none; border-color: var(--em); }
  .inv-refresh {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--soft);
    border-radius: 10px; padding: 0 16px; cursor: pointer; font-size: 16px;
  }
  .inv-refresh:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }

  .inv-table-wrap {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden;
  }
  .inv-table { width: 100%; border-collapse: collapse; }
  .inv-table thead th {
    text-align: left; padding: 13px 16px; font-size: 11px; letter-spacing: .05em; text-transform: uppercase;
    color: var(--muted); font-weight: 700; background: rgba(0,0,0,0.25); border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .inv-table thead th.num, .inv-table td.num { text-align: right; }
  .inv-table tbody td { padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text); vertical-align: middle; }
  .inv-table tbody tr:hover { background: rgba(255,255,255,0.02); }
  .inv-num { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--em); }
  .inv-cust strong { display: block; color: var(--text); }
  .inv-cust span { font-size: 12px; color: var(--muted); }
  .inv-plan { display: inline-block; padding: 3px 10px; border-radius: 999px; background: rgba(0,229,160,0.10); color: var(--em); font-size: 12px; font-weight: 600; }
  .inv-amount { font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .inv-paid { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #34d399; font-weight: 600; }
  .inv-paid::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; }
  .inv-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .inv-act {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--soft);
    border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap;
    transition: all .15s ease;
  }
  .inv-act:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }
  .inv-act.em:hover { color: var(--em); border-color: var(--border-em); background: rgba(0,229,160,0.08); }
  .inv-act:disabled { opacity: .5; cursor: not-allowed; }
  .inv-empty { padding: 40px; text-align: center; color: var(--muted); font-size: 14px; }

  .inv-modal-overlay {
    position: fixed; inset: 0; z-index: 2000; background: rgba(2,6,12,0.72);
    backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .inv-modal {
    background: #fff; border-radius: 14px; width: min(860px, 100%); max-height: 92vh; display: flex; flex-direction: column;
    overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.6);
  }
  .inv-modal-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 12px 16px; background: #0b1220; flex-shrink: 0;
  }
  .inv-modal-bar .t { color: #fff; font-size: 14px; font-weight: 700; font-family: var(--font-display); }
  .inv-modal-bar .acts { display: flex; gap: 8px; }
  .inv-modal-btn { border: 0; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .inv-modal-btn.print { background: linear-gradient(135deg, var(--em), var(--em2)); color: #04201a; }
  .inv-modal-btn.send { background: #1f6feb; color: #fff; }
  .inv-modal-btn.close { background: rgba(255,255,255,0.12); color: #fff; }
  .inv-modal-btn:hover { filter: brightness(1.08); }
  .inv-modal iframe { width: 100%; height: 70vh; border: 0; background: #eef2f7; flex: 1; }
`;

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

export function InvoicesPage() {
  const [list, setList] = useState([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null); // { id, number, html }
  const [resendingId, setResendingId] = useState('');
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
      setPreview({ id: inv.id, number: inv.number, html: res.html });
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

  const resend = async (inv) => {
    if (!emailConfigured) {
      setError('El email no está configurado en el servidor (variables SMTP_*).');
      return;
    }
    setResendingId(inv.id);
    setError(''); setInfo('');
    try {
      const res = await apiCall(`/api/admin/invoices/${inv.id}/resend`, { method: 'POST', body: JSON.stringify({}) });
      setInfo(`Factura ${inv.number} reenviada a ${res.sentTo || inv.email}.`);
    } catch (e) {
      setError(e?.message || 'No se pudo reenviar la factura');
    } finally {
      setResendingId('');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) =>
        String(i.number || '').toLowerCase().includes(q) ||
        String(i.customerName || '').toLowerCase().includes(q) ||
        String(i.email || '').toLowerCase().includes(q) ||
        String(i.planLabel || '').toLowerCase().includes(q)
    );
  }, [list, search]);

  const stats = useMemo(() => {
    const total = list.length;
    const revenue = list.reduce((s, i) => s + Number(i.amountEuro || 0), 0);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRevenue = list
      .filter((i) => i.createdAt && new Date(i.createdAt) >= monthStart)
      .reduce((s, i) => s + Number(i.amountEuro || 0), 0);
    return { total, revenue, monthRevenue };
  }, [list]);

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>Facturas</h1>
        <p>
          Cada pago de suscripción genera una factura. Desde aquí puedes ver el documento A4, imprimirlo o
          guardarlo como PDF, y reenviarlo por email al cliente. Las facturas nuevas se envían automáticamente
          al correo del cliente al completar el pago.
        </p>
      </header>

      {!emailConfigured ? (
        <div className="inv-banner warn">
          <strong>Aviso:</strong> el envío de email no está configurado en el servidor (faltan las variables
          <code> SMTP_*</code>). Puedes ver e imprimir facturas, pero el reenvío por email no funcionará hasta configurarlo.
        </div>
      ) : null}
      {error ? <div className="inv-banner err"><strong>Error:</strong> {error}</div> : null}
      {info ? <div className="inv-banner ok"><strong>OK:</strong> {info}</div> : null}

      <div className="inv-stats">
        <div className="inv-stat"><div className="lbl">Facturas totales</div><div className="val">{stats.total}</div></div>
        <div className="inv-stat"><div className="lbl">Ingresos totales</div><div className="val em">€{stats.revenue.toFixed(2)}</div></div>
        <div className="inv-stat"><div className="lbl">Este mes</div><div className="val">€{stats.monthRevenue.toFixed(2)}</div></div>
      </div>

      <div className="inv-toolbar">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nº, cliente, email o plan…"
        />
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
              <th>Estado</th>
              <th className="num">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => (
              <tr key={inv.id}>
                <td><span className="inv-num">{inv.number}</span></td>
                <td className="inv-cust"><strong>{inv.customerName}</strong><span>{inv.email}</span></td>
                <td><span className="inv-plan">{inv.planLabel}</span></td>
                <td className="num inv-amount">€{Number(inv.amountEuro).toFixed(2)}</td>
                <td>{fmtDate(inv.createdAt)}</td>
                <td><span className="inv-paid">Pagado</span></td>
                <td className="num">
                  <div className="inv-actions">
                    <button type="button" className="inv-act em" onClick={() => openPreview(inv)}>Ver</button>
                    <button
                      type="button"
                      className="inv-act"
                      onClick={() => resend(inv)}
                      disabled={resendingId === inv.id || !emailConfigured || !inv.email}
                    >
                      {resendingId === inv.id ? 'Enviando…' : 'Reenviar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="inv-empty">{loading ? 'Cargando…' : 'No hay facturas todavía.'}</div>
        ) : null}
      </div>

      {preview ? (
        <div className="inv-modal-overlay" onClick={() => setPreview(null)}>
          <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-bar">
              <div className="t">Factura {preview.number}</div>
              <div className="acts">
                <button type="button" className="inv-modal-btn print" onClick={printPreview}>Imprimir / PDF</button>
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
