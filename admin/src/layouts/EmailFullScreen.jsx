import { useNavigate } from 'react-router-dom';
import { EmailPage } from '../pages/EmailPage.jsx';

/**
 * Full-viewport dedicated layout for the email client. The standard
 * AdminLayout wraps every other admin route with a sidebar + topbar, but
 * the email client deserves its own canvas — the way Gmail, Hey, and
 * Superhuman all do it. We keep one thin bar at the top with the brand
 * mark and a single "Volver al panel" button that pops the admin back to
 * their dashboard with the sidebar restored.
 */
const STYLES = `
  .em-fullscreen {
    position: fixed;
    inset: 0;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    z-index: 50;
    overflow: hidden;
  }

  .em-topbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 14px;
    height: 56px;
    padding: 0 18px;
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 2;
  }

  .em-topbar-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .em-topbar-right { display: flex; align-items: center; gap: 10px; }

  .em-back {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
    padding: 8px 14px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 13px; font-weight: 600;
    text-decoration: none;
    transition: all .15s ease;
    white-space: nowrap;
  }
  .em-back:hover {
    color: var(--em);
    border-color: var(--border-em);
    background: rgba(0,229,160,0.06);
    transform: translateX(-2px);
  }
  .em-back svg { transition: transform .15s ease; }
  .em-back:hover svg { transform: translateX(-2px); }

  .em-brand {
    display: inline-flex; align-items: center; gap: 10px;
    min-width: 0;
  }
  .em-brand-mark {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--em) 0%, var(--em2) 100%);
    color: #04201a;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .em-brand-text { display: flex; flex-direction: column; min-width: 0; }
  .em-brand-text strong {
    font-family: var(--font-display);
    color: var(--text);
    font-size: 14.5px;
    line-height: 1.15;
    white-space: nowrap;
  }
  .em-brand-text small {
    color: var(--muted);
    font-size: 11px;
    letter-spacing: .04em;
    text-transform: uppercase;
    line-height: 1.2;
    white-space: nowrap;
  }

  .em-topbar-divider {
    width: 1px; height: 24px; background: var(--border);
    margin: 0 4px;
  }

  .em-topbar-meta {
    font-size: 12px;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
  }
  .em-topbar-meta b { color: var(--em); font-weight: 700; }

  .em-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* On very small screens, drop the meta label and shorten the back button text. */
  @media (max-width: 560px) {
    .em-topbar { padding: 0 12px; height: 52px; gap: 8px; }
    .em-topbar-divider, .em-topbar-meta, .em-brand-text small { display: none; }
    .em-back { padding: 7px 10px; font-size: 12px; }
    .em-back .lbl { display: none; }
    .em-brand-mark { width: 28px; height: 28px; }
  }
`;

export function EmailFullScreen() {
  const navigate = useNavigate();
  return (
    <>
      <style>{STYLES}</style>
      <div className="em-fullscreen">
        <header className="em-topbar">
          <div className="em-topbar-left">
            <button
              type="button"
              className="em-back"
              onClick={() => navigate('/')}
              title="Volver al panel de administración"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span className="lbl">Volver al panel</span>
            </button>
            <span className="em-topbar-divider" aria-hidden />
            <div className="em-brand">
              <span className="em-brand-mark" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                  <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
              </span>
              <div className="em-brand-text">
                <strong>Correos</strong>
                <small>Omnira · Centro de mensajería</small>
              </div>
            </div>
          </div>
          <div className="em-topbar-right">
            <span className="em-topbar-meta">
              Cliente IMAP <b>•</b> en vivo
            </span>
          </div>
        </header>
        <main className="em-stage">
          <EmailPage />
        </main>
      </div>
    </>
  );
}
