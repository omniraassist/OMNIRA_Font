import { NavLink, useNavigate } from 'react-router-dom';
import {
  IconBot,
  IconBrain,
  IconChart,
  IconChats,
  IconDashboard,
  IconLeads,
  IconPricing,
  IconPulse,
  IconUsers,
  IconWhatsApp,
} from './icons.jsx';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const linkClass = ({ isActive }) => `adm-nav-link${isActive ? ' active' : ''}`;

const FOOT_STYLES = `
  .adm-sidebar-user {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    margin-bottom: 10px;
    transition: padding .2s ease;
  }
  .adm-sidebar-user .av {
    width: 34px; height: 34px; border-radius: 999px;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 700; font-size: 12px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    color: #00120a;
    flex-shrink: 0;
    overflow: hidden;
  }
  .adm-sidebar-user .av img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .adm-sidebar-user .meta { min-width: 0; flex: 1; }
  .adm-sidebar-user .meta strong {
    display: block; color: var(--text); font-size: 12.5px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .adm-sidebar-user .meta small {
    display: block; color: var(--muted); font-size: 10.5px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .adm-sidebar-foot-actions { display: flex; gap: 6px; }
  .adm-sidebar-foot-actions a, .adm-sidebar-foot-actions button {
    flex: 1;
    position: relative;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--soft);
    font-size: 12px; font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: all .15s ease;
  }
  .adm-sidebar-foot-actions a:hover { color: var(--em); border-color: var(--border-em); background: rgba(0,229,160,0.04); }
  .adm-sidebar-foot-actions button.logout:hover { color: #fca5a5; border-color: rgba(239,68,68,0.40); background: rgba(239,68,68,0.06); }
`;

export function Sidebar({ onNavigate, mobileOpen, collapsed, onToggleCollapse }) {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const wrap = () => {
    if (onNavigate) onNavigate();
  };
  const initials = (user?.name || 'Omnira Admin')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside
      className={`adm-sidebar${mobileOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}
      id="adm-sidebar"
    >
      <style>{FOOT_STYLES}</style>

      {/* Desktop collapse toggle (hidden on mobile via CSS) */}
      <button
        type="button"
        className="adm-sidebar-toggle"
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="adm-brand">
        <div className="adm-brand-mark" aria-hidden>
          <IconBot />
        </div>
        <div className="adm-brand-text">
          <strong>Omnira</strong>
          <span>Control center</span>
        </div>
      </div>

      <nav className="adm-nav" aria-label="Main">
        <div className="adm-nav-section-label">Overview</div>
        <NavLink to="/" end className={linkClass} onClick={wrap}>
          <IconDashboard />
          <span>Dashboard</span>
          <span className="adm-nav-tip">Dashboard</span>
        </NavLink>
        <NavLink to="/analytics" className={linkClass} onClick={wrap}>
          <IconChart />
          <span>Analytics</span>
          <span className="adm-nav-tip">Analytics</span>
        </NavLink>

        <div className="adm-nav-section-label">Customers</div>
        <NavLink to="/clients" className={linkClass} onClick={wrap}>
          <IconUsers />
          <span>Paid subscribers</span>
          <span className="adm-nav-tip">Paid subscribers</span>
        </NavLink>
        <NavLink to="/leads" className={linkClass} onClick={wrap}>
          <IconLeads />
          <span>WhatsApp leads</span>
          <span className="adm-nav-tip">WhatsApp leads</span>
        </NavLink>
        <NavLink to="/chats" className={linkClass} onClick={wrap}>
          <IconChats />
          <span>WhatsApp chats</span>
          <span className="adm-nav-tip">WhatsApp chats</span>
        </NavLink>
        <NavLink to="/notifications" className={linkClass} onClick={wrap}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
          </svg>
          <span>Notifications</span>
          <span className="adm-nav-tip">Notifications</span>
        </NavLink>
        <NavLink to="/sessions" className={linkClass} onClick={wrap}>
          <IconPulse />
          <span>Admin users</span>
          <span className="adm-nav-tip">Admin users</span>
        </NavLink>

        <div className="adm-nav-section-label">Platform</div>
        <NavLink to="/pricing" className={linkClass} onClick={wrap}>
          <IconPricing />
          <span>Pricing</span>
          <span className="adm-nav-tip">Pricing</span>
        </NavLink>
        <NavLink to="/bot-config" className={linkClass} onClick={wrap}>
          <IconBrain />
          <span>Bot brain</span>
          <span className="adm-nav-tip">Bot brain</span>
        </NavLink>
        <NavLink to="/whatsapp" className={linkClass} onClick={wrap}>
          <IconWhatsApp />
          <span>WhatsApp config</span>
          <span className="adm-nav-tip">WhatsApp config</span>
        </NavLink>
      </nav>

      <div className="adm-sidebar-foot">
        <div className="adm-sidebar-user">
          <div className="av">
            {user?.avatar ? <img src={user.avatar} alt={user?.name || 'admin'} /> : initials}
          </div>
          <div className="meta">
            <strong>{user?.name || 'Omnira Admin'}</strong>
            <small>{user?.email || 'Superadmin'}</small>
          </div>
        </div>
        <div className="adm-sidebar-foot-actions">
          <NavLink to="/profile" onClick={wrap} title="Edit profile">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" />
            </svg>
            <span>Profile</span>
            <span className="adm-nav-tip">Profile</span>
          </NavLink>
          <button type="button" className="logout" onClick={onLogout} title="Sign out">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Sign out</span>
            <span className="adm-nav-tip">Sign out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
