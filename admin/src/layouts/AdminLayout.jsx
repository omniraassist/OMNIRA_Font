import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { TopBar } from '../components/TopBar.jsx';

const COLLAPSED_KEY = 'omnira_admin_sidebar_collapsed';

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  // Push the chosen width into the global CSS variable so .adm-main margin tracks it
  useEffect(() => {
    const root = document.documentElement;
    if (collapsed) {
      root.style.setProperty('--sidebar-w', 'var(--sidebar-w-collapsed)');
    } else {
      root.style.removeProperty('--sidebar-w');
    }
  }, [collapsed]);

  return (
    <div className="adm-app">
      <div
        className={`adm-sidebar-overlay${sidebarOpen ? ' visible' : ''}`}
        aria-hidden={!sidebarOpen}
        onClick={closeSidebar}
      />
      <Sidebar
        mobileOpen={sidebarOpen}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
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
