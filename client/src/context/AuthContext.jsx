import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall } from '../api/client.js';
import { ONBOARDING_DONE_KEY, PLAN_STORAGE_KEY } from '../constants/plans.js';

const MARKETING_SITE_URL = import.meta.env.VITE_MARKETING_SITE || 'https://omnira.es';

const AuthContext = createContext(null);

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
  localStorage.setItem('omnira_session', JSON.stringify({ ...s, user: { ...s.user, ...user } }));
}

// Clear any stale dev-mode bypass flag.
try { localStorage.removeItem('omnira_test_paid'); } catch { /* ignore */ }

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => readSession()?.user || null);

  const goToSite = useCallback(() => {
    window.location.href = MARKETING_SITE_URL;
  }, []);

  const showLogin    = useCallback(() => navigate('/login'),    [navigate]);
  const showRegister = useCallback(() => navigate('/register'), [navigate]);
  const showForgot   = useCallback(() => navigate('/forgot'),   [navigate]);

  const completeCustomerAuth = useCallback((res) => {
    try { localStorage.setItem('omnira_session', JSON.stringify(res)); } catch { /* ignore */ }
    const u = res.user;
    setUser(u);
    if (!u?.subscriptionActive) {
      navigate('/plans');
    } else {
      navigate('/dashboard');
    }
  }, [navigate]);

  const enterDashboard = useCallback((u) => {
    setUser(u);
    navigate('/dashboard');
  }, [navigate]);

  const enterPlanHome = useCallback((u) => {
    if (u) setUser(u);
    navigate('/plans');
  }, [navigate]);

  const completePlanSelection  = useCallback(() => navigate('/payment'),    [navigate]);
  const completePaymentStep    = useCallback(() => navigate('/onboarding'), [navigate]);
  const completeWhatsAppSetup  = useCallback(() => navigate('/dashboard'),  [navigate]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('omnira_session');
    try {
      localStorage.removeItem(PLAN_STORAGE_KEY);
      localStorage.removeItem(ONBOARDING_DONE_KEY);
    } catch { /* ignore */ }
    setUser(null);
    navigate('/login');
  }, [navigate]);

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
    } catch { /* ignore */ }
    return null;
  }, []);

  const value = useMemo(() => ({
    // User state
    user,
    setUser,
    // Navigation — same names as PanelContext so components work unchanged
    closeClientPanel: goToSite,
    openClientPanel: () => {},
    open: true,
    view: null,
    setView: () => {},
    showLogin,
    showRegister,
    showForgot,
    // Auth flow
    completeCustomerAuth,
    enterDashboard,
    enterPlanHome,
    completePlanSelection,
    completePaymentStep,
    completeWhatsAppSetup,
    handleLogout,
    refreshCustomerUser,
  }), [
    user,
    goToSite,
    showLogin, showRegister, showForgot,
    completeCustomerAuth,
    enterDashboard, enterPlanHome,
    completePlanSelection, completePaymentStep, completeWhatsAppSetup,
    handleLogout, refreshCustomerUser,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Exported as usePanel so existing component code needs only an import-path change.
export function usePanel() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('usePanel must be used within AuthProvider');
  return ctx;
}
