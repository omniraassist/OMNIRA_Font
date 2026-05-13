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
    padding: 12px;
    border-radius: 12px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    margin-bottom: 10px;
  }
  .adm-sidebar-user .av {
    width: 36px; height: 36px; border-radius: 999px;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 700; font-size: 13px;
    background: linear-gradient(135deg, var(--em) 0%, #60a5fa 100%);
    color: #00120a;
    flex-shrink: 0;
    overflow: hidden;
  }
  .adm-sidebar-user .av img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .adm-sidebar-user .meta { min-width: 0; flex: 1; }
  .adm-sidebar-user .meta strong {
    display: block; color: var(--text); font-size: 13px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .adm-sidebar-user .meta small {
    display: block; color: var(--muted); font-size: 11px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .adm-sidebar-foot-actions { display: flex; gap: 6px; }
  .adm-sidebar-foot-actions a, .adm-sidebar-foot-actions button {
    flex: 1;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: 9px 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--soft);
    font-size: 12px; font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: all .15s ease;
  }
  .adm-sidebar-foot-actions a:hover { color: var(--em); border-color: var(--border-em); }
  .adm-sidebar-foot-actions button.logout:hover { color: #fca5a5; border-color: rgba(239,68,68,0.40); background: rgba(239,68,68,0.06); }
`;

export function Sidebar({ onNavigate, mobileOpen }) {
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
    <aside className={`adm-sidebar${mobileOpen ? ' open' : ''}`} id="adm-sidebar">
      <style>{FOOT_STYLES}</style>
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
          Dashboard
        </NavLink>
        <NavLink to="/analytics" className={linkClass} onClick={wrap}>
          <IconChart />
          Analytics
        </NavLink>

        <div className="adm-nav-section-label">Customers</div>
        <NavLink to="/clients" className={linkClass} onClick={wrap}>
          <IconUsers />
          Paid subscribers
        </NavLink>
        <NavLink to="/leads" className={linkClass} onClick={wrap}>
          <IconLeads />
          WhatsApp leads
        </NavLink>
        <NavLink to="/chats" className={linkClass} onClick={wrap}>
          <IconChats />
          WhatsApp chats
        </NavLink>
        <NavLink to="/notifications" className={linkClass} onClick={wrap}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
          </svg>
          Notifications
        </NavLink>
        <NavLink to="/sessions" className={linkClass} onClick={wrap}>
          <IconPulse />
          Admin users
        </NavLink>

        <div className="adm-nav-section-label">Platform</div>
        <NavLink to="/pricing" className={linkClass} onClick={wrap}>
          <IconPricing />
          Pricing
        </NavLink>
        <NavLink to="/bot-config" className={linkClass} onClick={wrap}>
          <IconBrain />
          Bot brain
        </NavLink>
        <NavLink to="/whatsapp" className={linkClass} onClick={wrap}>
          <IconWhatsApp />
          WhatsApp config
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
            Profile
          </NavLink>
          <button type="button" className="logout" onClick={onLogout} title="Sign out">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
