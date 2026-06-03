import { NavLink, useNavigate } from 'react-router-dom';
import {
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

      <div className="adm-brand">
        <div className="adm-brand-mark" aria-hidden>
          <img src="/logo.png" alt="" width="42" height="42" decoding="async" />
        </div>
        <div className="adm-brand-text">
          <strong>Omnira</strong>
          <span>Centro de control</span>
        </div>
        {/* Desktop collapse toggle — sits at the right of the brand row, hidden on mobile via CSS */}
        <button
          type="button"
          className="adm-sidebar-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <nav className="adm-nav" aria-label="Principal">
        <div className="adm-nav-section-label">Resumen</div>
        <NavLink to="/" end className={linkClass} onClick={wrap}>
          <IconDashboard />
          <span>Panel</span>
          <span className="adm-nav-tip">Panel</span>
        </NavLink>
        <NavLink to="/analytics" className={linkClass} onClick={wrap}>
          <IconChart />
          <span>Analíticas</span>
          <span className="adm-nav-tip">Analíticas</span>
        </NavLink>

        <div className="adm-nav-section-label">Clientes</div>
        <NavLink to="/clients" className={linkClass} onClick={wrap}>
          <IconUsers />
          <span>Suscriptores</span>
          <span className="adm-nav-tip">Suscriptores</span>
        </NavLink>
        <NavLink to="/invoices" className={linkClass} onClick={wrap}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" strokeLinejoin="round" />
            <path d="M14 2v6h6M9 13h6M9 17h6M9 9h2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Facturas</span>
          <span className="adm-nav-tip">Facturas</span>
        </NavLink>
        <NavLink to="/emails" className={linkClass} onClick={wrap}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M3 7l9 6 9-6M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Correos</span>
          <span className="adm-nav-tip">Correos · Bandeja de entrada</span>
        </NavLink>
        <NavLink to="/leads" className={linkClass} onClick={wrap}>
          <IconLeads />
          <span>Leads de WhatsApp</span>
          <span className="adm-nav-tip">Leads de WhatsApp</span>
        </NavLink>
        <NavLink to="/chats" className={linkClass} onClick={wrap}>
          <IconChats />
          <span>Chats de WhatsApp</span>
          <span className="adm-nav-tip">Chats de WhatsApp</span>
        </NavLink>
        <NavLink to="/notifications" className={linkClass} onClick={wrap}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
          </svg>
          <span>Notificaciones</span>
          <span className="adm-nav-tip">Notificaciones</span>
        </NavLink>
        <NavLink to="/sessions" className={linkClass} onClick={wrap}>
          <IconPulse />
          <span>Administradores</span>
          <span className="adm-nav-tip">Administradores</span>
        </NavLink>

        <div className="adm-nav-section-label">Plataforma</div>
        <NavLink to="/pricing" className={linkClass} onClick={wrap}>
          <IconPricing />
          <span>Precios</span>
          <span className="adm-nav-tip">Precios</span>
        </NavLink>
        <NavLink to="/bot-config" className={linkClass} onClick={wrap}>
          <IconBrain />
          <span>Cerebro del bot</span>
          <span className="adm-nav-tip">Cerebro del bot</span>
        </NavLink>
        <NavLink to="/whatsapp" className={linkClass} onClick={wrap}>
          <IconWhatsApp />
          <span>WhatsApp</span>
          <span className="adm-nav-tip">WhatsApp</span>
        </NavLink>
      </nav>

      <div className="adm-sidebar-foot">
        <div className="adm-sidebar-user">
          <div className="av">
            {user?.avatar ? <img src={user.avatar} alt={user?.name || 'administrador'} /> : initials}
          </div>
          <div className="meta">
            <strong>{user?.name || 'Administrador'}</strong>
            <small>{user?.email || 'Superadministrador'}</small>
          </div>
        </div>
        <div className="adm-sidebar-foot-actions">
          <NavLink to="/profile" onClick={wrap} title="Editar perfil">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" />
            </svg>
            <span>Perfil</span>
            <span className="adm-nav-tip">Perfil</span>
          </NavLink>
          <button type="button" className="logout" onClick={onLogout} title="Cerrar sesión">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Salir</span>
            <span className="adm-nav-tip">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
