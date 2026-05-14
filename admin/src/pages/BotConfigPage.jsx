import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '../api/client.js';

const SECTIONS = [
  {
    key: 'system_prompt',
    title: 'Prompt del sistema',
    hint: 'Instrucciones principales inyectadas al inicio de cada turno de WhatsApp. Tono, idioma, qué debe y qué no debe hacer el agente.',
    rows: 16,
    max: 16000,
  },
  {
    key: 'knowledge_base',
    title: 'Base de conocimiento',
    hint: 'Hechos que el agente cita como fuente de verdad: servicios, precios, políticas, FAQs, horarios. Se añade tras el prompt del sistema bajo una sección con encabezado.',
    rows: 16,
    max: 32000,
  },
  {
    key: 'greeting',
    title: 'Saludo por defecto (opcional)',
    hint: 'Mensaje de apertura opcional. Aún no se envía automáticamente — reservado para el futuro flujo de "primer contacto".',
    rows: 3,
    max: 2000,
  },
  {
    key: 'lead_extraction_prompt',
    title: 'Extractor de leads (modo JSON)',
    hint: 'Segunda llamada a OpenAI que extrae un JSON estructurado de lead de cada conversación. La salida debe seguir siendo un único objeto JSON.',
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
      setError(e?.message || 'No se pudo cargar la configuración del bot');
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
      setInfo('Guardado. El agente de WhatsApp usará el nuevo prompt + base de conocimiento en ~30 segundos (TTL de caché).');
    } catch (e) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="adm-page-head">
        <h1>Cerebro del bot</h1>
        <p>
          Ingeniería de prompt en vivo para el agente de WhatsApp de Omnira. El prompt del sistema, la base de
          conocimiento y el prompt extractor de leads viven en <code>bot_configs</code>. No hace falta redeploy —
          el webhook recarga este registro con una caché de 30 segundos. Los prompts hardcodeados se han eliminado
          del código.
        </p>
      </header>

      <div className="adm-toolbar">
        <button type="button" className="adm-btn adm-btn-ghost" onClick={load} disabled={loading || saving}>
          {loading ? 'Cargando…' : 'Recargar'}
        </button>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--soft)', fontSize: 13, marginLeft: 8 }}
        >
          <input
            type="checkbox"
            checked={!!draft.is_active}
            onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
          />
          Activo (desmarcar = el agente usa el prompt mínimo integrado)
        </label>
        <span className="adm-mono" style={{ color: 'var(--muted)', marginLeft: 'auto' }}>
          {config?.updated_at ? `Última actualización: ${new Date(config.updated_at).toLocaleString('es-ES')}` : ''}
          {config?.updated_by ? ` · por ${config.updated_by}` : ''}
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
            {(draft[s.key] || '').length} / {s.max.toLocaleString('es-ES')} caracteres
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
          Descartar cambios
        </button>
        <button type="button" className="adm-btn adm-btn-primary" onClick={save} disabled={saving || loading}>
          {saving ? 'Guardando…' : 'Guardar y activar'}
        </button>
      </div>
    </>
  );
}
