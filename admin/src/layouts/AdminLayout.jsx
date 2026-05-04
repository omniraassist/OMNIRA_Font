import { useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { TopBar } from '../components/TopBar.jsx';

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);

  return (
    <div className="adm-app">
      <div
        className={`adm-sidebar-overlay${sidebarOpen ? ' visible' : ''}`}
        aria-hidden={!sidebarOpen}
        onClick={closeSidebar}
      />
      <Sidebar
        mobileOpen={sidebarOpen}
        onNavigate={() => {
          if (typeof window !== 'undefined' && window.innerWidth <= 960) closeSidebar();
        }}
      />
      <main className="adm-main">
        <TopBar onMenuClick={toggleSidebar} />
        <div className="adm-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
