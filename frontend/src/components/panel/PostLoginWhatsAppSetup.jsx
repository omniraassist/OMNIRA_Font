import { useCallback, useEffect, useState } from 'react';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';
import { apiCall } from '../../api/client.js';

const FIELDS = [
  {
    key: 'meta_phone_number_id',
    label: 'WhatsApp phone number ID',
    placeholder: 'e.g. 1124674670733081',
    hint: 'Meta Business Suite → API Setup → Phone number ID. Numeric only.',
    type: 'text',
    required: true,
  },
  {
    key: 'meta_business_account_id',
    label: 'WhatsApp Business Account (WABA) ID',
    placeholder: 'e.g. 1936173473732174',
    hint: 'Meta Business Suite → WhatsApp Accounts → ID at the top.',
    type: 'text',
    required: true,
  },
  {
    key: 'meta_display_phone_number',
    label: 'Display phone number',
    placeholder: '+34 600 000 000',
    hint: 'How your number appears to recipients.',
    type: 'text',
    required: false,
  },
  {
    key: 'meta_verified_name',
    label: 'Verified business name',
    placeholder: 'My Business S.L.',
    hint: 'The name Meta approved for your WABA.',
    type: 'text',
    required: false,
  },
  {
    key: 'meta_access_token',
    label: 'Meta access token (long-lived system user)',
    placeholder: 'EAAB…',
    hint: 'Meta Business Suite → Settings → System Users → generate token with whatsapp_business_messaging.',
    type: 'password',
    required: true,
    secret: true,
  },
  {
    key: 'meta_app_secret',
    label: 'Meta App secret',
    placeholder: 'From App Dashboard → Settings → Basic',
    hint: 'Used to verify the HMAC signature on every inbound webhook POST.',
    type: 'password',
    required: true,
    secret: true,
  },
  {
    key: 'meta_verify_token',
    label: 'Webhook verify token (you choose)',
    placeholder: 'A random string — must match what you paste in Meta',
    hint: 'You enter this same value in Meta → WhatsApp → Configuration → Verify token.',
    type: 'text',
    required: true,
  },
  {
    key: 'meta_graph_version',
    label: 'Graph API version',
    placeholder: 'v21.0',
    hint: 'Default v21.0. Only change if Meta deprecates it.',
    type: 'text',
    required: false,
  },
];

export function PostLoginWhatsAppSetup() {
  const { closeClientPanel, completeWhatsAppSetup } = usePanel();
  const [draft, setDraft] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, ''])));
  const [server, setServer] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall('/api/customer/whatsapp-config');
      setServer(res.config || null);
      setWebhookUrl(res.webhook_url || '');
      setDraft((d) => ({
        ...d,
        meta_phone_number_id: res.config?.meta_phone_number_id || '',
        meta_business_account_id: res.config?.meta_business_account_id || '',
        meta_display_phone_number: res.config?.meta_display_phone_number || '',
        meta_verified_name: res.config?.meta_verified_name || '',
        meta_verify_token: res.config?.meta_verify_token || '',
        meta_graph_version: res.config?.meta_graph_version || 'v21.0',
      }));
    } catch (e) {
      setErr(e?.message || 'No se pudo cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    setInfo('');
    try {
      const payload = {};
      for (const f of FIELDS) {
        if (f.secret && !draft[f.key]) continue; // don't overwrite saved secrets with blank
        payload[f.key] = draft[f.key] || '';
      }
      payload.mark_complete = true;
      await apiCall('/api/customer/whatsapp-config', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setInfo('Guardado. Podrás editarlo más tarde desde "Mi Negocio" en el panel.');
      // After saving, advance to dashboard.
      setTimeout(() => completeWhatsAppSetup(), 700);
    } catch (ex) {
      setErr(ex?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-screen panel-wa-screen">
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
            <span className="auth-header-mini-icon">
              <LogoMark size={22} alt="" />
            </span>
            Omni<span>ra</span>
          </button>
        </div>
      </header>

      <main className="panel-payment-main">
        <div className="panel-plan-inner">
          <div className="panel-plan-pipeline reveal visible" aria-label="Flujo de onboarding">
            <div className="panel-plan-step done">
              <span className="panel-plan-step-num"><i className="fa-solid fa-check" /></span>
              <span className="panel-plan-step-label">Plan</span>
            </div>
            <span className="panel-plan-step-line" aria-hidden />
            <div className="panel-plan-step done">
              <span className="panel-plan-step-num"><i className="fa-solid fa-check" /></span>
              <span className="panel-plan-step-label">Pago</span>
            </div>
            <span className="panel-plan-step-line" aria-hidden />
            <div className="panel-plan-step is-active">
              <span className="panel-plan-step-num">3</span>
              <span className="panel-plan-step-label">WhatsApp Business</span>
            </div>
          </div>

          <form className="glass panel-payment-card reveal visible panel-wa-form" onSubmit={onSubmit}>
            <h1 className="panel-plan-title">
              Conecta tu
              <br />
              <span className="gradient-text">WhatsApp Business</span>
            </h1>
            <p className="panel-plan-lead">
              Pega tus credenciales de Meta Cloud API para activar tu agente Omnira en tu propio número. Todo se
              guarda cifrado y solo tu agente lo usa.
            </p>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label">Webhook callback URL (Meta lo pedirá)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" readOnly value={webhookUrl} style={{ fontFamily: 'monospace' }} />
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={copyWebhook}
                  disabled={!webhookUrl}
                >
                  {copied ? '¡Copiado!' : 'Copiar URL'}
                </button>
              </div>
              <p className="auth-helper" style={{ marginTop: 6 }}>
                Pega esta URL en Meta App → WhatsApp → Configuration → Callback URL. El "verify token" debe ser
                igual al que escribas más abajo. Después pulsa "Subscribe" en el campo <code>messages</code>.
              </p>
            </div>

            {loading ? (
              <p style={{ color: 'var(--muted)' }}>Cargando…</p>
            ) : (
              <div className="panel-wa-grid">
                {FIELDS.map((f) => {
                  const saved =
                    f.secret &&
                    ((f.key === 'meta_access_token' && server?.meta_access_token_set) ||
                      (f.key === 'meta_app_secret' && server?.meta_app_secret_set));
                  return (
                    <div className="form-group" key={f.key}>
                      <label className="form-label">
                        {f.label}
                        {f.required ? <span style={{ color: 'var(--em)' }}> *</span> : null}
                      </label>
                      <input
                        className="form-input"
                        type={f.type}
                        value={draft[f.key]}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        placeholder={saved ? '••••••• (guardado — escribe para reemplazar)' : f.placeholder}
                        required={f.required && !saved}
                        autoComplete="off"
                      />
                      <p className="auth-helper" style={{ marginTop: 4 }}>{f.hint}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {err ? <div className="auth-error show" style={{ marginTop: 12 }}>{err}</div> : null}
            {info ? (
              <div className="auth-helper" style={{ marginTop: 12, color: 'var(--em)' }}>{info}</div>
            ) : null}

            <button type="submit" className="btn-primary panel-plan-cta" disabled={saving || loading}>
              {saving ? 'Guardando…' : 'Guardar y entrar al panel'}
              <i className="fa-solid fa-check" style={{ marginLeft: 8 }} />
            </button>

            <button
              type="button"
              className="btn-ghost"
              style={{ width: '100%', marginTop: 8 }}
              onClick={completeWhatsAppSetup}
              disabled={saving}
            >
              Saltar por ahora · configurar más tarde
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
