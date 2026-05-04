import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

const PanelContext = createContext(null);

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

  const openClientPanel = useCallback(
    async (initial) => {
      setOpen(true);
      document.body.style.overflow = 'hidden';
      const sess = localStorage.getItem('omnira_session');
      if (sess) {
        try {
          const data = JSON.parse(sess);
          if (data.user && data.token) {
            const fresh = await apiCall('/api/auth/me').catch(() => null);
            if (fresh?.user) {
              localStorage.setItem(
                'omnira_session',
                JSON.stringify({ user: fresh.user, token: data.token })
              );
              enterDashboard(fresh.user);
              return;
            }
            localStorage.removeItem('omnira_session');
          }
        } catch {
          /* ignore */
        }
      }
      setView(initial === 'register' ? 'register' : 'login');
    },
    [enterDashboard]
  );

  const showLogin = useCallback(() => setView('login'), []);
  const showRegister = useCallback(() => setView('register'), []);
  const showForgot = useCallback(() => setView('forgot'), []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('omnira_session');
    setUser(null);
    setView('login');
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
      handleLogout,
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
      handleLogout,
    ]
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanel must be used within PanelProvider');
  return ctx;
}
