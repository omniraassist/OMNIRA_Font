import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';

const SECTIONS = [
  {
    key: 'system_prompt',
    title: 'System prompt',
    hint: 'The core instructions injected at the top of every WhatsApp turn. Tone, language rules, what the agent must/must not do.',
    rows: 16,
    max: 16000,
  },
  {
    key: 'knowledge_base',
    title: 'Knowledge base',
    hint: 'Facts the agent quotes as source-of-truth: services, prices, policies, FAQs, opening hours. Appended after the system prompt under a heading.',
    rows: 16,
    max: 32000,
  },
  {
    key: 'greeting',
    title: 'Default greeting (optional)',
    hint: 'Optional opening message. Not auto-sent yet — reserved for future "first contact" flow.',
    rows: 3,
    max: 2000,
  },
  {
    key: 'lead_extraction_prompt',
    title: 'Lead extractor (JSON mode)',
    hint: 'Second OpenAI call that pulls structured lead JSON from each conversation. Output must remain a single JSON object.',
    rows: 14,
    max: 8000,
  },
];

export function BotConfigPage() {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('/api/admin/bot-config');
      const c = res.config || {};
      setConfig(c);
      setDraft({
        system_prompt: c.system_prompt || '',
        knowledge_base: c.knowledge_base || '',
        greeting: c.greeting || '',
        lead_extraction_prompt: c.lead_extraction_prompt || '',
        is_active: c.is_active !== false,
      });
    } catch (e) {
      setError(e?.message || 'Could not load bot config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const sess = JSON.parse(sessionStorage.getItem('omnira_admin_session') || '{}');
      const updatedBy = sess.user?.email || 'admin';
      const res = await apiCall('/api/admin/bot-config', {
        method: 'PATCH',
        body: JSON.stringify({ ...draft, updated_by: updatedBy }),
      });
      setConfig(res.config);
      setInfo('Saved. The WhatsApp agent will use the new prompt + knowledge base within ~30 seconds (cache TTL).');
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="adm-page-head">
        <h1>Bot brain</h1>
        <p>
          Live prompt engineering for the Omnira WhatsApp agent. The system prompt, knowledge base, and the
          lead-extraction prompt all live in <code>bot_configs</code>. No redeploy needed — the webhook reloads from
          this row on a 30-second cache. The hardcoded prompts have been removed from the source.
        </p>
      </header>

      <div className="adm-toolbar">
        <button type="button" className="adm-btn adm-btn-ghost" onClick={load} disabled={loading || saving}>
          {loading ? 'Loading…' : 'Reload'}
        </button>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--soft)', fontSize: 13, marginLeft: 8 }}
        >
          <input
            type="checkbox"
            checked={!!draft.is_active}
            onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
          />
          Active (uncheck = agent falls back to minimal built-in prompt)
        </label>
        <span className="adm-mono" style={{ color: 'var(--muted)', marginLeft: 'auto' }}>
          {config?.updated_at ? `Last updated: ${new Date(config.updated_at).toLocaleString()}` : ''}
          {config?.updated_by ? ` · by ${config.updated_by}` : ''}
        </span>
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

      {SECTIONS.map((s) => (
        <section className="adm-card" key={s.key} style={{ marginBottom: 16 }}>
          <h2 className="adm-card-title">{s.title}</h2>
          <p className="adm-field-hint" style={{ marginBottom: 12 }}>{s.hint}</p>
          <textarea
            rows={s.rows}
            value={draft[s.key] || ''}
            onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value.slice(0, s.max) }))}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              padding: 12,
              color: 'inherit',
              fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 13,
              lineHeight: 1.55,
              resize: 'vertical',
            }}
            spellCheck={false}
          />
          <div className="adm-mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            {(draft[s.key] || '').length} / {s.max.toLocaleString()} chars
          </div>
        </section>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="adm-btn adm-btn-ghost"
          onClick={load}
          disabled={loading || saving}
        >
          Discard changes
        </button>
        <button type="button" className="adm-btn adm-btn-primary" onClick={save} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save & activate'}
        </button>
      </div>
    </>
  );
}
