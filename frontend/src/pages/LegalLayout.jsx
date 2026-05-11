import { useEffect } from 'react';
import '../styles/legal.css';

export function LegalLayout({ variant, titleBefore, titleAccent, meta, children }) {
  const base = import.meta.env.BASE_URL || '/';
  const homeHref = base.endsWith('/') ? base : `${base}/`;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [variant]);

  return (
    <div className={`legal-root legal-root--${variant}`}>
      <header className="legal-header">
        <div className="legal-header-nav">
          <a className="legal-logo" href={homeHref}>
            omni<span>ra</span>
          </a>
          <a className="legal-home" href={homeHref}>
            Inicio
          </a>
        </div>
        <span className="legal-badge">Legal</span>
      </header>

      <main className="legal-main">
        <h1 className="legal-page-title">
          {titleBefore} <span>{titleAccent}</span>
        </h1>
        <p className="legal-meta">{meta}</p>
        {children}
      </main>

      <footer className="legal-footer">© 2026 Omnira. Todos los derechos reservados.</footer>
    </div>
  );
}
