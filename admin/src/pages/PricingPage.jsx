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

export function PricingPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [draft, setDraft] = useState({});
  const [savingId, setSavingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/pricing');
      setPlans(res.plans || []);
      const next = {};
      for (const p of res.plans || []) {
        next[p.id] = {
          amount_euro: centsToEuro(p.amount_cents),
          label: p.label || '',
          period_text: p.period_text || '',
          is_active: !!p.is_active,
        };
      }
      setDraft(next);
    } catch (e) {
      setError(e?.message || 'Could not load pricing');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateField = (id, key, value) => {
    setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), [key]: value } }));
  };

  const save = async (plan) => {
    const d = draft[plan.id] || {};
    const cents = euroToCents(d.amount_euro);
    if (!Number.isInteger(cents) || cents <= 0) {
      setError(`Plan ${plan.id}: invalid price (use a positive number like 49 or 49.00).`);
      return;
    }
    setError('');
    setInfo('');
    setSavingId(plan.id);
    try {
      const res = await apiCall(`/api/admin/pricing/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount_cents: cents,
          label: d.label,
          period_text: d.period_text,
          is_active: !!d.is_active,
        }),
      });
      setPlans((all) => all.map((p) => (p.id === plan.id ? res.plan : p)));
      setInfo(`Saved ${plan.id} — Stripe will use the new amount from the next checkout (cache invalidated).`);
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSavingId('');
    }
  };

  return (
    <>
      <header className="adm-page-head">
        <h1>Pricing</h1>
        <p>
          Edit the amount Stripe charges for each Omnira pack. The customer landing page, the post-login plan picker
          and the embedded Stripe checkout all read these values live. Duration is locked here so already-paid
          subscriptions keep their original end date.
        </p>
      </header>

      <div className="adm-toolbar">
        <button type="button" className="adm-btn adm-btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span className="adm-mono" style={{ color: 'var(--muted)' }}>{plans.length} plans</span>
      </div>

      {error ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Error:</strong> <span style={{ color: 'var(--muted)' }}>{error}</span>
        </div>
      ) : null}
      {info ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(34,197,94,0.4)' }}>
          <strong style={{ color: '#bbf7d0' }}>OK:</strong> <span style={{ color: 'var(--muted)' }}>{info}</span>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}
      >
        {plans.map((p) => {
          const d = draft[p.id] || {};
          const isSaving = savingId === p.id;
          return (
            <section key={p.id} className="adm-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <h2 className="adm-card-title" style={{ marginBottom: 0 }}>{p.id}</h2>
                <span className={`adm-badge ${d.is_active ? 'active' : 'paused'}`}>
                  {d.is_active ? 'active' : 'hidden'}
                </span>
              </div>

              <div className="adm-form-grid" style={{ marginTop: 14 }}>
                <div className="adm-field">
                  <label>Display label</label>
                  <input
                    value={d.label || ''}
                    onChange={(e) => updateField(p.id, 'label', e.target.value)}
                    placeholder="3 meses"
                  />
                </div>
                <div className="adm-field">
                  <label>Period suffix</label>
                  <input
                    value={d.period_text || ''}
                    onChange={(e) => updateField(p.id, 'period_text', e.target.value)}
                    placeholder="/mes"
                  />
                </div>
                <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Amount ({String(p.currency || 'eur').toUpperCase()})</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={d.amount_euro || ''}
                      onChange={(e) => updateField(p.id, 'amount_euro', e.target.value)}
                      placeholder="49.00"
                      style={{ flex: 1 }}
                    />
                    <span className="adm-mono" style={{ color: 'var(--muted)' }}>
                      = {Number.isFinite(euroToCents(d.amount_euro)) ? euroToCents(d.amount_euro) : '—'} cents
                    </span>
                  </div>
                  <p className="adm-field-hint" style={{ marginTop: 4 }}>
                    Stripe charges this amount on next checkout. Duration is fixed at {p.duration_days} days.
                  </p>
                </div>
                <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!d.is_active}
                      onChange={(e) => updateField(p.id, 'is_active', e.target.checked)}
                      style={{ marginRight: 8 }}
                    />
                    Visible to customers
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() =>
                    setDraft((all) => ({
                      ...all,
                      [p.id]: {
                        amount_euro: centsToEuro(p.amount_cents),
                        label: p.label || '',
                        period_text: p.period_text || '',
                        is_active: !!p.is_active,
                      },
                    }))
                  }
                >
                  Reset
                </button>
                <button type="button" className="adm-btn adm-btn-primary" onClick={() => save(p)} disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </section>
          );
        })}
        {!plans.length && !loading ? (
          <div className="adm-card" style={{ color: 'var(--muted)' }}>
            No pricing plans found. Apply server/sql/phase2-pricing.sql in Supabase SQL Editor first.
          </div>
        ) : null}
      </div>
    </>
  );
}
