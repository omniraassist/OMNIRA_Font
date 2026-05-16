import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '../../api/client.js';

/**
 * Meta WhatsApp Business credentials card for the customer dashboard
 * settings page. The customer only supplies the 3 values that are
 * genuinely theirs and cannot be derived — access token, WABA id and
 * app secret. The webhook verify token is generated server-side and the
 * phone_number_id is auto-fetched from the WABA during verification, so
 * the customer never has to type or invent those.
 *
 * On save we PATCH the 3 credentials, then verify against Meta: a valid
 * set shows a success message, an invalid set shows Meta's exact error.
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
    key: 'meta_business_account_id',
    label: 'WABA business account ID',
    placeholder: 'ej. 1936173473732174',
    hint: 'Meta Business Suite → Cuentas de WhatsApp → ID en la parte superior. De aquí detectamos tu número automáticamente.',
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
  const [verifyToken, setVerifyToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok: boolean, msg: string }
  const [copied, setCopied] = useState(''); // 'url' | 'token' | ''

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall('/api/customer/whatsapp-config');
      setServer(res.config || null);
      setWebhookUrl(res.webhook_url || '');
      setVerifyToken(res.config?.meta_verify_token || '');
      setPhoneNumberId(res.config?.meta_phone_number_id || '');
      setDraft((d) => ({
        ...d,
        meta_business_account_id: res.config?.meta_business_account_id || '',
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

  const copy = async (kind, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      /* ignore */
    }
  };

  async function onSave(e) {
    e.preventDefault();
    setResult(null);
    setBusy(true);

    // 1. Save the 3 credentials — skip empty secrets so a saved token isn't wiped.
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

    // 2. Verify — the server auto-fetches the phone number from the WABA.
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

  const readOnlyRow = (kind, value) => (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        className="form-input"
        readOnly
        value={value}
        style={{ fontFamily: 'monospace', fontSize: 12 }}
      />
      <button type="button" className="btn-save-form" onClick={() => copy(kind, value)} style={{ flexShrink: 0 }}>
        <i className={`fa-solid ${copied === kind ? 'fa-check' : 'fa-copy'}`} /> {copied === kind ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );

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
        Solo necesitas <strong>3 datos</strong> de Meta. El número de teléfono lo detectamos solos desde tu
        WABA, y el verify token lo generamos nosotros — tú solo lo copias en Meta. Al guardar, verificamos
        con Meta: si todo es válido verás un mensaje de éxito; si no, el error exacto.
      </p>

      {/* Server-managed values — read-only, customer just copies them into Meta. */}
      {webhookUrl ? (
        <div className="form-group full" style={{ marginBottom: 14 }}>
          <label className="form-label">
            1. URL del webhook — pégala en Meta → WhatsApp → Configuración → Callback URL
          </label>
          {readOnlyRow('url', webhookUrl)}
        </div>
      ) : null}

      {verifyToken ? (
        <div className="form-group full" style={{ marginBottom: 16 }}>
          <label className="form-label">
            2. Verify token — pégalo en Meta → WhatsApp → Configuración → Verify token (lo generamos nosotros)
          </label>
          {readOnlyRow('token', verifyToken)}
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

        {phoneNumberId ? (
          <p style={{ fontSize: 12, color: 'var(--soft)', marginTop: 10 }}>
            <i className="fa-solid fa-circle-check" style={{ color: 'var(--em)', marginRight: 6 }} />
            Número detectado automáticamente — Phone number ID: <code>{phoneNumberId}</code>
          </p>
        ) : null}

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
