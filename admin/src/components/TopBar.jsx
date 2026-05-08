import { useEffect, useState } from 'react';
import { IconSearch } from './icons.jsx';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { apiCall } from '../api/client.js';

export function TopBar({ onMenuClick }) {
  const { user, logout } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [form, setForm] = useState({ title: '', message: '', target_email: '' });
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'OA';

  const loadNotifications = async () => {
    try {
      const res = await apiCall('/api/admin/notifications');
      setNotifications(res.notifications || []);
    } catch {
      setNotifications([]);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const submitNotification = async (e) => {
    e.preventDefault();
    await apiCall('/api/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        created_by: user?.email || 'admin',
      }),
    });
    setForm({ title: '', message: '', target_email: '' });
    await loadNotifications();
  };

  return (
    <header className="adm-topbar">
      <button type="button" className="adm-menu-toggle" aria-label="Open menu" onClick={onMenuClick}>
        <span className="adm-menu-toggle-bars" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
      <label className="adm-search">
        <IconSearch style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <input
          type="search"
          className="adm-search-input"
          placeholder="Search clients, phone numbers, WABA IDs…"
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>

      <div className="adm-topbar-actions">
        <button type="button" className="adm-icon-btn" title="Notifications" aria-label="Notifications" onClick={() => setOpen((v) => !v)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="adm-user-chip" onClick={logout} title="Sign out">
          <div className="adm-user-avatar">{initials}</div>
          <div className="adm-user-meta">
            <small>Signed in</small>
            <span>{user?.name ?? 'Admin'}</span>
          </div>
        </button>
      </div>
      {open && (
        <div className="adm-card" style={{ position: 'absolute', right: 24, top: 74, zIndex: 20, width: 380 }}>
          <h3 style={{ marginBottom: 10 }}>Post notification</h3>
          <form onSubmit={submitNotification}>
            <div className="adm-field">
              <label>Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="adm-field" style={{ marginTop: 8 }}>
              <label>Message</label>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
            </div>
            <div className="adm-field" style={{ marginTop: 8 }}>
              <label>Target email (optional)</label>
              <input value={form.target_email} onChange={(e) => setForm({ ...form, target_email: e.target.value })} />
            </div>
            <button className="adm-btn adm-btn-primary" type="submit" style={{ marginTop: 10 }}>Send</button>
          </form>
          <div style={{ marginTop: 12, maxHeight: 220, overflow: 'auto' }}>
            {(notifications || []).slice(0, 8).map((n) => (
              <div key={n.id} className="adm-pill" style={{ marginBottom: 8, alignItems: 'start' }}>
                <div>
                  <strong>{n.title}</strong>
                  <div style={{ color: 'var(--soft)', fontSize: 12 }}>{n.message}</div>
                  <div className="adm-mono" style={{ fontSize: 11 }}>
                    {n.target_email || 'All users'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
