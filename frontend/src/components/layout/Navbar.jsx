import { useState } from 'react';
import { usePanel } from '../../context/PanelContext.jsx';
import { useNavbarScroll } from '../../hooks/useNavbarScroll.js';
import { LogoMark } from '../brand/LogoMark.jsx';

export function Navbar() {
  const scrolled = useNavbarScroll();
  const { openClientPanel } = usePanel();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);
  const toggleMenu = () => setMenuOpen((o) => !o);

  return (
    <nav id="navbar" className={scrolled ? 'scrolled' : ''}>
      <div className="container">
        <div className="nav-inner">
          <a href="#" className="nav-logo" onClick={(e) => e.preventDefault()}>
            <div className="nav-logo-icon">
              <LogoMark size={34} alt="" />
            </div>
            <span className="nav-logo-text">
              Omni<span>ra</span>
            </span>
          </a>
          <div className="nav-links">
            <a href="#problema">El problema</a>
            <a href="#solucion">Solución</a>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#beneficios">Beneficios</a>
            <a href="#precios">Precios</a>
          </div>
          <div className="nav-actions">
            <span
              role="button"
              tabIndex={0}
              className="nav-pill"
              onClick={() => openClientPanel('login')}
              onKeyDown={(e) => e.key === 'Enter' && openClientPanel('login')}
            >
              Iniciar sesión
            </span>
            <a
              href="#panel"
              className="btn-ghost btn-sm"
              onClick={(e) => {
                e.preventDefault();
                openClientPanel('login');
              }}
            >
              Panel
            </a>
            <a
              href="#panel"
              className="btn-primary btn-sm"
              onClick={(e) => {
                e.preventDefault();
                openClientPanel('login');
              }}
            >
              Empezar gratis <i className="fa-solid fa-arrow-right" />
            </a>
          </div>
          <div
            className={`hamburger ${menuOpen ? 'open' : ''}`}
            id="hamburger"
            onClick={toggleMenu}
            role="button"
            tabIndex={0}
            aria-expanded={menuOpen}
            aria-label="Menú"
          >
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
      <div className={`mobile-menu ${menuOpen ? 'open' : ''}`} id="mobile-menu">
        <a href="#problema" onClick={closeMenu}>
          El problema
        </a>
        <a href="#solucion" onClick={closeMenu}>
          Solución
        </a>
        <a href="#como-funciona" onClick={closeMenu}>
          Cómo funciona
        </a>
        <a href="#precios" onClick={closeMenu}>
          Precios
        </a>
        <div className="mobile-menu-actions">
          <a
            href="#panel"
            className="btn-ghost"
            style={{ textAlign: 'center', justifyContent: 'center' }}
            onClick={(e) => {
              e.preventDefault();
              closeMenu();
              openClientPanel('login');
            }}
          >
            Iniciar sesión
          </a>
          <a
            href="#panel"
            className="btn-primary"
            style={{ justifyContent: 'center' }}
            onClick={(e) => {
              e.preventDefault();
              closeMenu();
              openClientPanel('login');
            }}
          >
            Empezar gratis →
          </a>
        </div>
      </div>
    </nav>
  );
}
