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

  /** Tras login/registro: panel según suscripción y onboarding */
  const completeCustomerAuth = useCallback((res) => {
    try {
      localStorage.setItem('omnira_session', JSON.stringify(res));
    } catch {
      /* ignore */
    }
    const u = res.user;
    setUser(u);
    if (!u?.subscriptionActive) {
      setView('planHome');
      return;
    }
    try {
      const done = localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
      if (!done) {
        setView('whatsAppSetup');
        return;
      }
    } catch {
      /* ignore */
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
    setView('whatsAppSetup');
  }, []);

  const completeWhatsAppSetup = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    } catch {
      /* ignore */
    }
    setView('dashboard');
  }, []);

  const openClientPanel = useCallback(
    async (initial) => {
      setOpen(true);
      document.body.style.overflow = 'hidden';

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
            setView('whatsAppSetup');
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
          setUser(sess.user);
          setView('paymentStep');
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
        setUser(sess.user);
        try {
          const me = await apiCall('/api/customer/me');
          const u = me.user;
          writeSessionUser(u);
          setUser(u);
          if (!u.subscriptionActive) {
            setView('planHome');
            return;
          }
          const done = localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
          setView(done ? 'dashboard' : 'whatsAppSetup');
          return;
        } catch {
          if (!sess.user?.subscriptionActive) {
            setView('planHome');
            return;
          }
          const done = localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
          setView(done ? 'dashboard' : 'whatsAppSetup');
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
        writeSessionUser(me.user);
        setUser(me.user);
        return me.user;
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
      completeWhatsAppSetup,
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
      completeWhatsAppSetup,
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
