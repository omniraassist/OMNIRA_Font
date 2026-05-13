import { useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';
import { OMNIRA_PLANS, mergePlanDisplay } from '../constants/plans.js';

/**
 * Fetches /api/public/pricing once and merges live amount_cents/period_text with
 * the static features/featured flags in OMNIRA_PLANS. Returns a stable list in
 * sort_order. Falls back to the hardcoded amounts in OMNIRA_PLANS if the API
 * call fails (matches the server's FALLBACK_PLANS so checkout still works
 * during a transient outage).
 */
export function usePricing() {
  const [livePlans, setLivePlans] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiCall('/api/public/pricing')
      .then((res) => {
        if (cancelled) return;
        setLivePlans(Array.isArray(res?.plans) ? res.plans : null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || 'pricing fetch failed');
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const plans = OMNIRA_PLANS.map((p) => {
    const live = livePlans?.find((x) => x.id === p.id);
    return mergePlanDisplay(p, live);
  })
    .filter((p) => (livePlans ? (livePlans.find((x) => x.id === p.id)?.is_active !== false ? true : false) : true))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const plansByCheapest = [...plans].sort(
    (a, b) => (a.amount_cents ?? 0) - (b.amount_cents ?? 0)
  );

  return { plans, plansByCheapest, loaded, error };
}
