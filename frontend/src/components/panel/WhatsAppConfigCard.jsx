import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '../../api/client.js';

/**
 * Meta WhatsApp Business credentials card for the customer dashboard
 * settings page. Mirrors the 5 fields from the post-payment onboarding
 * (PostLoginWhatsAppSetup) so a paying customer can update them at any
 * time. On save we PATCH the credentials, then verify them against the
 * Meta Graph API — a valid set shows a success message, an invalid set
 * shows the exact error returned by Meta.
 */
const WA_FIELDS = [
  {
    key: 'meta_access_token',
    label: 'Meta access token',
    placeholder: 'EAAB… token de usuario de sistema',
    hint: 'Meta Business Suite → Usuarios del sistema → Generar token con whatsapp_business_messaging.',
    type: 'password',
    secret: true,
  },
  {
    key: 'meta_phone_number_id',
    label: 'Phone number ID',
    placeholder: 'ej. 1124674670733081',
    hint: 'Meta Business Suite → API Setup → Números de teléfono → columna ID.',
    type: 'text',
  },
  {
    key: 'meta_business_account_id',
    label: 'WABA business account ID',
    placeholder: 'ej. 1936173473732174',
    hint: 'Meta Business Suite → Cuentas de WhatsApp → ID en la parte superior.',
    type: 'text',
  },
  {
    key: 'meta_verify_token',
    label: 'Webhook verify token',
    placeholder: 'Cadena aleatoria — la misma que pones en Meta',
    hint: 'Elige cualquier cadena larga aleatoria. Pega este mismo valor en Meta → Configuración → Verify token.',
    type: 'text',
  },
  {
    key: 'meta_app_secret',
    label: 'Meta App secret',
    placeholder: 'App Dashboard → Configuración → Básica → Clave secreta',
    hint: 'Se usa para verificar la firma X-Hub-Signature de cada webhook entrante.',
    type: 'password',
    secret: true,
  },
];

export function WhatsAppConfigCard({ showToast }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(WA_FIELDS.map((f) => [f.key, ''])));
  const [server, setServer] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok: boolean, msg: string }
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
        meta_verify_token: res.config?.meta_verify_token || '',
      }));
    } catch (e) {
      setResult({ ok: false, msg: e?.message || 'No se pudo cargar la configuración de WhatsApp.' });
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

  async function onSave(e) {
    e.preventDefault();
    setResult(null);
    setBusy(true);

    // 1. Save credentials — skip empty secrets so a saved token isn't wiped.
    const payload = { meta_graph_version: 'v21.0' };
    for (const f of WA_FIELDS) {
      if (f.secret && !draft[f.key]) continue;
      payload[f.key] = draft[f.key] || '';
    }
    try {
      await apiCall('/api/customer/whatsapp-config', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } catch (ex) {
      setBusy(false);
      const msg = `No se pudieron guardar las credenciales: ${ex?.message || ex}`;
      setResult({ ok: false, msg });
      showToast?.(msg, 'error');
      return;
    }

    // 2. Verify the saved credentials against Meta.
    try {
      const r = await apiCall('/api/customer/whatsapp-config/verify', { method: 'POST' });
      if (r.verified) {
        const who = r.verified_name || r.display_phone_number || 'tu número de WhatsApp';
        const msg = `Credenciales válidas. WhatsApp Business verificado y conectado (${who}).`;
        setResult({ ok: true, msg });
        showToast?.('Credenciales válidas — WhatsApp conectado', 'success');
        await load();
      } else {
        const msg =
          r.message ||
          `La verificación con Meta falló${r.meta_status ? ` (HTTP ${r.meta_status})` : ''}. Revisa los datos.`;
        setResult({ ok: false, msg });
        showToast?.('Credenciales inválidas — revisa los datos', 'error');
      }
    } catch (ex) {
      const msg = `Error al verificar con Meta: ${ex?.message || ex}`;
      setResult({ ok: false, msg });
      showToast?.(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-card">
      <div className="p-card-header">
        <span className="p-card-title">Conexión WhatsApp Business (Meta)</span>
        {server?.is_active ? (
          <div className="bot-live-badge">
            <div className="bot-live-dot" /> Conectado
          </div>
        ) : null}
      </div>
      <p style={{ fontSize: 13, color: 'var(--soft)', lineHeight: 1.7, marginBottom: 14 }}>
        Pega o actualiza tus 5 credenciales de Meta. Al guardar, las verificamos con Meta: si son válidas
        verás un mensaje de éxito; si no, te mostraremos el error exacto.
      </p>

      {webhookUrl ? (
        <div className="form-group full" style={{ marginBottom: 16 }}>
          <label className="form-label">
            URL del webhook — pégala en Meta → WhatsApp → Configuración → Callback URL
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              readOnly
              value={webhookUrl}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <button type="button" className="btn-save-form" onClick={copyWebhook} style={{ flexShrink: 0 }}>
              <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSave}>
        <div className="settings-2col">
          {WA_FIELDS.map((f) => {
            const savedSecret =
              f.secret &&
              ((f.key === 'meta_access_token' && server?.meta_access_token_set) ||
                (f.key === 'meta_app_secret' && server?.meta_app_secret_set));
            return (
              <div className="form-group" key={f.key}>
                <label className="form-label">{f.label}</label>
                <input
                  className="form-input"
                  type={f.type}
                  value={draft[f.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  placeholder={savedSecret ? '••••••• (guardado — escribe para reemplazar)' : f.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    lineHeight: 1.5,
                    marginTop: 4,
                    display: 'block',
                  }}
                >
                  {f.hint}
                </span>
              </div>
            );
          })}
        </div>

        {result ? (
          <div
            style={{
              marginTop: 12,
              padding: '11px 14px',
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.55,
              background: result.ok ? 'rgba(0,229,160,0.10)' : 'rgba(239,68,68,0.10)',
              border: `1px solid ${result.ok ? 'rgba(0,229,160,0.38)' : 'rgba(239,68,68,0.38)'}`,
              color: result.ok ? 'var(--em)' : '#fecaca',
            }}
          >
            <i
              className={`fa-solid ${result.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`}
              style={{ marginRight: 7 }}
            />
            {result.msg}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="submit" className="btn-save-form" disabled={busy || loading}>
            <i className="fa-solid fa-floppy-disk" /> {busy ? 'Guardando y verificando…' : 'Guardar y verificar'}
          </button>
        </div>
      </form>
    </div>
  );
}
