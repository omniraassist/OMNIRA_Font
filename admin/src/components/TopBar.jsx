import { IconSearch } from './icons.jsx';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

export function TopBar({ onMenuClick }) {
  const { user, logout } = useAdminAuth();
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'OA';

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
        <button type="button" className="adm-icon-btn" title="Notifications" aria-label="Notifications">
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
    </header>
  );
}
