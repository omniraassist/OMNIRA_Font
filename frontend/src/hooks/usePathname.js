import { useEffect, useState } from 'react';

/**
 * Current `location.pathname` for lightweight SPA routing (no react-router).
 */
export function usePathname() {
  const [pathname, setPathname] = useState(
    () => (typeof window !== 'undefined' ? window.location.pathname : '/')
  );

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return pathname;
}
