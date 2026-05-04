import { LogoMark } from '../brand/LogoMark.jsx';

export function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <a href="#" className="nav-logo" style={{ marginBottom: '16px', display: 'inline-flex' }} onClick={(e) => e.preventDefault()}>
              <div className="nav-logo-icon">
                <LogoMark size={36} alt="" />
              </div>
              <span className="nav-logo-text">
                Omni<span>ra</span>
              </span>
            </a>
            <p>El asistente de WhatsApp con IA que automatiza tu agenda 24/7. Para clínicas, estética y negocios de bienestar.</p>
            <div className="footer-socials">
              <a href="#" className="footer-social" aria-label="LinkedIn">
                <i className="fa-brands fa-linkedin-in" />
              </a>
              <a href="#" className="footer-social" aria-label="Instagram">
                <i className="fa-brands fa-instagram" />
              </a>
              <a href="#" className="footer-social" aria-label="Twitter">
                <i className="fa-brands fa-x-twitter" />
              </a>
              <a href="#" className="footer-social" aria-label="Facebook">
                <i className="fa-brands fa-facebook-f" />
              </a>
            </div>
          </div>
          <div className="footer-col">
            <h4>Producto</h4>
            <div className="footer-links">
              <a href="#solucion">Cómo funciona</a>
              <a href="#beneficios">Beneficios</a>
              <a href="#precios">Precios</a>
              <a href="#como-funciona">Integración</a>
            </div>
          </div>
          <div className="footer-col">
            <h4>Empresa</h4>
            <div className="footer-links">
              <a href="#">Sobre nosotros</a>
              <a href="#">Blog</a>
              <a href="#">Casos de éxito</a>
              <a href="mailto:hola@omnira.io">Contacto</a>
            </div>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <div className="footer-links">
              <a href="/privacidad">Política de privacidad</a>
              <a href="/terminos">Términos de uso</a>
              <a href="#">Cookies</a>
              <a href="#">RGPD</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-copy">© 2026 Omnira. Todos los derechos reservados. Hecho con ❤️ para negocios de bienestar.</p>
          <div className="footer-badge">
            <i className="fa-solid fa-shield-halved" />
            Pago seguro por Stripe
          </div>
        </div>
      </div>
    </footer>
  );
}
