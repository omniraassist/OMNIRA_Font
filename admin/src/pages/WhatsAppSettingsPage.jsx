import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

// Exactly the keys the admin needs to manage from this page. Anything else
// the runtime supports (OpenAI fallback chain, model id, etc.) lives in its
// own focused screen — this page is deliberately scoped to "the 9 fields".
const KEYS = [
  {
    key: 'META_WABA_ACCESS_TOKEN',
    label: 'Token de acceso de Meta',
    placeholder: 'EAAB… token de usuario de sistema de larga duración',
    hint: 'Meta Business Suite → Usuarios del sistema → Generar token con `whatsapp_business_messaging`.',
    secret: true,
  },
  {
    key: 'META_WABA_PHONE_NUMBER_ID',
    label: 'ID del número de teléfono',
    placeholder: '1124674670733081',
    hint: 'ID numérico de tu número de WhatsApp Business (Meta API Setup).',
    secret: false,
  },
  {
    key: 'META_WABA_BUSINESS_ACCOUNT_ID',
    label: 'ID de cuenta de negocio WABA',
    placeholder: '1936173473732174',
    hint: 'Meta Business Suite → Cuentas de WhatsApp → ID en la parte superior de la página.',
    secret: false,
  },
  {
    key: 'META_WABA_VERIFY_TOKEN',
    label: 'Verify token del webhook',
    placeholder: 'Cadena aleatoria larga; mismo valor en el panel de Meta',
    hint: 'Introduce este mismo valor en Meta → WhatsApp → Configuración → Verify token.',
    secret: true,
  },
  {
    key: 'META_WABA_APP_SECRET',
    label: 'App secret de Meta',
    placeholder: 'Desde App Dashboard → Settings → Basic',
    hint: 'Se usa para verificar la X-Hub-Signature-256 en cada POST entrante del webhook.',
    secret: true,
  },
  {
    key: 'META_WABA_GRAPH_VERSION',
    label: 'Versión de Graph API',
    placeholder: 'v21.0',
    hint: 'Por defecto v21.0. Cámbialo solo cuando Meta deprecie la versión actual.',
    secret: false,
  },
  {
    key: 'META_WABA_WEBHOOK_INSECURE_LOCAL',
    label: 'Dev local inseguro',
    placeholder: 'true | false',
    hint: 'Solo para desarrollo local. true → omite verificación HMAC cuando NODE_ENV != production. Se ignora en Vercel.',
    secret: false,
  },
  {
    key: 'META_WABA_WEBHOOK_SKIP_SIGNATURE',
    label: 'Saltar comprobación HMAC',
    placeholder: 'true | false',
    hint: 'Pon true solo si no puedes proporcionar el App Secret. En producción debe quedarse en false.',
    secret: false,
  },
  {
    key: 'OPENAI_API_KEY',
    label: 'Clave API de OpenAI',
    placeholder: 'sk-… sustituye a la clave de entorno de Vercel',
    hint: 'Si la pones aquí, esta clave tiene prioridad sobre la de entorno. Se usa para respuestas y extracción de leads.',
    secret: true,
  },
];

const STYLES = `
  .w-hero {
    background:
      radial-gradient(120% 80% at 0% 0%, rgba(0,229,160,0.12), transparent 55%),
      radial-gradient(120% 80% at 100% 0%, rgba(96,165,250,0.10), transparent 55%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 22px;
    margin-bottom: 18px;
    position: relative;
    overflow: hidden;
  }
  .w-hero h2 {
    display: flex; align-items: center; gap: 10px;
    margin: 0 0 6px;
    font-family: var(--font-display);
    font-size: 18px;
    color: var(--text);
  }
  .w-hero .pulse {
    width: 8px; height: 8px; border-radius: 999px;
    background: var(--em);
    box-shadow: 0 0 0 4px rgba(0,229,160,0.15), 0 0 14px rgba(0,229,160,0.45);
  }
  .w-hero p { margin: 0 0 14px; font-size: 13px; color: var(--soft); line-height: 1.6; }
  .w-url-row {
    display: flex; gap: 10px;
    background: rgba(0,0,0,0.35);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 6px;
  }
  .w-url-row input {
    flex: 1; min-width: 0;
    background: transparent;
    border: 0;
    padding: 10px 12px;
    color: var(--em);
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    outline: none;
  }
  .w-copy-btn {
    background: var(--em);
    color: #00120a;
    font-weight: 700;
    border: 0; border-radius: 10px;
    padding: 0 18px;
    cursor: pointer;
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .w-copy-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(0,229,160,0.35); }
  .w-copy-btn.copied { background: #22c55e; color: #052e1a; }

  /* Banner */
  .w-banner { padding: 12px 14px; border-radius: var(--r-md); font-size: 13px; margin-bottom: 12px; animation: w-slide .25s ease-out; }
  .w-banner.err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .w-banner.ok { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }
  @keyframes w-slide { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

  /* Fields */
  .w-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 14px;
  }
  .w-field {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 16px;
    transition: border-color .2s ease;
    animation: w-fade .35s ease-out both;
  }
  .w-field:nth-child(1) { animation-delay: 0.02s; }
  .w-field:nth-child(2) { animation-delay: 0.05s; }
  .w-field:nth-child(3) { animation-delay: 0.08s; }
  .w-field:nth-child(4) { animation-delay: 0.11s; }
  .w-field:nth-child(5) { animation-delay: 0.14s; }
  .w-field:nth-child(6) { animation-delay: 0.17s; }
  .w-field:nth-child(7) { animation-delay: 0.20s; }
  .w-field:nth-child(8) { animation-delay: 0.23s; }
  .w-field:nth-child(9) { animation-delay: 0.26s; }
  @keyframes w-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .w-field:hover { border-color: rgba(255,255,255,0.12); }
  .w-field.dirty { border-color: var(--border-em); box-shadow: 0 0 0 1px rgba(0,229,160,0.08); }
  .w-field-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
  .w-field-label { font-weight: 700; color: var(--text); font-size: 14px; line-height: 1.3; }
  .w-field-keyname { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); margin-top: 2px; }
  .w-field-hint { font-size: 12px; color: var(--soft); line-height: 1.5; margin: 8px 0 12px; }

  .w-current {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    padding: 7px 10px;
    border-radius: 8px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    margin-bottom: 10px;
  }
  .w-current.db { color: var(--em); background: rgba(0,229,160,0.06); border: 1px solid rgba(0,229,160,0.18); }
  .w-current.env { color: #93c5fd; background: rgba(96,165,250,0.06); border: 1px solid rgba(96,165,250,0.18); }
  .w-current.unset { color: #fca5a5; background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.20); }

  .w-source { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
  .w-source.db { background: rgba(0,229,160,0.12); color: var(--em); }
  .w-source.env { background: rgba(96,165,250,0.14); color: #93c5fd; }
  .w-source.unset { background: rgba(239,68,68,0.12); color: #fca5a5; }

  .w-input {
    width: 100%;
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    color: var(--text);
    font-size: 13px;
    transition: border-color .15s ease, background .15s ease;
    outline: none;
  }
  .w-input:focus { border-color: var(--em); background: rgba(0,0,0,0.45); }
  .w-input::placeholder { color: var(--muted); }

  /* Sticky save bar */
  .w-savebar {
    position: sticky; bottom: 0;
    margin: 22px -2px -2px;
    padding: 14px 20px;
    background: linear-gradient(180deg, rgba(12,18,32,0.4) 0%, var(--surf2) 60%);
    backdrop-filter: blur(8px);
    border: 1px solid var(--border-em);
    border-radius: var(--r-md);
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.5);
    z-index: 5;
  }
  .w-savebar-meta { font-size: 13px; color: var(--soft); }
  .w-savebar-meta strong { color: var(--em); font-family: 'JetBrains Mono', monospace; font-weight: 700; }
  .w-savebar-actions { display: flex; gap: 8px; }
  .w-btn {
    background: linear-gradient(180deg, var(--em) 0%, var(--em2) 100%);
    color: #00120a; font-weight: 700;
    border: 0; border-radius: 10px;
    padding: 11px 22px;
    cursor: pointer;
    transition: filter .15s ease, transform .15s ease;
    font-size: 14px;
  }
  .w-btn:disabled { filter: grayscale(.6) brightness(.7); cursor: not-allowed; }
  .w-btn:not(:disabled):hover { filter: brightness(1.08); transform: translateY(-1px); }
  .w-btn-ghost {
    background: transparent;
    color: var(--soft);
    border: 1px solid var(--border);
    padding: 11px 18px;
    border-radius: 10px;
    cursor: pointer;
    transition: all .15s ease;
  }
  .w-btn-ghost:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }

  @media (max-width: 560px) {
    .w-savebar { padding: 12px 14px; flex-direction: column; align-items: stretch; }
    .w-savebar-actions { width: 100%; }
    .w-btn, .w-btn-ghost { flex: 1; }
  }

  /* Widget toggle card — sits above the credentials grid. */
  .w-widget-card {
    background:
      radial-gradient(120% 80% at 100% 0%, rgba(0,229,160,0.10), transparent 55%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 22px 24px;
    margin-bottom: 18px;
    display: flex; align-items: center; justify-content: space-between; gap: 18px;
    flex-wrap: wrap;
  }
  .w-widget-card .info { min-width: 240px; flex: 1; }
  .w-widget-card h2 {
    display: flex; align-items: center; gap: 10px;
    margin: 0 0 4px;
    font-family: var(--font-display);
    font-size: 17px;
    color: var(--text);
  }
  .w-widget-card .status-dot {
    width: 9px; height: 9px; border-radius: 999px;
    background: #94a3b8;
    box-shadow: 0 0 0 4px rgba(148,163,184,0.15);
    transition: background .2s ease, box-shadow .2s ease;
  }
  .w-widget-card.on .status-dot {
    background: var(--em);
    box-shadow: 0 0 0 4px rgba(0,229,160,0.18), 0 0 12px rgba(0,229,160,0.45);
  }
  .w-widget-card p { margin: 0; font-size: 13px; color: var(--soft); line-height: 1.55; }
  .w-widget-card .state-pill {
    display: inline-block; margin-left: 8px;
    font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    padding: 3px 9px; border-radius: 999px;
    background: rgba(148,163,184,0.16); color: #cbd5e1;
  }
  .w-widget-card.on .state-pill { background: rgba(0,229,160,0.14); color: var(--em); }

  /* iOS-style switch */
  .w-switch { position: relative; width: 64px; height: 34px; flex-shrink: 0; }
  .w-switch input { opacity: 0; width: 0; height: 0; }
  .w-switch .track {
    position: absolute; inset: 0;
    background: rgba(255,255,255,0.10);
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
    transition: background .25s ease, border-color .25s ease;
  }
  .w-switch .thumb {
    position: absolute; top: 3px; left: 3px;
    width: 26px; height: 26px;
    background: #cbd5e1;
    border-radius: 50%;
    transition: transform .25s cubic-bezier(.4,0,.2,1), background .25s ease;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
  .w-switch input:checked + .track {
    background: linear-gradient(135deg, var(--em) 0%, var(--em2) 100%);
    border-color: var(--em);
  }
  .w-switch input:checked + .track .thumb {
    transform: translateX(30px);
    background: #04201a;
  }
  .w-switch input:disabled + .track { opacity: .55; cursor: not-allowed; }
`;

function sourceBadge(source) {
  if (source === 'db') return <span className="w-source db">BD · editable</span>;
  if (source === 'env') return <span className="w-source env">Entorno Vercel</span>;
  return <span className="w-source unset">SIN DEFINIR</span>;
}

const WIDGET_KEY = 'OMNIRA_WIDGET_WHATSAPP_ENABLED';

export function WhatsAppSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [copied, setCopied] = useState(false);
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  const [widgetBusy, setWidgetBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/platform-settings');
      const list = res.settings || [];
      setSettings(list);
      setWebhookUrl(res.webhook_url || '');
      setDrafts({}); // reset draft inputs after load
      const widgetRow = list.find((s) => s.key === WIDGET_KEY);
      // Default to enabled when row is missing or unset — matches server fallback.
      const raw = widgetRow?.value_masked || '';
      setWidgetEnabled(String(raw).trim().toLowerCase() !== 'false');
    } catch (e) {
      setError(e?.message || 'No se pudo cargar la configuración de la plataforma');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleWidget = async () => {
    if (widgetBusy) return;
    const next = !widgetEnabled;
    setWidgetBusy(true);
    setError(''); setInfo('');
    // Optimistic flip — feels instant; revert on failure.
    setWidgetEnabled(next);
    const sess = JSON.parse(sessionStorage.getItem('omnira_admin_session') || '{}');
    const updatedBy = sess.user?.email || 'admin';
    try {
      await apiCall(`/api/admin/platform-settings/${encodeURIComponent(WIDGET_KEY)}`, {
        method: 'PATCH',
        body: JSON.stringify({ value: next ? 'true' : 'false', updated_by: updatedBy }),
      });
      setInfo(next
        ? 'Widget de WhatsApp activado en la landing. Visible en ~30 s.'
        : 'Widget de WhatsApp oculto de la landing. Aplicado en ~30 s.');
    } catch (e) {
      setWidgetEnabled(!next);
      setError(e?.message || 'No se pudo actualizar el widget');
    } finally {
      setWidgetBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const byKey = useMemo(() => new Map(settings.map((s) => [s.key, s])), [settings]);
  const visible = useMemo(
    () => KEYS.filter((meta) => byKey.has(meta.key)).map((meta) => ({ meta, row: byKey.get(meta.key) })),
    [byKey]
  );

  const dirtyKeys = useMemo(
    () => Object.entries(drafts).filter(([, v]) => v && v.trim()).map(([k]) => k),
    [drafts]
  );

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  const saveAll = async () => {
    if (dirtyKeys.length === 0) return;
    setSaving(true);
    setError(''); setInfo('');
    const sess = JSON.parse(sessionStorage.getItem('omnira_admin_session') || '{}');
    const updatedBy = sess.user?.email || 'admin';
    const failures = [];
    let savedCount = 0;
    try {
      // Sequential so any per-key error is precise and reported cleanly.
      for (const key of dirtyKeys) {
        try {
          await apiCall(`/api/admin/platform-settings/${encodeURIComponent(key)}`, {
            method: 'PATCH',
            body: JSON.stringify({ value: drafts[key], updated_by: updatedBy }),
          });
          savedCount += 1;
        } catch (e) {
          failures.push(`${key}: ${e?.message || 'falló'}`);
        }
      }
      if (failures.length) {
        setError(`Guardados ${savedCount} · fallidos: ${failures.join(' · ')}`);
      } else {
        setInfo(`Guardado ${savedCount} cambio${savedCount === 1 ? '' : 's'}. Activo en ~30 s.`);
      }
      await load();
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setDrafts({});

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>Configuración de WhatsApp</h1>
        <p>
          Las 9 variables de ejecución de Meta + OpenAI. La prioridad de resolución en cada petición es{' '}
          <code>entorno Vercel → BD (esta página) → valor por defecto integrado</code>. Edita cualquier campo y
          pulsa <strong>Guardar todos los cambios</strong>. Los cambios se activan en ~30 segundos — sin redeploy.
        </p>
      </header>

      {/* Webhook URL hero */}
      <section className="w-hero">
        <h2><span className="pulse" /> URL del webhook (callback)</h2>
        <p>
          Pega esto en Meta App → <strong>WhatsApp</strong> → Configuración → Callback URL. El Verify token debe
          coincidir con <code>META_WABA_VERIFY_TOKEN</code> de abajo. Tras guardar, pulsa{' '}
          <strong>Suscribirse</strong> en el campo <code>messages</code>.
        </p>
        <div className="w-url-row">
          <input readOnly value={webhookUrl} />
          <button
            type="button"
            className={`w-copy-btn ${copied ? 'copied' : ''}`}
            onClick={copyWebhook}
            disabled={!webhookUrl}
          >
            {copied ? '✓ Copiado' : 'Copiar URL'}
          </button>
        </div>
      </section>

      {/* Widget on/off — sits prominently above the credentials. */}
      <section className={`w-widget-card${widgetEnabled ? ' on' : ''}`}>
        <div className="info">
          <h2>
            <span className="status-dot" />
            Widget de WhatsApp en la landing
            <span className="state-pill">{widgetEnabled ? 'Activo' : 'Oculto'}</span>
          </h2>
          <p>
            Cuando está activo, el botón flotante de WhatsApp aparece en la página pública para que los visitantes
            puedan abrir una conversación con tu negocio en un toque. Apágalo cuando quieras esconder el widget sin
            tocar el código — el cambio se aplica en unos 30 segundos sin redeploy.
          </p>
        </div>
        <label className="w-switch" title={widgetEnabled ? 'Ocultar widget' : 'Mostrar widget'}>
          <input
            type="checkbox"
            checked={widgetEnabled}
            onChange={toggleWidget}
            disabled={widgetBusy || loading}
            aria-label="Activar o desactivar el widget de WhatsApp en la landing"
          />
          <span className="track">
            <span className="thumb" />
          </span>
        </label>
      </section>

      {error ? <div className="w-banner err"><strong>Error:</strong> {error}</div> : null}
      {info ? <div className="w-banner ok"><strong>OK:</strong> {info}</div> : null}

      {loading && !settings.length ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Cargando configuración…</div>
      ) : (
        <div className="w-grid">
          {visible.map(({ meta, row }) => {
            const isDirty = !!(drafts[meta.key] && drafts[meta.key].trim());
            const currentClass = row.source === 'db' ? 'db' : row.source === 'env' ? 'env' : 'unset';
            return (
              <div key={meta.key} className={`w-field${isDirty ? ' dirty' : ''}`}>
                <div className="w-field-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="w-field-label">{meta.label}</div>
                    <div className="w-field-keyname">{meta.key}</div>
                  </div>
                  {sourceBadge(row.source)}
                </div>
                <div className="w-field-hint">{meta.hint}</div>
                <div className={`w-current ${currentClass}`} title={row.value_masked || 'SIN DEFINIR'}>
                  {row.has_value ? row.value_masked : 'SIN DEFINIR'}
                </div>
                <input
                  className="w-input"
                  type={meta.secret ? 'password' : 'text'}
                  value={drafts[meta.key] || ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [meta.key]: e.target.value }))}
                  placeholder={meta.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="w-savebar">
        <div className="w-savebar-meta">
          {dirtyKeys.length === 0 ? (
            <>Sin cambios pendientes. Edita cualquier campo de arriba para habilitar Guardar.</>
          ) : (
            <><strong>{dirtyKeys.length}</strong> cambio{dirtyKeys.length === 1 ? '' : 's'} pendiente{dirtyKeys.length === 1 ? '' : 's'} listo{dirtyKeys.length === 1 ? '' : 's'} para guardar</>
          )}
        </div>
        <div className="w-savebar-actions">
          <button
            type="button"
            className="w-btn-ghost"
            onClick={discard}
            disabled={saving || dirtyKeys.length === 0}
          >
            Descartar
          </button>
          <button
            type="button"
            className="w-btn"
            onClick={saveAll}
            disabled={saving || dirtyKeys.length === 0}
          >
            {saving ? 'Guardando…' : 'Guardar todos los cambios'}
          </button>
        </div>
      </div>
    </>
  );
}
