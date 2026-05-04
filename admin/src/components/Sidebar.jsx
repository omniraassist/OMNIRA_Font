import { NavLink } from 'react-router-dom';
import { IconBot, IconChart, IconDashboard, IconPulse, IconUsers, IconWhatsApp } from './icons.jsx';

const linkClass = ({ isActive }) => `adm-nav-link${isActive ? ' active' : ''}`;

export function Sidebar({ onNavigate, mobileOpen }) {
  const wrap = () => {
    if (onNavigate) onNavigate();
  };

  return (
    <aside className={`adm-sidebar${mobileOpen ? ' open' : ''}`} id="adm-sidebar">
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
        <NavLink to="/sessions" className={linkClass} onClick={wrap}>
          <IconPulse />
          Live sessions
        </NavLink>

        <div className="adm-nav-section-label">Platform</div>
        <NavLink to="/whatsapp" className={linkClass} onClick={wrap}>
          <IconWhatsApp />
          WhatsApp config
        </NavLink>
      </nav>

      <div className="adm-sidebar-foot">
        <div className="adm-sidebar-foot-card">
          <strong>Product flow</strong>
          Paid owners connect Meta · deploy widget · bookings sync to Sheets · emails to client & owner.
        </div>
      </div>
    </aside>
  );
}
