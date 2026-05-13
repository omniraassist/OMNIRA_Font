import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiCall } from '../api/client.js';

// ---------------------------------------------------------------------------
// Friendly metadata for each platform-settings key (label + visible context).
// ---------------------------------------------------------------------------
const KEY_META = {
  META_WABA_VERIFY_TOKEN: {
    label: 'Webhook verify token',
    placeholder: 'A random string you also paste into Meta App → WhatsApp → Configuration',
    section: 'meta',
  },
  META_WABA_ACCESS_TOKEN: {
    label: 'Meta access token',
    placeholder: 'EAAB… long-lived system user token',
    section: 'meta',
  },
  META_WABA_APP_SECRET: {
    label: 'Meta App secret',
    placeholder: 'App Dashboard → Settings → Basic',
    section: 'meta',
  },
  META_WABA_PHONE_NUMBER_ID: {
    label: 'Phone number ID',
    placeholder: 'Numeric ID of your WhatsApp Business number',
    section: 'meta',
  },
  META_WABA_BUSINESS_ACCOUNT_ID: {
    label: 'WABA business account ID',
    placeholder: 'Meta Business Suite → WhatsApp Accounts → ID',
    section: 'meta',
  },
  META_WABA_GRAPH_VERSION: {
    label: 'Graph API version',
    placeholder: 'v21.0',
    section: 'meta',
  },
  META_WABA_WEBHOOK_SKIP_SIGNATURE: {
    label: 'Skip HMAC signature check',
    placeholder: 'true | false (use ONLY if App Secret unavailable)',
    section: 'meta',
  },
  META_WABA_MARKETING_AUTO_REPLY: {
    label: 'Fixed auto-reply (optional)',
    placeholder: 'Leave empty to let OpenAI generate replies',
    section: 'meta',
  },
  OPENAI_API_KEY: {
    label: 'OpenAI key — platform override',
    placeholder: 'sk-… overrides the env key',
    section: 'openai',
  },
  OPENAI_CHAT_MODEL: {
    label: 'OpenAI model',
    placeholder: 'gpt-4o-mini',
    section: 'openai',
  },
};

const META_KEYS = [
  'META_WABA_VERIFY_TOKEN',
  'META_WABA_ACCESS_TOKEN',
  'META_WABA_APP_SECRET',
  'META_WABA_PHONE_NUMBER_ID',
  'META_WABA_BUSINESS_ACCOUNT_ID',
  'META_WABA_GRAPH_VERSION',
  'META_WABA_WEBHOOK_SKIP_SIGNATURE',
  'META_WABA_MARKETING_AUTO_REPLY',
];

const OPENAI_KEYS = ['OPENAI_API_KEY', 'OPENAI_CHAT_MODEL'];

// ---------------------------------------------------------------------------
// Scoped styles (kept in this file so the page is self-contained and we don't
// touch admin.css). Uses the existing theme tokens.
// ---------------------------------------------------------------------------
const STYLES = `
  .wa-hero {
    background:
      radial-gradient(120% 80% at 0% 0%, rgba(0,229,160,0.10), transparent 55%),
      radial-gradient(120% 80% at 100% 0%, rgba(96,165,250,0.08), transparent 55%),
      linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border-em);
    border-radius: var(--r-lg);
    padding: 22px;
    margin-bottom: 18px;
    position: relative;
    overflow: hidden;
  }
  .wa-hero::after {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(60% 40% at 50% 0%, rgba(0,229,160,0.10), transparent 65%);
    pointer-events: none;
  }
  .wa-hero-title {
    display: flex; align-items: center; gap: 10px;
    font-family: var(--font-display);
    font-size: 20px;
    margin: 0 0 6px;
    color: var(--text);
  }
  .wa-hero-title .wa-dot {
    width: 8px; height: 8px; border-radius: 999px;
    background: var(--em);
    box-shadow: 0 0 0 4px rgba(0,229,160,0.15), 0 0 14px rgba(0,229,160,0.45);
  }
  .wa-hero-sub { font-size: 13px; color: var(--soft); margin: 0 0 14px; line-height: 1.6; }

  .wa-url-row {
    display: flex; gap: 10px; align-items: stretch;
    background: rgba(0,0,0,0.35);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 6px;
  }
  .wa-url-input {
    flex: 1; min-width: 0;
    background: transparent;
    border: 0;
    padding: 10px 12px;
    color: var(--em);
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    outline: none;
  }
  .wa-copy-btn {
    background: var(--em);
    color: #00120a;
    font-weight: 700;
    border: 0;
    border-radius: 10px;
    padding: 0 16px;
    cursor: pointer;
    transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
  }
  .wa-copy-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(0,229,160,0.35); }
  .wa-copy-btn:active { transform: translateY(0); }
  .wa-copy-btn.copied { background: #22c55e; color: #052e1a; }

  .wa-status-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
  .wa-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 12px; font-weight: 600;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
  }
  .wa-pill.ok { background: rgba(0,229,160,0.10); border-color: var(--border-em); color: var(--em); }
  .wa-pill.warn { background: rgba(234,179,8,0.10); border-color: rgba(234,179,8,0.30); color: #fde68a; }
  .wa-pill.fail { background: rgba(239,68,68,0.10); border-color: rgba(239,68,68,0.30); color: #fecaca; }

  .wa-section-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin: 22px 4px 12px;
    gap: 12px;
  }
  .wa-section-head h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 15px; letter-spacing: .04em; text-transform: uppercase;
    color: var(--text);
  }
  .wa-section-sub { color: var(--muted); font-size: 12px; }

  .wa-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }

  .wa-card {
    background: linear-gradient(180deg, var(--surf2) 0%, var(--surf) 100%);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 16px;
    transition: border-color .2s ease, transform .2s ease, box-shadow .2s ease;
    position: relative;
  }
  .wa-card:hover { border-color: rgba(255,255,255,0.12); }
  .wa-card.db    { border-color: var(--border-em); box-shadow: 0 0 0 1px rgba(0,229,160,0.10), 0 10px 30px rgba(0,229,160,0.06); }
  .wa-card.env   { border-color: rgba(96,165,250,0.30); }
  .wa-card.unset { border-color: rgba(239,68,68,0.30); }

  .wa-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
  .wa-card-title { font-weight: 700; color: var(--text); font-size: 14px; line-height: 1.3; }
  .wa-card-key   { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--muted); margin-top: 2px; }
  .wa-card-desc  { font-size: 12px; color: var(--soft); line-height: 1.55; margin: 10px 0 12px; }

  .wa-card-value {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; color: var(--em);
    background: rgba(0,229,160,0.05);
    border: 1px solid rgba(0,229,160,0.18);
    padding: 8px 10px;
    border-radius: 8px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .wa-card-value.env  { color: #93c5fd; background: rgba(96,165,250,0.06); border-color: rgba(96,165,250,0.20); }
  .wa-card-value.empty { color: #fca5a5; background: rgba(239,68,68,0.05); border-color: rgba(239,68,68,0.20); }

  .wa-source { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
  .wa-source.db    { background: rgba(0,229,160,0.12);  color: var(--em); }
  .wa-source.env   { background: rgba(96,165,250,0.14); color: #93c5fd; }
  .wa-source.unset { background: rgba(239,68,68,0.12);  color: #fca5a5; }

  .wa-edit { display: flex; gap: 8px; margin-top: 12px; }
  .wa-edit input {
    flex: 1; min-width: 0;
    background: rgba(0,0,0,0.30);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 10px;
    color: var(--text);
    font-size: 13px;
    outline: none;
    transition: border-color .15s ease, background .15s ease;
  }
  .wa-edit input:focus { border-color: var(--em); background: rgba(0,0,0,0.45); }
  .wa-edit input::placeholder { color: var(--muted); }
  .wa-edit-btn {
    background: linear-gradient(180deg, var(--em) 0%, var(--em2) 100%);
    color: #00120a; font-weight: 700;
    border: 0; border-radius: 8px;
    padding: 0 14px;
    cursor: pointer;
    transition: filter .15s ease, transform .15s ease;
  }
  .wa-edit-btn:disabled { filter: grayscale(.6) brightness(.7); cursor: not-allowed; }
  .wa-edit-btn:not(:disabled):hover { filter: brightness(1.08); }

  .wa-card-meta { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 10px; color: var(--muted); margin-top: 8px; }

  /* Toast / banner */
  .wa-banner { padding: 12px 14px; border-radius: var(--r-md); margin-bottom: 14px; font-size: 13px; }
  .wa-banner.err { background: rgba(239,68,68,0.08);  border: 1px solid rgba(239,68,68,0.30); color: #fecaca; }
  .wa-banner.ok  { background: rgba(34,197,94,0.08);  border: 1px solid rgba(34,197,94,0.30); color: #bbf7d0; }

  /* OpenAI keys section */
  .wa-add-card {
    background: linear-gradient(180deg, var(--surf2), var(--surf));
    border: 1px dashed rgba(0,229,160,0.35);
    border-radius: var(--r-md);
    padding: 16px;
    margin-bottom: 14px;
  }
  .wa-add-grid { display: grid; grid-template-columns: minmax(120px, 1fr) 2fr auto auto; gap: 10px; align-items: center; }
  @media (max-width: 720px) { .wa-add-grid { grid-template-columns: 1fr; } }
  .wa-add-grid input {
    background: rgba(0,0,0,0.30); border: 1px solid var(--border); border-radius: 8px;
    padding: 9px 10px; color: var(--text); font-size: 13px; outline: none;
  }
  .wa-add-grid input:focus { border-color: var(--em); }

  .wa-key-row {
    display: grid;
    grid-template-columns: 36px 1.2fr 1.4fr 1fr auto;
    gap: 12px; align-items: center;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surf2);
    margin-bottom: 8px;
    transition: border-color .2s ease;
  }
  .wa-key-row:hover { border-color: rgba(255,255,255,0.12); }
  .wa-key-row.inactive { opacity: 0.55; }
  @media (max-width: 880px) { .wa-key-row { grid-template-columns: 1fr; } }

  .wa-key-rank { font-family: var(--font-display); font-size: 20px; color: var(--em); text-align: center; }
  .wa-key-label { font-weight: 700; color: var(--text); }
  .wa-key-secret { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--em); }
  .wa-key-health { font-size: 12px; color: var(--soft); }
  .wa-key-health b { color: #bbf7d0; }
  .wa-key-health .fail { color: #fca5a5; }
  .wa-key-actions { display: flex; gap: 6px; }
  .wa-icon-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--soft);
    width: 32px; height: 32px;
    border-radius: 8px;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: all .15s ease;
    font-size: 14px;
  }
  .wa-icon-btn:hover { color: var(--text); border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); }
  .wa-icon-btn.danger:hover { color: #fca5a5; border-color: rgba(239,68,68,0.40); background: rgba(239,68,68,0.10); }
  .wa-icon-btn.toggle.active { color: var(--em); border-color: var(--border-em); background: rgba(0,229,160,0.10); }
`;

function sourceBadge(source) {
  if (source === 'db') return <span className="wa-source db">DB · editable</span>;
  if (source === 'env') return <span className="wa-source env">Vercel env</span>;
  return <span className="wa-source unset">NOT SET</span>;
}

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function WhatsAppSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // OpenAI fallback keys
  const [oaKeys, setOaKeys] = useState([]);
  const [oaLoading, setOaLoading] = useState(false);
  const [oaError, setOaError] = useState('');
  const [oaInfo, setOaInfo] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyOrder, setNewKeyOrder] = useState('10');
  const [adding, setAdding] = useState(false);

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

  const loadKeys = useCallback(async () => {
    setOaLoading(true);
    setOaError('');
    try {
      const res = await apiCall('/api/admin/openai-keys');
      setOaKeys(res.keys || []);
    } catch (e) {
      setOaKeys([]);
      setOaError(e?.message || 'Could not load OpenAI keys');
    } finally {
      setOaLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadKeys();
  }, [load, loadKeys]);

  const byKey = useMemo(() => new Map(settings.map((s) => [s.key, s])), [settings]);
  const metaRows = useMemo(() => META_KEYS.filter((k) => byKey.has(k)).map((k) => byKey.get(k)), [byKey]);
  const openaiRows = useMemo(() => OPENAI_KEYS.filter((k) => byKey.has(k)).map((k) => byKey.get(k)), [byKey]);

  // Status pills row
  const pills = useMemo(() => {
    const verifyOk = byKey.get('META_WABA_VERIFY_TOKEN')?.has_value;
    const tokenOk = byKey.get('META_WABA_ACCESS_TOKEN')?.has_value;
    const phoneOk = byKey.get('META_WABA_PHONE_NUMBER_ID')?.has_value;
    const appSecretOk = byKey.get('META_WABA_APP_SECRET')?.has_value;
    const skipSig = String(byKey.get('META_WABA_WEBHOOK_SKIP_SIGNATURE')?.value_masked || '').toLowerCase() === 'true';
    const openaiEnvOrPlatform = byKey.get('OPENAI_API_KEY')?.has_value;
    const openaiFallback = oaKeys.filter((k) => k.is_active).length > 0;
    return [
      { label: 'Verify token', state: verifyOk ? 'ok' : 'fail' },
      { label: 'Access token', state: tokenOk ? 'ok' : 'fail' },
      { label: 'Phone number ID', state: phoneOk ? 'ok' : 'fail' },
      { label: appSecretOk ? 'App secret (HMAC verified)' : (skipSig ? 'HMAC skipped' : 'App secret missing'), state: appSecretOk ? 'ok' : (skipSig ? 'warn' : 'fail') },
      { label: openaiEnvOrPlatform ? 'OpenAI primary key' : 'OpenAI primary missing', state: openaiEnvOrPlatform ? 'ok' : 'fail' },
      { label: openaiFallback ? `${oaKeys.filter(k => k.is_active).length} OpenAI fallback` : 'No fallback keys', state: openaiFallback ? 'ok' : 'warn' },
    ];
  }, [byKey, oaKeys]);

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  const save = async (key) => {
    const value = drafts[key] || '';
    if (!value) { setError(`Enter a value for ${key} before saving.`); return; }
    setSavingKey(key);
    setError(''); setInfo('');
    try {
      const sess = JSON.parse(sessionStorage.getItem('omnira_admin_session') || '{}');
      const res = await apiCall(`/api/admin/platform-settings/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: JSON.stringify({ value, updated_by: sess.user?.email || 'admin' }),
      });
      setSettings((all) => all.map((s) =>
        s.key === key
          ? { ...s, has_value: res.has_value, value_masked: res.value_masked, source: 'db', updated_at: res.updated_at, updated_by: res.updated_by }
          : s
      ));
      setDrafts((d) => ({ ...d, [key]: '' }));
      setInfo(`${key} saved. Live in ~30 s.`);
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSavingKey('');
    }
  };

  // OpenAI fallback CRUD
  const addKey = async () => {
    if (!newKeyValue.trim()) { setOaError('Paste an OpenAI key first'); return; }
    setAdding(true); setOaError(''); setOaInfo('');
    try {
      const sess = JSON.parse(sessionStorage.getItem('omnira_admin_session') || '{}');
      await apiCall('/api/admin/openai-keys', {
        method: 'POST',
        body: JSON.stringify({
          label: newKeyLabel.trim() || null,
          api_key: newKeyValue.trim(),
          sort_order: Number(newKeyOrder) || 0,
          created_by: sess.user?.email || 'admin',
        }),
      });
      setNewKeyLabel(''); setNewKeyValue(''); setNewKeyOrder('10');
      setOaInfo('Fallback key added.');
      await loadKeys();
    } catch (e) {
      setOaError(e?.message || 'Could not add key');
    } finally {
      setAdding(false);
    }
  };

  const toggleKey = async (k) => {
    try {
      await apiCall(`/api/admin/openai-keys/${k.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !k.is_active }),
      });
      await loadKeys();
    } catch (e) {
      setOaError(e?.message || 'Toggle failed');
    }
  };

  const removeKey = async (k) => {
    if (!window.confirm(`Delete OpenAI key${k.label ? ` "${k.label}"` : ''}? Cannot be undone.`)) return;
    try {
      await apiCall(`/api/admin/openai-keys/${k.id}`, { method: 'DELETE' });
      await loadKeys();
    } catch (e) {
      setOaError(e?.message || 'Delete failed');
    }
  };

  const renderCard = (s) => {
    const meta = KEY_META[s.key] || { label: s.key, placeholder: '' };
    const isSaving = savingKey === s.key;
    const valueClass = s.source === 'db' ? '' : s.source === 'env' ? 'env' : 'empty';
    return (
      <div key={s.key} className={`wa-card ${s.source}`}>
        <div className="wa-card-head">
          <div style={{ minWidth: 0 }}>
            <div className="wa-card-title">{meta.label}</div>
            <div className="wa-card-key">{s.key}</div>
          </div>
          {sourceBadge(s.source)}
        </div>
        {s.description ? <div className="wa-card-desc">{s.description}</div> : null}
        <div className={`wa-card-value ${valueClass}`} title={s.value_masked || 'NOT SET'}>
          {s.has_value ? s.value_masked : 'NOT SET'}
        </div>
        <div className="wa-edit">
          <input
            type={s.is_secret ? 'password' : 'text'}
            value={drafts[s.key] || ''}
            onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
            placeholder={meta.placeholder}
            autoComplete="off"
          />
          <button
            type="button"
            className="wa-edit-btn"
            onClick={() => save(s.key)}
            disabled={isSaving || !drafts[s.key]}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="wa-card-meta">
          {s.updated_at ? `${formatRelative(s.updated_at)}${s.updated_by ? ` · ${s.updated_by}` : ''}` : 'never edited from admin'}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{STYLES}</style>

      <header className="adm-page-head">
        <h1>WhatsApp · platform configuration</h1>
        <p>
          Every Meta + OpenAI runtime variable in one place. Resolution order at runtime:{' '}
          <code>Vercel env → platform_settings (DB) → OpenAI fallback chain</code>. On 401 / 429 /
          quota errors the webhook automatically rotates to the next OpenAI key.
        </p>
      </header>

      {/* Webhook + status hero */}
      <section className="wa-hero">
        <h2 className="wa-hero-title">
          <span className="wa-dot" /> Webhook callback URL
        </h2>
        <p className="wa-hero-sub">
          Paste this in Meta App Dashboard → <strong>WhatsApp</strong> → Configuration → Callback URL.
          The Verify token must match <code>META_WABA_VERIFY_TOKEN</code> below. After saving, scroll
          down and click <strong>Subscribe</strong> on the <code>messages</code> field.
        </p>
        <div className="wa-url-row">
          <input className="wa-url-input" readOnly value={webhookUrl} />
          <button
            type="button"
            className={`wa-copy-btn ${copied ? 'copied' : ''}`}
            onClick={copyWebhook}
            disabled={!webhookUrl}
          >
            {copied ? '✓ Copied' : 'Copy URL'}
          </button>
        </div>
        <div className="wa-status-pills">
          {pills.map((p) => (
            <span key={p.label} className={`wa-pill ${p.state}`}>
              {p.state === 'ok' ? '●' : p.state === 'warn' ? '◐' : '○'} {p.label}
            </span>
          ))}
        </div>
      </section>

      {error ? <div className="wa-banner err"><strong>Error:</strong> {error}</div> : null}
      {info ? <div className="wa-banner ok"><strong>OK:</strong> {info}</div> : null}

      {/* Meta credentials grid */}
      <div className="wa-section-head">
        <h2>Meta Cloud API credentials</h2>
        <span className="wa-section-sub">
          {loading ? 'Loading…' : `${metaRows.length} variables · ${metaRows.filter(s=>s.has_value).length} set`}
        </span>
      </div>
      <div className="wa-grid">
        {metaRows.map(renderCard)}
      </div>

      {/* OpenAI primary + model */}
      <div className="wa-section-head">
        <h2>OpenAI · primary key + model</h2>
        <span className="wa-section-sub">Vercel env wins unless you paste a value here</span>
      </div>
      <div className="wa-grid">
        {openaiRows.map(renderCard)}
      </div>

      {/* OpenAI fallback chain */}
      <div className="wa-section-head">
        <h2>OpenAI · fallback chain</h2>
        <span className="wa-section-sub">
          {oaKeys.length} key{oaKeys.length === 1 ? '' : 's'} ·
          {' '}
          {oaKeys.filter((k) => k.is_active).length} active
        </span>
      </div>

      {oaError ? <div className="wa-banner err"><strong>Error:</strong> {oaError}</div> : null}
      {oaInfo ? <div className="wa-banner ok"><strong>OK:</strong> {oaInfo}</div> : null}

      <div className="wa-add-card">
        <div style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 10 }}>
          Add a fallback OpenAI key. When the primary key hits <strong>401</strong>, <strong>429</strong> or
          quota error, the webhook auto-retries with the next active key in this list (lowest{' '}
          <code>sort_order</code> first).
        </div>
        <div className="wa-add-grid">
          <input
            placeholder="Label (optional)"
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
          />
          <input
            type="password"
            placeholder="sk-… paste new OpenAI key"
            value={newKeyValue}
            onChange={(e) => setNewKeyValue(e.target.value)}
            autoComplete="off"
          />
          <input
            type="number"
            placeholder="order"
            value={newKeyOrder}
            onChange={(e) => setNewKeyOrder(e.target.value)}
            style={{ width: 90 }}
          />
          <button
            type="button"
            className="wa-edit-btn"
            onClick={addKey}
            disabled={adding || !newKeyValue.trim()}
          >
            {adding ? 'Adding…' : '+ Add'}
          </button>
        </div>
      </div>

      <div>
        {oaKeys.length === 0 && !oaLoading ? (
          <div style={{ color: 'var(--muted)', padding: 14, textAlign: 'center' }}>
            No fallback keys yet. Add one above to enable automatic key rotation on quota errors.
          </div>
        ) : null}
        {oaKeys.map((k, idx) => (
          <div key={k.id} className={`wa-key-row ${k.is_active ? '' : 'inactive'}`}>
            <div className="wa-key-rank">#{idx + 1}</div>
            <div>
              <div className="wa-key-label">{k.label || 'Unnamed key'}</div>
              <div className="wa-key-secret">{k.api_key_masked || '••••'}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                order {k.sort_order} · added {formatRelative(k.created_at)}
              </div>
            </div>
            <div className="wa-key-health">
              <div><b>{k.success_count}</b> success · <span className={k.fail_count ? 'fail' : ''}>{k.fail_count}</span> fail</div>
              <div style={{ marginTop: 2, color: 'var(--muted)' }}>
                last used {formatRelative(k.last_used_at)}
              </div>
              {k.last_failed_at ? (
                <div className="fail" style={{ marginTop: 2 }}>
                  failed {formatRelative(k.last_failed_at)}{k.last_fail_reason ? ` · ${String(k.last_fail_reason).slice(0, 60)}` : ''}
                </div>
              ) : null}
            </div>
            <div className="wa-key-actions">
              <button
                type="button"
                className={`wa-icon-btn toggle ${k.is_active ? 'active' : ''}`}
                title={k.is_active ? 'Disable' : 'Enable'}
                onClick={() => toggleKey(k)}
              >
                {k.is_active ? '●' : '○'}
              </button>
              <button
                type="button"
                className="wa-icon-btn danger"
                title="Delete key"
                onClick={() => removeKey(k)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
