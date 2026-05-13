import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconSearch } from './icons.jsx';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { apiCall } from '../api/client.js';

const STYLES = `
  .adm-topbar-pro {
    position: relative;
  }
  .adm-tb-bell {
    position: relative;
  }
  .adm-tb-bell-dot {
    position: absolute; top: 8px; right: 8px;
    width: 8px; height: 8px; border-radius: 999px;
    background: var(--em); border: 2px solid var(--surf);
    animation: bell-pulse 2.4s ease-in-out infinite;
  }
  @keyframes bell-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,229,160,0.0); }
    50%      { box-shadow: 0 0 0 6px rgba(0,229,160,0.18); }
  }

  .adm-tb-user-btn {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 10px 6px 6px;
    background: var(--surf2);
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
    transition: all .15s ease;
    color: inherit;
  }
  .adm-tb-user-btn:hover { border-color: var(--border-em); background: var(--surf3); }
  .adm-tb-user-btn .av {
    width: 32px; height: 32px; border-radius: 999px;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 700; font-size: 12px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    color: #00120a;
    box-shadow: 0 4px 12px rgba(0,229,160,0.25);
  }
  .adm-tb-user-btn .meta { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
  .adm-tb-user-btn .meta small { font-size: 10px; color: var(--muted); letter-spacing: .04em; text-transform: uppercase; line-height: 1; }
  .adm-tb-user-btn .meta span { font-size: 13px; color: var(--text); font-weight: 600; line-height: 1.2; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .adm-tb-user-btn .chev { color: var(--muted); transition: transform .15s ease; }
  .adm-tb-user-btn.open .chev { transform: rotate(180deg); }
  @media (max-width: 560px) { .adm-tb-user-btn .meta { display: none; } }

  .adm-tb-menu {
    position: absolute;
    right: 0; top: calc(100% + 8px);
    width: 280px;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--shadow);
    padding: 8px;
    z-index: 30;
    animation: tb-menu-in .15s ease-out;
  }
  @keyframes tb-menu-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .adm-tb-menu-head {
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 6px;
  }
  .adm-tb-menu-head strong { display: block; color: var(--text); font-size: 14px; }
  .adm-tb-menu-head span { display: block; color: var(--soft); font-size: 12px; margin-top: 2px; }
  .adm-tb-menu-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--text);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    text-decoration: none;
    transition: background .12s ease, color .12s ease;
  }
  .adm-tb-menu-item:hover { background: rgba(255,255,255,0.04); }
  .adm-tb-menu-item.danger { color: #fca5a5; }
  .adm-tb-menu-item.danger:hover { background: rgba(239,68,68,0.08); color: #fecaca; }
  .adm-tb-menu-item svg { color: var(--soft); flex-shrink: 0; }
  .adm-tb-menu-item:hover svg { color: var(--em); }
  .adm-tb-menu-item.danger svg { color: #fca5a5; }

  .adm-tb-divider { height: 1px; background: var(--border); margin: 4px 0; }

  /* Notifications quick-peek panel */
  .adm-tb-notif {
    position: absolute;
    right: 0; top: calc(100% + 8px);
    width: 360px;
    max-width: calc(100vw - 32px);
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--shadow);
    z-index: 30;
    overflow: hidden;
    animation: tb-menu-in .15s ease-out;
  }
  .adm-tb-notif-head {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .adm-tb-notif-head strong { color: var(--text); font-size: 14px; }
  .adm-tb-notif-head .count { font-size: 11px; color: var(--muted); }
  .adm-tb-notif-list { max-height: 360px; overflow-y: auto; }
  .adm-tb-notif-item {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    transition: background .12s ease;
  }
  .adm-tb-notif-item:last-child { border-bottom: 0; }
  .adm-tb-notif-item:hover { background: rgba(255,255,255,0.03); }
  .adm-tb-notif-item strong { display: block; font-size: 13px; color: var(--text); margin-bottom: 4px; }
  .adm-tb-notif-item p { font-size: 12px; color: var(--soft); margin: 0 0 6px; line-height: 1.5; }
  .adm-tb-notif-item .meta { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--muted); }
  .adm-tb-notif-foot {
    padding: 10px 16px;
    border-top: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
    font-size: 12px;
  }
`;

function useClickOutside(ref, onClose) {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function TopBar({ onMenuClick }) {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const userRef = useRef(null);
  const notifRef = useRef(null);

  useClickOutside(userRef, () => setUserOpen(false));
  useClickOutside(notifRef, () => setNotifOpen(false));

  const initials = (user?.name || 'Omnira Admin')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiCall('/api/admin/notifications');
      setNotifications(res.notifications || []);
    } catch {
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const i = setInterval(loadNotifications, 60_000);
    return () => clearInterval(i);
  }, [loadNotifications]);

  const onLogout = () => {
    setUserOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const handleNotifClick = () => {
    setUserOpen(false);
    setNotifOpen((v) => !v);
  };

  const handleUserClick = () => {
    setNotifOpen(false);
    setUserOpen((v) => !v);
  };

  const unreadIndicator = notifications.filter((n) => n.is_active !== false).length > 0;

  return (
    <header className="adm-topbar adm-topbar-pro">
      <style>{STYLES}</style>
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
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="adm-icon-btn adm-tb-bell"
            title="Notifications"
            aria-label="Notifications"
            onClick={handleNotifClick}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
            </svg>
            {unreadIndicator ? <span className="adm-tb-bell-dot" /> : null}
          </button>

          {notifOpen ? (
            <div className="adm-tb-notif" role="dialog" aria-label="Recent notifications">
              <div className="adm-tb-notif-head">
                <strong>Notifications</strong>
                <span className="count">{notifications.length} total</span>
              </div>
              <div className="adm-tb-notif-list">
                {notifications.length === 0 ? (
                  <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    No notifications yet.
                  </div>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div key={n.id} className="adm-tb-notif-item">
                      <strong>{n.title}</strong>
                      <p>{n.message}</p>
                      <div className="meta">
                        {n.target_email || 'All users'} · {formatRelative(n.created_at)}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="adm-tb-notif-foot">
                <Link
                  to="/notifications"
                  onClick={() => setNotifOpen(false)}
                  style={{ color: 'var(--em)', fontWeight: 600, textDecoration: 'none' }}
                >
                  Compose + manage →
                </Link>
                <span style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 11 }}>
                  refreshes every 60s
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div ref={userRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`adm-tb-user-btn${userOpen ? ' open' : ''}`}
            onClick={handleUserClick}
            aria-haspopup="menu"
            aria-expanded={userOpen}
          >
            <span className="av">{initials}</span>
            <span className="meta">
              <small>Signed in</small>
              <span>{user?.name ?? 'Admin'}</span>
            </span>
            <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {userOpen ? (
            <div className="adm-tb-menu" role="menu">
              <div className="adm-tb-menu-head">
                <strong>{user?.name || 'Omnira Admin'}</strong>
                <span>{user?.email || ''}</span>
              </div>
              <Link to="/profile" className="adm-tb-menu-item" onClick={() => setUserOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" />
                </svg>
                My profile
              </Link>
              <Link to="/notifications" className="adm-tb-menu-item" onClick={() => setUserOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
                </svg>
                Send notification
              </Link>
              <Link to="/whatsapp" className="adm-tb-menu-item" onClick={() => setUserOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinejoin="round" />
                </svg>
                Platform settings
              </Link>
              <div className="adm-tb-divider" />
              <button type="button" className="adm-tb-menu-item danger" onClick={onLogout}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
