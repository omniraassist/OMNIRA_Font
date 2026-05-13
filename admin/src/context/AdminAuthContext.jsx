import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

const AdminAuthContext = createContext(null);

const STORAGE_KEY = 'omnira_admin_session';

export function AdminAuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (email, password) => {
    const res = await apiCall('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const u = {
      id: res.user?.id,
      email: res.user?.email,
      name: res.user?.full_name || 'Omnira Admin',
      role: 'Superadmin',
      token: `admin_${res.user?.id || 'session'}`,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, updateUser, isAuthenticated: !!user }),
    [user, login, logout, updateUser]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
