import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

// Friendly metadata for each platform key (label + visible row context).
const KEY_META = {
  META_WABA_VERIFY_TOKEN: {
    label: 'Meta webhook verify token',
    placeholder: 'A random string you also paste into Meta App → WhatsApp → Configuration',
  },
  META_WABA_ACCESS_TOKEN: {
    label: 'Meta access token (long-lived system user)',
    placeholder: 'EAAB… (Meta Business Suite → System Users → token with whatsapp_business_messaging)',
  },
  META_WABA_APP_SECRET: {
    label: 'Meta App secret',
    placeholder: 'From App Dashboard → Settings → Basic → App secret',
  },
  META_WABA_PHONE_NUMBER_ID: {
    label: 'Phone number ID',
    placeholder: 'Numeric ID of your WhatsApp Business number',
  },
  META_WABA_BUSINESS_ACCOUNT_ID: {
    label: 'WABA business account ID',
    placeholder: 'Meta Business Suite → WhatsApp Accounts → ID',
  },
  META_WABA_GRAPH_VERSION: {
    label: 'Graph API version',
    placeholder: 'v21.0',
  },
  META_WABA_WEBHOOK_SKIP_SIGNATURE: {
    label: 'Skip HMAC signature check',
    placeholder: 'false (set to true ONLY if you cannot provide META_WABA_APP_SECRET)',
  },
  META_WABA_MARKETING_AUTO_REPLY: {
    label: 'Fixed auto-reply (optional)',
    placeholder: 'Leave empty to let OpenAI generate replies',
  },
  OPENAI_API_KEY: { label: 'OpenAI API key', placeholder: 'sk-…' },
  OPENAI_CHAT_MODEL: { label: 'OpenAI model', placeholder: 'gpt-4o-mini' },
};

const KEY_ORDER = [
  'META_WABA_VERIFY_TOKEN',
  'META_WABA_ACCESS_TOKEN',
  'META_WABA_APP_SECRET',
  'META_WABA_PHONE_NUMBER_ID',
  'META_WABA_BUSINESS_ACCOUNT_ID',
  'META_WABA_GRAPH_VERSION',
  'META_WABA_WEBHOOK_SKIP_SIGNATURE',
  'META_WABA_MARKETING_AUTO_REPLY',
  'OPENAI_API_KEY',
  'OPENAI_CHAT_MODEL',
];

export function WhatsAppSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/platform-settings');
      const list = res.settings || [];
      setSettings(list);
      setWebhookUrl(res.webhook_url || '');
      const next = {};
      for (const s of list) next[s.key] = '';
      setDrafts(next);
    } catch (e) {
      setSettings([]);
      setError(e?.message || 'Could not load platform settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ordered = useMemo(() => {
    const map = new Map(settings.map((s) => [s.key, s]));
    return KEY_ORDER.filter((k) => map.has(k)).map((k) => map.get(k));
  }, [settings]);

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const save = async (key) => {
    const value = drafts[key] || '';
    if (!value) {
      setError(`Enter a value for ${key} before saving.`);
      return;
    }
    setSavingKey(key);
    setError('');
    setInfo('');
    try {
      const sess = JSON.parse(sessionStorage.getItem('omnira_admin_session') || '{}');
      const res = await apiCall(`/api/admin/platform-settings/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: JSON.stringify({ value, updated_by: sess.user?.email || 'admin' }),
      });
      setSettings((all) =>
        all.map((s) =>
          s.key === key
            ? {
                ...s,
                has_value: res.has_value,
                value_masked: res.value_masked,
                source: 'db',
                updated_at: res.updated_at,
                updated_by: res.updated_by,
              }
            : s
        )
      );
      setDrafts((d) => ({ ...d, [key]: '' }));
      setInfo(`${key} saved. The webhook + agent pick up the new value within ~30 s (cache TTL).`);
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSavingKey('');
    }
  };

  const sourceBadge = (source) => {
    if (source === 'db') return <span className="adm-badge active">DB (editable)</span>;
    if (source === 'env') return <span className="adm-badge live">Vercel env (fallback)</span>;
    return <span className="adm-badge paused">unset</span>;
  };

  return (
    <>
      <header className="adm-page-head">
        <h1>WhatsApp · platform configuration</h1>
        <p>
          Every Meta + OpenAI runtime key. The agent reads each one with priority{' '}
          <code>DB → Vercel env → built-in default</code>, so you can paste a new value here and it goes live within
          ~30 seconds without a redeploy. Secrets are stored in <code>public.platform_settings</code> and shown
          masked.
        </p>
      </header>

      <section className="adm-card adm-card-em" style={{ marginBottom: 16 }}>
        <h2 className="adm-card-title">Webhook callback URL — paste this in Meta</h2>
        <p className="adm-field-hint" style={{ marginBottom: 10 }}>
          Meta App Dashboard → <strong>WhatsApp</strong> → Configuration → <strong>Edit</strong> on Webhook →
          Callback URL. Verify token must match <code>META_WABA_VERIFY_TOKEN</code> below. After saving, scroll down
          and click <strong>Subscribe</strong> on the <code>messages</code> field.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input readOnly value={webhookUrl} className="adm-mono" style={{ flex: 1 }} />
          <button type="button" className="adm-btn adm-btn-primary" onClick={copyWebhook} disabled={!webhookUrl}>
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
        </div>
      </section>

      <div className="adm-toolbar">
        <button type="button" className="adm-btn adm-btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span className="adm-mono" style={{ color: 'var(--muted)' }}>{ordered.length} keys</span>
      </div>

      {error ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Error:</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{error}</span>
        </div>
      ) : null}
      {info ? (
        <div className="adm-card" style={{ marginBottom: 12, borderColor: 'rgba(34,197,94,0.4)' }}>
          <strong style={{ color: '#bbf7d0' }}>OK:</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{info}</span>
        </div>
      ) : null}

      {ordered.map((s) => {
        const meta = KEY_META[s.key] || { label: s.key, placeholder: '' };
        const isSaving = savingKey === s.key;
        return (
          <section className="adm-card" key={s.key} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 className="adm-card-title" style={{ marginBottom: 4 }}>
                  {meta.label}
                </h2>
                <div className="adm-mono" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                  {s.key}
                </div>
                {s.description ? (
                  <p className="adm-field-hint" style={{ marginBottom: 8 }}>{s.description}</p>
                ) : null}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                {sourceBadge(s.source)}
                {s.has_value ? (
                  <span className="adm-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Current: {s.value_masked || '(empty)'}
                  </span>
                ) : (
                  <span className="adm-mono" style={{ fontSize: 11, color: '#fca5a5' }}>NOT SET</span>
                )}
                {s.updated_at ? (
                  <span className="adm-mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {new Date(s.updated_at).toLocaleString()}
                    {s.updated_by ? ` · ${s.updated_by}` : ''}
                  </span>
                ) : null}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                type={s.is_secret ? 'password' : 'text'}
                placeholder={meta.placeholder}
                value={drafts[s.key] || ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                style={{ flex: 1 }}
                className={s.is_secret ? undefined : 'adm-mono'}
              />
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                onClick={() => save(s.key)}
                disabled={isSaving || !drafts[s.key]}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </section>
        );
      })}
    </>
  );
}
