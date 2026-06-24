import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';

function centsToEuro(c) {
  const n = Number(c || 0) / 100;
  return n.toFixed(2);
}
function euroToCents(str) {
  const cleaned = String(str || '').replace(',', '.').trim();
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  return Math.round(n * 100);
}

const STYLES = `
  .pr-page { display: flex; flex-direction: column; gap: 18px; }

  .pr-hero {
    background:
      radial-gradient(80% 60% at 0% 0%, rgba(0,229,160,0.10), transparent 60%),
      radial-gradient(60% 50% at 100% 0%, rgba(96,165,250,0.10), transparent 65%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 22px 24px;
    animation: pr-rise .35s ease-out both;
  }
  @keyframes pr-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .pr-hero h1 { margin: 0; font-family: var(--font-display); font-size: 22px; color: var(--text); line-height: 1.2; }
  .pr-hero h1 .grad { background: linear-gradient(90deg, var(--em) 0%, #93c5fd 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .pr-hero p { margin: 6px 0 14px; font-size: 13px; color: var(--soft); line-height: 1.6; }
  .pr-stats { display: flex; gap: 14px; flex-wrap: wrap; }
  .pr-stat {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 12px;
    color: var(--soft);
  }
  .pr-stat strong { color: var(--text); font-family: 'JetBrains Mono', monospace; }
  .pr-stat .dot { width: 7px; height: 7px; border-radius: 999px; background: var(--em); }

  .pr-toolbar { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
  .pr-refresh {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
    padding: 9px 14px;
    border-radius: 10px;
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 13px;
    transition: all .15s ease;
  }
  .pr-refresh:hover { color: var(--em); border-color: var(--border-em); }
  .pr-refresh.spin svg { animation: pr-spin .8s linear infinite; }
  @keyframes pr-spin { to { transform: rotate(360deg); } }

  .pr-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }

  .pr-card {
    position: relative;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 24px 20px 20px;
    overflow: hidden;
    transition: all .25s ease;
    animation: pr-rise .4s ease-out both;
    display: flex; flex-direction: column; gap: 14px;
  }
  .pr-card:nth-child(1) { animation-delay: .02s; }
  .pr-card:nth-child(2) { animation-delay: .08s; }
  .pr-card:nth-child(3) { animation-delay: .14s; }
  .pr-card:nth-child(4) { animation-delay: .20s; }
  .pr-card:hover { transform: translateY(-4px); border-color: var(--border-em); box-shadow: 0 20px 40px rgba(0,229,160,0.08); }
  .pr-card.featured {
    border-color: var(--border-em);
    background:
      radial-gradient(80% 50% at 50% 0%, rgba(0,229,160,0.12), transparent 70%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    box-shadow: 0 0 0 1px rgba(0,229,160,0.18), 0 16px 36px rgba(0,229,160,0.10);
  }
  .pr-card.featured::before {
    content: 'Mejor valor';
    position: absolute;
    top: 14px; right: 14px;
    background: linear-gradient(90deg, var(--em) 0%, #93c5fd 100%);
    color: #00120a;
    font-size: 10px; font-weight: 700;
    letter-spacing: .04em; text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 999px;
    box-shadow: 0 4px 12px rgba(0,229,160,0.30);
  }
  .pr-card.inactive { opacity: 0.6; }

  .pr-card-head { display: flex; justify-content: space-between; align-items: center; }
  .pr-plan-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; letter-spacing: .04em; text-transform: uppercase;
    color: var(--muted);
    padding: 3px 8px;
    background: rgba(255,255,255,0.04);
    border-radius: 999px;
  }
  .pr-status {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  }
  .pr-status.active { background: rgba(0,229,160,0.10); color: var(--em); }
  .pr-status.hidden { background: rgba(148,163,184,0.12); color: var(--soft); }

  .pr-label {
    font-family: var(--font-display);
    font-size: 24px;
    color: var(--text);
    font-weight: 700;
    line-height: 1.1;
    margin-top: 4px;
  }

  .pr-price {
    display: flex; align-items: baseline; gap: 4px;
    margin: 4px 0 8px;
  }
  .pr-price .cur { font-size: 22px; color: var(--soft); font-family: var(--font-display); font-weight: 600; }
  .pr-price .amount {
    font-family: var(--font-display);
    font-size: 56px;
    font-weight: 800;
    color: var(--text);
    background: linear-gradient(180deg, var(--text) 0%, var(--soft) 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    line-height: 1;
  }
  .pr-card.featured .pr-price .amount {
    background: linear-gradient(180deg, var(--em) 0%, #93c5fd 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .pr-price .period { font-size: 13px; color: var(--muted); margin-left: 4px; }
  .pr-monthly { font-size: 12px; color: var(--soft); }
  .pr-monthly strong { color: var(--em); font-family: 'JetBrains Mono', monospace; }

  .pr-divider { height: 1px; background: var(--border); margin: 4px 0; }

  /* Edit area (always visible inline) */
  .pr-edit { display: flex; flex-direction: column; gap: 10px; }
  .pr-row { display: flex; flex-direction: column; gap: 4px; }
  .pr-row label { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .pr-row input, .pr-row textarea {
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 9px 12px;
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color .15s ease;
  }
  .pr-row input:focus { border-color: var(--em); background: rgba(0,0,0,0.45); }
  .pr-row.amount input { font-family: var(--font-display); font-size: 16px; font-weight: 700; }
  .pr-cents-hint { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
  .pr-checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--soft); cursor: pointer; user-select: none; }
  .pr-checkbox input { accent-color: var(--em); }
  .pr-card-actions { display: flex; gap: 8px; margin-top: 6px; }
  .pr-btn {
    flex: 1;
    background: linear-gradient(180deg, var(--em) 0%, var(--em2) 100%);
    color: #00120a; font-weight: 700;
    border: 0; border-radius: 10px;
    padding: 10px 16px;
    cursor: pointer;
    font-size: 13px;
    transition: filter .15s ease, transform .15s ease;
  }
  .pr-btn:disabled { filter: grayscale(.6) brightness(.7); cursor: not-allowed; }
  .pr-btn:not(:disabled):hover { filter: brightness(1.08); transform: translateY(-1px); }
  .pr-btn-ghost {
    background: transparent;
    color: var(--soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    cursor: pointer;
    font-size: 13px;
    transition: all .15s ease;
  }
  .pr-btn-ghost:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }

  .pr-foot { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }
  .pr-foot .dirty { color: var(--em); font-weight: 700; margin-left: 6px; }

  .pr-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; animation: pr-rise .25s ease-out; }
  .pr-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .pr-banner.ok  { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }

  .pr-empty {
    padding: 32px;
    text-align: center;
    color: var(--muted);
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px dashed rgba(255,255,255,0.08);
    border-radius: var(--r-md);
  }

  @media (max-width: 560px) {
    .pr-hero { padding: 18px; }
    .pr-card { padding: 20px 16px 16px; }
    .pr-price .amount { font-size: 44px; }
  }
`;

export function PricingPage() {
  const [plans, setPlans] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/pricing');
      const list = res.plans || [];
      setPlans(list);
      const next = {};
      for (const p of list) {
        next[p.id] = {
          amount_euro: centsToEuro(p.amount_cents),
          label: p.label || '',
          period_text: p.period_text || '',
          is_active: !!p.is_active,
          stripe_price_id: p.stripe_price_id || '',
        };
      }
      setDrafts(next);
    } catch (e) {
      setError(e?.message || 'No se pudieron cargar los precios');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateField = (id, key, value) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [key]: value } }));
  };

  const isDirty = (plan) => {
    const d = drafts[plan.id];
    if (!d) return false;
    return (
      Number(euroToCents(d.amount_euro)) !== Number(plan.amount_cents) ||
      d.label !== (plan.label || '') ||
      d.period_text !== (plan.period_text || '') ||
      !!d.is_active !== !!plan.is_active ||
      d.stripe_price_id !== (plan.stripe_price_id || '')
    );
  };

  const save = async (plan) => {
    const d = drafts[plan.id] || {};
    const cents = euroToCents(d.amount_euro);
    if (!Number.isInteger(cents) || cents <= 0) {
      setError(`Plan "${plan.id}": precio no válido (usa un número positivo, p. ej. 49 o 49.00).`);
      return;
    }
    setError(''); setInfo('');
    setSavingId(plan.id);
    try {
      const res = await apiCall(`/api/admin/pricing/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount_cents: cents,
          label: d.label,
          period_text: d.period_text,
          is_active: !!d.is_active,
          stripe_price_id: d.stripe_price_id || null,
        }),
      });
      setPlans((all) => all.map((p) => (p.id === plan.id ? res.plan : p)));
      setInfo(`"${res.plan.label || res.plan.id}" actualizado. Stripe usará el nuevo importe a partir del próximo pago.`);
    } catch (e) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSavingId('');
    }
  };

  const reset = (plan) => {
    setDrafts((d) => ({
      ...d,
      [plan.id]: {
        amount_euro: centsToEuro(plan.amount_cents),
        label: plan.label || '',
        period_text: plan.period_text || '',
        is_active: !!plan.is_active,
        stripe_price_id: plan.stripe_price_id || '',
      },
    }));
  };

  const activeCount = plans.filter((p) => p.is_active).length;
  const totalCents = plans.reduce((s, p) => s + Number(p.amount_cents || 0), 0);

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head" style={{ marginBottom: 0, padding: 0, height: 0, overflow: 'hidden' }} aria-hidden>
        <h1>Precios</h1>
      </header>

      <div className="pr-page">
        <section className="pr-hero">
          <h1>Precios de <span className="grad">Stripe</span></h1>
          <p>
            Edita el importe que cobra Stripe por cada pack Omnira. La página de inicio, el selector de plan tras
            iniciar sesión y el checkout integrado leen estos valores <strong>en vivo</strong> — sin redeploy. La
            duración está fijada para que las suscripciones ya pagadas conserven su fecha de fin original.
          </p>
          <div className="pr-stats">
            <span className="pr-stat"><span className="dot" /> <strong>{plans.length}</strong> planes</span>
            <span className="pr-stat"><span className="dot" /> <strong>{activeCount}</strong> activos</span>
            <span className="pr-stat">catálogo total <strong>€{(totalCents / 100).toFixed(2)}</strong></span>
          </div>
        </section>

        <div className="pr-toolbar">
          <button
            type="button"
            className={`pr-refresh${loading ? ' spin' : ''}`}
            onClick={load}
            disabled={loading}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M3 12a9 9 0 0 1 15.5-6.3M21 4v6h-6M21 12a9 9 0 0 1-15.5 6.3M3 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>

        {error ? <div className="pr-banner err"><strong>Error:</strong> {error}</div> : null}
        {info ? <div className="pr-banner ok"><strong>OK:</strong> {info}</div> : null}

        {!plans.length && !loading ? (
          <div className="pr-empty">
            Aún no hay planes de precios. Aplica <code>server/sql/phase2-pricing.sql</code> en el editor SQL de Supabase.
          </div>
        ) : (
          <div className="pr-grid">
            {plans.map((plan, idx) => {
              const d = drafts[plan.id] || {};
              const isLast = idx === plans.length - 1; // longest plan = featured
              const months = Math.max(1, Math.round((plan.duration_days || 30) / 30));
              const dirtyNow = isDirty(plan);
              const cents = euroToCents(d.amount_euro);
              const monthlyEuro = Number.isInteger(cents) && cents > 0 ? cents / 100 / months : null;
              return (
                <article
                  key={plan.id}
                  className={`pr-card${isLast ? ' featured' : ''}${!d.is_active ? ' inactive' : ''}`}
                >
                  <div className="pr-card-head">
                    <span className="pr-plan-id">{plan.id}</span>
                    <span className={`pr-status ${d.is_active ? 'active' : 'hidden'}`}>
                      {d.is_active ? '● visible' : '○ oculto'}
                    </span>
                  </div>

                  <div className="pr-label">{d.label || plan.label}</div>

                  <div>
                    <div className="pr-price">
                      <span className="cur">€</span>
                      <span className="amount">
                        {Number.isInteger(cents) && cents > 0 ? (cents / 100).toFixed(0) : '—'}
                      </span>
                      <span className="period">{d.period_text || plan.period_text || ''}</span>
                    </div>
                    <div className="pr-monthly">
                      {monthlyEuro != null ? (
                        months > 1 ? (
                          <>≈ <strong>€{monthlyEuro.toFixed(2)}</strong> / mes equivalente · {plan.duration_days} días</>
                        ) : (
                          <>{plan.duration_days} días · sin compromiso</>
                        )
                      ) : (
                        <>{plan.duration_days} días</>
                      )}
                    </div>
                  </div>

                  <div className="pr-divider" />

                  <div className="pr-edit">
                    <div className="pr-row amount">
                      <label>Importe (€)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={d.amount_euro || ''}
                        onChange={(e) => updateField(plan.id, 'amount_euro', e.target.value)}
                        placeholder="49.00"
                      />
                      <span className="pr-cents-hint">
                        = {Number.isFinite(cents) ? cents : '—'} céntimos (Stripe `unit_amount`)
                      </span>
                    </div>

                    <div className="pr-row">
                      <label>Etiqueta visible</label>
                      <input
                        type="text"
                        value={d.label || ''}
                        onChange={(e) => updateField(plan.id, 'label', e.target.value)}
                        placeholder="3 meses"
                      />
                    </div>

                    <div className="pr-row">
                      <label>Sufijo de periodo</label>
                      <input
                        type="text"
                        value={d.period_text || ''}
                        onChange={(e) => updateField(plan.id, 'period_text', e.target.value)}
                        placeholder="/mes"
                      />
                    </div>

                    <div className="pr-row">
                      <label>Stripe Price ID (suscripción)</label>
                      <input
                        type="text"
                        value={d.stripe_price_id || ''}
                        onChange={(e) => updateField(plan.id, 'stripe_price_id', e.target.value)}
                        placeholder="price_1… (déjalo vacío para pago único)"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                      />
                    </div>

                    <label className="pr-checkbox">
                      <input
                        type="checkbox"
                        checked={!!d.is_active}
                        onChange={(e) => updateField(plan.id, 'is_active', e.target.checked)}
                      />
                      Visible para los clientes
                    </label>
                  </div>

                  <div className="pr-card-actions">
                    <button
                      type="button"
                      className="pr-btn-ghost"
                      onClick={() => reset(plan)}
                      disabled={savingId === plan.id || !dirtyNow}
                    >
                      Restablecer
                    </button>
                    <button
                      type="button"
                      className="pr-btn"
                      onClick={() => save(plan)}
                      disabled={savingId === plan.id || !dirtyNow}
                    >
                      {savingId === plan.id ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>

                  <div className="pr-foot">
                    {plan.duration_days} días fijados
                    {plan.stripe_price_id ? (
                      <span style={{ marginLeft: 8, color: '#10b981' }}>● suscripción recurrente</span>
                    ) : (
                      <span style={{ marginLeft: 8, color: 'var(--muted)' }}>pago único</span>
                    )}
                    {dirtyNow ? <span className="dirty"> ● cambios pendientes</span> : ''}
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
