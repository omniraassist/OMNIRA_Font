import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';
import { ONBOARDING_DONE_KEY, PLAN_STORAGE_KEY } from '../constants/plans.js';

const PanelContext = createContext(null);

function readSession() {
  try {
    const raw = localStorage.getItem('omnira_session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSessionUser(user) {
  const s = readSession();
  if (!s?.token) return;
  const next = { ...s, user: { ...s.user, ...user } };
  localStorage.setItem('omnira_session', JSON.stringify(next));
}

// The dev-mode test bypass has been removed. Customers must complete a real
// Stripe payment (or admin-granted subscription) before they can reach the
// dashboard. Any stale `omnira_test_paid` flag from earlier sessions is
// cleared at module load so it never leaks.
try { localStorage.removeItem('omnira_test_paid'); } catch { /* ignore */ }
function applyTestPaidOverride(user) {
  return user;
}

export function PanelProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('login');
  const [user, setUser] = useState(null);

  const closeClientPanel = useCallback(() => {
    setOpen(false);
    document.body.style.overflow = '';
  }, []);

  const enterDashboard = useCallback((u) => {
    setUser(u);
    setView('dashboard');
  }, []);

  /** Tras login/registro: panel según suscripción */
  const completeCustomerAuth = useCallback((res) => {
    try {
      localStorage.setItem('omnira_session', JSON.stringify(res));
    } catch {
      /* ignore */
    }
    const u = applyTestPaidOverride(res.user);
    if (u && u.__test_paid) writeSessionUser(u);
    setUser(u);
    if (!u?.subscriptionActive) {
      setView('planHome');
      return;
    }
    setView('dashboard');
  }, []);

  const enterPlanHome = useCallback((u) => {
    setUser(u);
    setView('planHome');
  }, []);

  const completePlanSelection = useCallback(() => {
    setView('paymentStep');
  }, []);

  const completePaymentStep = useCallback(() => {
    setView('onboarding');
  }, []);

  const openClientPanel = useCallback(
    async (initial) => {
      setOpen(true);
      document.body.style.overflow = 'hidden';

      // Dev preview: skip auth and go straight to the target view.
      if (initial === 'preview-twilio') {
        setView('onboarding');
        return;
      }

      if (initial === 'stripe-return') {
        const sid = sessionStorage.getItem('omnira_pending_checkout');
        sessionStorage.removeItem('omnira_pending_checkout');
        const sess = readSession();
        if (!sess?.token) {
          setView('login');
          return;
        }
        setUser(sess.user);
        if (!sid) {
          setView(sess.user?.subscriptionActive ? 'dashboard' : 'paymentStep');
          return;
        }
        try {
          const r = await apiCall('/api/customer/stripe/confirm', {
            method: 'POST',
            body: JSON.stringify({ session_id: sid }),
          });
          if (r.ok && r.user) {
            writeSessionUser(r.user);
            setUser(r.user);
            setView('onboarding');
            return;
          }
        } catch {
          /* fall through */
        }
        setView('paymentStep');
        return;
      }

      if (initial === 'stripe-canceled') {
        const sess = readSession();
        if (sess?.user && sess?.token) {
          const u = applyTestPaidOverride(sess.user);
          setUser(u);
          setView(u.subscriptionActive ? 'dashboard' : 'paymentStep');
        } else {
          setView('login');
        }
        return;
      }

      if (initial === 'login' || initial === 'register' || initial === 'forgot') {
        setView(initial === 'register' ? 'login' : initial);
        return;
      }

      const sess = readSession();
      if (sess?.user && sess?.token) {
        setUser(applyTestPaidOverride(sess.user));
        try {
          const me = await apiCall('/api/customer/me');
          const u = applyTestPaidOverride(me.user);
          writeSessionUser(u);
          setUser(u);
          if (!u.subscriptionActive) {
            setView('planHome');
            return;
          }
          setView('dashboard');
          return;
        } catch {
          const fallback = applyTestPaidOverride(sess.user);
          if (!fallback?.subscriptionActive) {
            setView('planHome');
            return;
          }
          setView('dashboard');
          return;
        }
      }
      setView(initial === 'register' ? 'register' : 'login');
    },
    []
  );

  const showLogin = useCallback(() => setView('login'), []);
  const showRegister = useCallback(() => setView('register'), []);
  const showForgot = useCallback(() => setView('forgot'), []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('omnira_session');
    try {
      localStorage.removeItem(PLAN_STORAGE_KEY);
      localStorage.removeItem(ONBOARDING_DONE_KEY);
      localStorage.removeItem('omnira_test_paid');
    } catch {
      /* ignore */
    }
    setUser(null);
    setView('login');
  }, []);

  const refreshCustomerUser = useCallback(async () => {
    const sess = readSession();
    if (!sess?.token) return null;
    try {
      const me = await apiCall('/api/customer/me');
      if (me?.user) {
        const u = applyTestPaidOverride(me.user);
        writeSessionUser(u);
        setUser(u);
        return u;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      view,
      setView,
      user,
      setUser,
      openClientPanel,
      closeClientPanel,
      showLogin,
      showRegister,
      showForgot,
      enterDashboard,
      enterPlanHome,
      completeCustomerAuth,
      completePlanSelection,
      completePaymentStep,
      handleLogout,
      refreshCustomerUser,
    }),
    [
      open,
      view,
      user,
      openClientPanel,
      closeClientPanel,
      showLogin,
      showRegister,
      showForgot,
      enterDashboard,
      enterPlanHome,
      completeCustomerAuth,
      completePlanSelection,
      completePaymentStep,
      handleLogout,
      refreshCustomerUser,
    ]
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanel must be used within PanelProvider');
  return ctx;
}
