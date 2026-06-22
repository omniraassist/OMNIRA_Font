import { useCallback, useEffect, useState } from 'react';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';
import { apiCall } from '../../api/client.js';

/**
 * Post-payment screen where the paying customer pastes their own Meta
 * WhatsApp Cloud API credentials. Only the 5 fields the customer must
 * provide are visible — graph_version / insecure_local / skip_signature
 * are set to sensible defaults server-side so we don't ask for them.
 *
 * Flow:
 *   1. Customer pastes credentials.
 *   2. We save them to `customer_whatsapp_configs` (PATCH /api/customer/whatsapp-config).
 *   3. We call /api/customer/whatsapp-config/verify which hits Meta Graph
 *      to confirm token + phone_number_id are real. On success the row is
 *      marked `is_active = true` and a welcome WhatsApp message is sent.
 *   4. We show a celebration screen with the verified business name and
 *      a button to enter the dashboard.
 */
const FIELDS = [
  {
    key: 'meta_access_token',
    label: 'Token de acceso de Meta',
    placeholder: 'EAAB… token de usuario de sistema de larga duración',
    hint: 'Meta Business Suite → Usuarios del sistema → Generar token con whatsapp_business_messaging.',
    type: 'password',
    required: true,
    secret: true,
  },
  {
    key: 'meta_business_account_id',
    label: 'ID de cuenta de empresa (WABA)',
    placeholder: 'ej. 1936173473732174',
    hint: 'Meta Business Suite → Cuentas de WhatsApp → ID en la parte superior. De aquí detectamos tu número automáticamente.',
    type: 'text',
    required: true,
  },
  {
    key: 'meta_app_secret',
    label: 'Clave secreta de la app de Meta',
    placeholder: 'App Dashboard → Configuración → Básica → Clave secreta',
    hint: 'Se usa para verificar la firma X-Hub-Signature de cada webhook entrante.',
    type: 'password',
    required: true,
    secret: true,
  },
];

const STYLES = `
  .swa-screen {
    min-height: 100dvh;
    background:
      radial-gradient(60% 60% at 80% 0%, rgba(0,229,160,0.08), transparent 60%),
      radial-gradient(60% 60% at 20% 100%, rgba(96,165,250,0.06), transparent 65%);
    display: flex; flex-direction: column;
  }
  .swa-card {
    background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
    border: 1px solid rgba(0,229,160,0.18);
    border-radius: 22px;
    padding: 28px 32px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.35);
  }
  @media (max-width: 560px) { .swa-card { padding: 22px 18px; border-radius: 18px; } }
  .swa-title { font-family: var(--font-display, 'Geist', sans-serif); font-size: 26px; color: var(--text); margin: 0 0 4px; line-height: 1.2; }
  .swa-title .grad { background: linear-gradient(90deg, var(--em) 0%, #93c5fd 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .swa-sub { color: var(--soft); font-size: 14px; line-height: 1.6; margin: 0; }

  .swa-webhook-card {
    background: rgba(0,229,160,0.05);
    border: 1px solid rgba(0,229,160,0.28);
    border-radius: 14px;
    padding: 16px 18px;
    margin: 18px 0;
  }
  .swa-webhook-card label {
    display: block; font-size: 11px; font-weight: 700;
    letter-spacing: .06em; text-transform: uppercase;
    color: var(--em); margin-bottom: 6px;
  }
  .swa-webhook-row {
    display: flex; gap: 8px;
    background: rgba(0,0,0,0.35);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 4px;
  }
  .swa-webhook-row input {
    flex: 1; min-width: 0;
    background: transparent; border: 0;
    color: var(--em); font-family: monospace; font-size: 13px;
    padding: 8px 12px; outline: none;
  }
  .swa-copy {
    background: var(--em); color: #00120a;
    font-weight: 700; border: 0;
    border-radius: 8px; padding: 0 14px;
    cursor: pointer; transition: filter .15s ease;
  }
  .swa-copy:hover { filter: brightness(1.08); }
  .swa-copy.copied { background: #22c55e; color: #052e1a; }

  .swa-grid {
    display: grid; gap: 14px;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
  .swa-field { display: flex; flex-direction: column; gap: 6px; }
  .swa-field label {
    font-size: 12px; font-weight: 700;
    color: var(--soft);
  }
  .swa-field label .req { color: var(--em); margin-left: 3px; }
  .swa-input {
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 11px 14px;
    color: var(--text); font-size: 14px;
    outline: none; transition: border-color .15s ease, background .15s ease;
    font-family: inherit;
  }
  .swa-input:focus { border-color: var(--em); background: rgba(0,0,0,0.45); }
  .swa-field .hint { font-size: 11px; color: var(--muted); line-height: 1.5; }

  .swa-submit {
    width: 100%;
    background: linear-gradient(180deg, var(--em) 0%, var(--em2, #00c87a) 100%);
    color: #00120a; font-weight: 700;
    border: 0; border-radius: 12px;
    padding: 14px; font-size: 15px;
    cursor: pointer;
    transition: filter .15s ease, transform .15s ease;
    margin-top: 16px;
    letter-spacing: .01em;
  }
  .swa-submit:disabled { filter: grayscale(.55) brightness(.7); cursor: not-allowed; }
  .swa-submit:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(0,229,160,0.30); filter: brightness(1.06); }

  .swa-skip {
    margin-top: 10px; width: 100%;
    background: transparent;
    color: var(--soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px;
    font-size: 13px;
    cursor: pointer;
    transition: all .15s ease;
  }
  .swa-skip:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }

  .swa-err {
    margin-top: 14px;
    padding: 12px 14px;
    background: rgba(239,68,68,0.10);
    border: 1px solid rgba(239,68,68,0.35);
    border-radius: 10px;
    color: #fecaca; font-size: 13px;
    line-height: 1.55;
  }
  .swa-info {
    margin-top: 14px;
    padding: 12px 14px;
    background: rgba(96,165,250,0.10);
    border: 1px solid rgba(96,165,250,0.35);
    border-radius: 10px;
    color: #bfdbfe; font-size: 13px;
  }

  /* Celebration screen */
  .swa-cele {
    text-align: center;
    padding: 22px 8px;
  }
  .swa-cele-ring {
    width: 96px; height: 96px;
    margin: 0 auto 18px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--em) 0%, #34d399 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 44px;
    box-shadow: 0 16px 38px rgba(0,229,160,0.40);
    animation: swa-pop .5s ease-out;
  }
  @keyframes swa-pop {
    0% { transform: scale(0.4); opacity: 0; }
    60% { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1); }
  }
  .swa-cele h2 {
    margin: 0 0 8px;
    font-family: var(--font-display, 'Geist', sans-serif);
    font-size: 28px;
    color: var(--text);
  }
  .swa-cele p { color: var(--soft); font-size: 14px; line-height: 1.6; max-width: 460px; margin: 0 auto 18px; }
  .swa-cele-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px;
    background: rgba(0,229,160,0.12);
    border: 1px solid rgba(0,229,160,0.30);
    border-radius: 999px;
    color: var(--em); font-size: 12px; font-weight: 600;
    margin: 0 4px 18px;
  }
  .swa-cele-meta {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    margin: 6px auto 20px;
    max-width: 380px;
    text-align: left;
    font-size: 13px;
  }
  .swa-cele-meta div { display: flex; justify-content: space-between; padding: 4px 0; }
  .swa-cele-meta span { color: var(--muted); }
  .swa-cele-meta strong { color: var(--text); font-family: monospace; font-size: 12px; }

  /* Pipeline (steps indicator) */
  .swa-pipe {
    display: flex; align-items: center; gap: 8px;
    margin: 24px 0 18px;
    overflow-x: auto;
  }
  .swa-pipe-step {
    display: flex; align-items: center; gap: 8px;
    flex-shrink: 0;
  }
  .swa-pipe-step .num {
    width: 26px; height: 26px;
    border-radius: 999px;
    background: rgba(255,255,255,0.06);
    color: var(--soft);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
  }
  .swa-pipe-step.done .num { background: var(--em); color: #00120a; }
  .swa-pipe-step.active .num { background: linear-gradient(135deg, var(--em), #93c5fd); color: #00120a; box-shadow: 0 0 0 4px rgba(0,229,160,0.15); }
  .swa-pipe-step .lbl { font-size: 12px; color: var(--soft); white-space: nowrap; }
  .swa-pipe-step.done .lbl, .swa-pipe-step.active .lbl { color: var(--text); font-weight: 600; }
  .swa-pipe-line { flex: 1; height: 1px; background: var(--border); min-width: 10px; }
`;

export function PostLoginWhatsAppSetup() {
  const { closeClientPanel, completeWhatsAppSetup, user } = usePanel();
  const [draft, setDraft] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, ''])));
  const [server, setServer] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [copied, setCopied] = useState(''); // 'url' | 'token' | ''
  const [verified, setVerified] = useState(null); // { display_phone_number, verified_name, welcome }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall('/api/customer/whatsapp-config');
      setServer(res.config || null);
      setWebhookUrl(res.webhook_url || '');
      setVerifyToken(res.config?.meta_verify_token || '');
      setDraft((d) => ({
        ...d,
        meta_business_account_id: res.config?.meta_business_account_id || '',
      }));
      if (res.config?.is_active && res.config?.setup_completed_at) {
        setVerified({
          display_phone_number: res.config.meta_display_phone_number,
          verified_name: res.config.meta_verified_name,
          welcome: null,
        });
      }
    } catch (e) {
      setErr(e?.message || 'No se pudo cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copyValue = async (kind, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(''), 1800);
    } catch { /* ignore */ }
  };

  async function onSubmit(e) {
    e.preventDefault();
    setErr(''); setInfo('');

    // 1. Save the credentials
    const payload = {};
    for (const f of FIELDS) {
      // Don't overwrite already-saved secrets with an empty value
      if (f.secret && !draft[f.key]) continue;
      payload[f.key] = draft[f.key] || '';
    }
    payload.meta_graph_version = 'v21.0'; // sensible default — hidden from UI
    setSaving(true);
    try {
      await apiCall('/api/customer/whatsapp-config', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } catch (ex) {
      setSaving(false);
      setErr(`No se pudieron guardar las credenciales: ${ex?.message || ex}`);
      return;
    }
    setSaving(false);

    // 2. Verify with Meta
    setVerifying(true);
    try {
      const r = await apiCall('/api/customer/whatsapp-config/verify', { method: 'POST' });
      if (r.verified) {
        setVerified({
          display_phone_number: r.display_phone_number,
          verified_name: r.verified_name,
          quality_rating: r.quality_rating,
          welcome: r.welcome,
        });
      } else {
        setErr(r.message || `La verificación falló${r.meta_status ? ` (HTTP ${r.meta_status})` : ''}.`);
      }
    } catch (ex) {
      setErr(`La verificación falló: ${ex?.message || ex}`);
    } finally {
      setVerifying(false);
    }
  }

  const allRequiredFilled = FIELDS
    .filter((f) => f.required)
    .every((f) => {
      // Secrets that already exist on server are OK if empty in form
      if (f.secret) {
        if (f.key === 'meta_access_token' && server?.meta_access_token_set) return true;
        if (f.key === 'meta_app_secret' && server?.meta_app_secret_set) return true;
      }
      return draft[f.key] && draft[f.key].trim();
    });

  // ────────────────────────────────────────────────────────────────────────
  // Celebration screen (after verify success)
  // ────────────────────────────────────────────────────────────────────────
  if (verified) {
    return (
      <div className="auth-screen swa-screen">
        <style>{STYLES}</style>
        <header className="auth-header">
          <div className="auth-header-inner">
            <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
              <span className="auth-header-mini-icon"><LogoMark size={38} alt="" /></span>
              Omni<span>ra</span>
            </button>
          </div>
        </header>
        <main className="panel-payment-main" style={{ padding: '24px 16px', flex: 1 }}>
          <div className="panel-plan-inner" style={{ maxWidth: 640, margin: '0 auto' }}>
            <div className="swa-card swa-cele">
              <div className="swa-cele-ring">🎉</div>
              <h2>¡Tu agente está <span style={{ background: 'linear-gradient(90deg, var(--em) 0%, #93c5fd 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>en vivo</span>!</h2>
              <p>
                Verificamos tus credenciales con Meta y tu agente Omnira ya responde 24/7 en tu WhatsApp Business.
              </p>
              <div>
                <span className="swa-cele-pill">● Activo 24/7</span>
                {verified.welcome?.sent ? (
                  <span className="swa-cele-pill">📩 Mensaje de bienvenida enviado</span>
                ) : null}
              </div>
              <div className="swa-cele-meta">
                {verified.verified_name ? <div><span>Nombre verificado</span><strong>{verified.verified_name}</strong></div> : null}
                {verified.display_phone_number ? <div><span>Número</span><strong>{verified.display_phone_number}</strong></div> : null}
                {verified.quality_rating ? <div><span>Calidad</span><strong>{verified.quality_rating}</strong></div> : null}
                <div><span>Webhook</span><strong style={{ wordBreak: 'break-all' }}>{webhookUrl}</strong></div>
              </div>
              <button
                type="button"
                className="swa-submit"
                style={{ maxWidth: 320, margin: '0 auto' }}
                onClick={completeWhatsAppSetup}
              >
                Entrar al dashboard →
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Setup form (default screen)
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="auth-screen swa-screen">
      <style>{STYLES}</style>
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
            <span className="auth-header-mini-icon"><LogoMark size={38} alt="" /></span>
            Omni<span>ra</span>
          </button>
        </div>
      </header>
      <main className="panel-payment-main" style={{ padding: '24px 16px', flex: 1 }}>
        <div className="panel-plan-inner" style={{ maxWidth: 760, margin: '0 auto' }}>

          {/* Pipeline */}
          <div className="swa-pipe">
            <div className="swa-pipe-step done"><span className="num">✓</span><span className="lbl">Plan</span></div>
            <div className="swa-pipe-line" />
            <div className="swa-pipe-step done"><span className="num">✓</span><span className="lbl">Pago</span></div>
            <div className="swa-pipe-line" />
            <div className="swa-pipe-step active"><span className="num">3</span><span className="lbl">WhatsApp Business</span></div>
            <div className="swa-pipe-line" />
            <div className="swa-pipe-step"><span className="num">4</span><span className="lbl">Dashboard</span></div>
          </div>

          <div className="swa-card">
            <h1 className="swa-title">Conecta tu <span className="grad">WhatsApp Business</span></h1>
            <p className="swa-sub">
              Solo necesitas 3 datos de Meta. El número de teléfono lo detectamos automáticamente desde tu
              WABA y el verify token lo generamos nosotros. Al guardar verificamos con Meta y, si todo está
              correcto, tu agente se activa en este momento.
            </p>

            {/* Webhook URL + verify token — both server-managed; the customer only copies them into Meta */}
            <div className="swa-webhook-card">
              <label>1️⃣ Pega esta URL en Meta App → WhatsApp → Configuración → Callback URL</label>
              <div className="swa-webhook-row">
                <input readOnly value={webhookUrl} />
                <button
                  type="button"
                  className={`swa-copy${copied === 'url' ? ' copied' : ''}`}
                  onClick={() => copyValue('url', webhookUrl)}
                  disabled={!webhookUrl}
                >
                  {copied === 'url' ? '✓' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="swa-webhook-card">
              <label>2️⃣ Verify token — pégalo en Meta → Configuración → Verify token (lo generamos por ti)</label>
              <div className="swa-webhook-row">
                <input readOnly value={verifyToken} />
                <button
                  type="button"
                  className={`swa-copy${copied === 'token' ? ' copied' : ''}`}
                  onClick={() => copyValue('token', verifyToken)}
                  disabled={!verifyToken}
                >
                  {copied === 'token' ? '✓' : 'Copiar'}
                </button>
              </div>
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--soft)', lineHeight: 1.55 }}>
                Después pulsa <strong>Subscribe</strong> en el campo{' '}
                <code style={{ background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 4 }}>messages</code>.
              </p>
            </div>

            {/* 5 fields */}
            <form onSubmit={onSubmit} autoComplete="off">
              <div className="swa-grid">
                {FIELDS.map((f) => {
                  const savedSecret =
                    f.secret &&
                    ((f.key === 'meta_access_token' && server?.meta_access_token_set) ||
                      (f.key === 'meta_app_secret' && server?.meta_app_secret_set));
                  return (
                    <div className="swa-field" key={f.key}>
                      <label>
                        {f.label}
                        {f.required ? <span className="req">*</span> : null}
                      </label>
                      <input
                        className="swa-input"
                        type={f.type}
                        value={draft[f.key]}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        placeholder={savedSecret ? '••••••• (guardado — escribe para reemplazar)' : f.placeholder}
                        required={f.required && !savedSecret}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <p className="hint">{f.hint}</p>
                    </div>
                  );
                })}
              </div>

              {err ? <div className="swa-err"><strong>La verificación falló:</strong> {err}</div> : null}
              {info ? <div className="swa-info">{info}</div> : null}

              <button
                type="submit"
                className="swa-submit"
                disabled={saving || verifying || loading || !allRequiredFilled}
              >
                {saving ? 'Guardando credenciales…' : verifying ? 'Verificando con Meta…' : 'Guardar y verificar con Meta'}
              </button>

              <button
                type="button"
                className="swa-skip"
                onClick={completeWhatsAppSetup}
                disabled={saving || verifying}
              >
                Omitir por ahora — conectaré WhatsApp más tarde
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
