import { useCallback, useEffect, useState } from 'react';
import { LogoMark } from '../brand/LogoMark.jsx';
import { usePanel } from '../../context/PanelContext.jsx';
import { apiCall } from '../../api/client.js';

const BOT_TEMPLATES = [
  {
    id: 'clinica',
    label: 'Clínica / Salud',
    icon: '🏥',
    greeting: 'Hola, soy el asistente de {nombre}. Puedo ayudarte con citas y dudas sobre nuestros servicios. ¿En qué puedo ayudarte?',
    system_prompt: 'Eres el asistente virtual de una clínica o centro de salud. Atiende a los pacientes con calidez y profesionalismo: informa sobre servicios disponibles, gestiona citas y responde dudas frecuentes. Habla siempre en el idioma del usuario. Respuestas concisas (máx. 2 párrafos). Nunca des diagnósticos médicos.',
  },
  {
    id: 'peluqueria',
    label: 'Peluquería / Estética',
    icon: '✂️',
    greeting: 'Hola, soy el asistente de {nombre}. Puedo ayudarte a reservar cita e informarte sobre nuestros servicios. ¿Qué necesitas?',
    system_prompt: 'Eres el asistente virtual de un salón de peluquería y estética. Informa sobre servicios, precios y disponibilidad, y gestiona reservas de cita. Tono amigable, cercano y entusiasta. Respuestas cortas y directas.',
  },
  {
    id: 'restaurante',
    label: 'Restaurante',
    icon: '🍽️',
    greeting: '¡Hola! Soy el asistente de {nombre}. Puedo informarte sobre nuestra carta, horarios y gestionar tu reserva. ¿En qué te ayudo?',
    system_prompt: 'Eres el asistente virtual de un restaurante. Informa sobre la carta, horarios de apertura, política de reservas y eventos especiales. Gestiona reservas de mesa recogiendo nombre, número de personas y hora. Tono cálido y acogedor.',
  },
  {
    id: 'asesoria',
    label: 'Asesoría',
    icon: '💼',
    greeting: 'Hola, soy el asistente de {nombre}. Puedo orientarte sobre nuestros servicios y ayudarte a concertar una consulta inicial. ¿En qué puedo ayudarte?',
    system_prompt: 'Eres el asistente virtual de una asesoría o consultoría profesional. Explica los servicios de forma clara y sin jerga técnica. Cualifica leads preguntando nombre, empresa y necesidad principal. Agenda consultas iniciales. Tono profesional y de confianza.',
  },
  {
    id: 'tienda',
    label: 'Tienda / Comercio',
    icon: '🛍️',
    greeting: '¡Hola! Soy el asistente de {nombre}. Te ayudo con información sobre productos, pedidos y cualquier duda. ¿En qué puedo ayudarte?',
    system_prompt: 'Eres el asistente virtual de una tienda. Responde preguntas sobre productos, precios, disponibilidad, envíos y devoluciones. Ayuda a los clientes a encontrar lo que necesitan y facilita la decisión de compra. Tono amigable y orientado a ventas.',
  },
  {
    id: 'gym',
    label: 'Gimnasio / Deporte',
    icon: '🏋️',
    greeting: '¡Hola! Soy el asistente de {nombre}. Te ayudo con información sobre clases, tarifas y reservas. ¿Qué necesitas?',
    system_prompt: 'Eres el asistente virtual de un gimnasio o centro deportivo. Informa sobre horarios de clases, precios de membresías y actividades. Gestiona reservas para clases colectivas y consultas sobre entrenamiento personal. Tono energético y motivador.',
  },
  {
    id: 'inmobiliaria',
    label: 'Inmobiliaria',
    icon: '🏠',
    greeting: 'Hola, soy el asistente de {nombre}. Puedo informarte sobre nuestras propiedades y ayudarte a concertar una visita. ¿Qué tipo de inmueble buscas?',
    system_prompt: 'Eres el asistente virtual de una inmobiliaria. Informa sobre propiedades disponibles, precios y características. Cualifica leads preguntando tipo de inmueble buscado, presupuesto y zona preferida. Agenda visitas. Tono profesional y de confianza.',
  },
  {
    id: 'personalizado',
    label: 'Personalizado',
    icon: '✏️',
    greeting: '',
    system_prompt: '',
  },
];


const STYLES = `
  .owz-screen {
    min-height: 100dvh;
    background:
      radial-gradient(60% 60% at 80% 0%, rgba(0,229,160,0.08), transparent 60%),
      radial-gradient(60% 60% at 20% 100%, rgba(96,165,250,0.06), transparent 65%);
    display: flex; flex-direction: column;
    overflow-y: auto;
  }

  /* Progress stepper */
  .owz-stepper {
    display: flex; align-items: flex-start; justify-content: center;
    gap: 0; padding: 24px 24px 20px;
  }
  .owz-snode {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    flex-shrink: 0;
  }
  .owz-scircle {
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700;
    border: 2px solid rgba(255,255,255,0.10);
    color: var(--muted, #4d6080);
    transition: all .3s ease;
    background: transparent;
  }
  .owz-snode.active .owz-scircle {
    border-color: var(--em, #00e5a0);
    background: rgba(0,229,160,0.12);
    color: var(--em, #00e5a0);
    box-shadow: 0 0 0 4px rgba(0,229,160,0.12);
  }
  .owz-snode.done .owz-scircle {
    border-color: var(--em, #00e5a0);
    background: var(--em, #00e5a0);
    color: #00120a;
  }
  .owz-slabel {
    font-size: 11px; font-weight: 600;
    color: var(--muted, #4d6080); white-space: nowrap;
    text-align: center;
  }
  .owz-snode.active .owz-slabel,
  .owz-snode.done .owz-slabel { color: var(--text, #e2eaf4); }
  .owz-sline {
    flex: 1; height: 2px; margin-bottom: 22px; min-width: 40px;
    background: rgba(255,255,255,0.08);
    transition: background .3s ease;
  }
  .owz-sline.done { background: var(--em, #00e5a0); }

  /* Card */
  .owz-main { flex: 1; padding: 0 16px 40px; }
  .owz-inner { max-width: 640px; margin: 0 auto; }
  .owz-card {
    background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
    border: 1px solid rgba(0,229,160,0.18);
    border-radius: 20px;
    padding: 28px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.35);
  }
  @media (max-width: 560px) { .owz-card { padding: 20px 16px; } }

  .owz-title {
    font-family: var(--font-display, 'Geist', sans-serif);
    font-size: 22px; color: var(--text, #e2eaf4);
    margin: 0 0 4px; line-height: 1.25;
  }
  .owz-title .em { color: var(--em, #00e5a0); }
  .owz-sub {
    color: var(--soft, #8fa3c0); font-size: 13px;
    line-height: 1.6; margin: 0 0 22px;
  }

  /* Form grid */
  .owz-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px; margin-bottom: 6px;
  }
  .owz-field { display: flex; flex-direction: column; gap: 5px; }
  .owz-field.full { grid-column: 1 / -1; }
  .owz-label {
    font-size: 11px; font-weight: 700; letter-spacing: .04em;
    text-transform: uppercase; color: var(--soft, #8fa3c0);
  }
  .owz-input, .owz-textarea {
    background: rgba(0,0,0,0.28);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px; padding: 11px 13px;
    color: var(--text, #e2eaf4); font-size: 14px;
    outline: none; transition: border-color .15s ease, background .15s ease;
    font-family: inherit; width: 100%; box-sizing: border-box;
  }
  .owz-textarea { resize: vertical; }
  .owz-input:focus, .owz-textarea:focus {
    border-color: var(--em, #00e5a0);
    background: rgba(0,0,0,0.40);
  }
  .owz-hint { font-size: 11px; color: var(--muted, #4d6080); line-height: 1.5; }

  /* Template picker */
  .owz-tmpl-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px; margin-bottom: 20px;
  }
  .owz-tmpl {
    padding: 14px 10px 12px;
    border: 1.5px solid rgba(255,255,255,0.08);
    border-radius: 12px; cursor: pointer;
    text-align: center;
    background: transparent; color: var(--text, #e2eaf4);
    font-family: inherit;
    transition: border-color .15s ease, background .15s ease;
  }
  .owz-tmpl:hover {
    border-color: rgba(0,229,160,0.35);
    background: rgba(0,229,160,0.04);
  }
  .owz-tmpl.selected {
    border-color: var(--em, #00e5a0);
    background: rgba(0,229,160,0.10);
  }
  .owz-tmpl-icon { font-size: 26px; display: block; margin-bottom: 6px; }
  .owz-tmpl-lbl { font-size: 11px; font-weight: 600; line-height: 1.3; }

  /* WA copy boxes */
  .owz-wabox {
    background: rgba(0,229,160,0.05);
    border: 1px solid rgba(0,229,160,0.22);
    border-radius: 12px; padding: 12px 14px; margin-bottom: 12px;
  }
  .owz-wabox-lbl {
    display: block; font-size: 11px; font-weight: 700;
    letter-spacing: .05em; text-transform: uppercase;
    color: var(--em, #00e5a0); margin-bottom: 7px;
  }
  .owz-warow {
    display: flex; gap: 6px;
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 9px; padding: 3px;
  }
  .owz-warow input {
    flex: 1; min-width: 0; background: transparent; border: 0;
    color: var(--em, #00e5a0); font-family: monospace; font-size: 12px;
    padding: 7px 10px; outline: none;
  }
  .owz-copy {
    background: var(--em, #00e5a0); color: #00120a; font-weight: 700;
    border: 0; border-radius: 7px; padding: 0 12px; cursor: pointer;
    font-size: 12px; transition: filter .15s ease;
  }
  .owz-copy:hover { filter: brightness(1.08); }
  .owz-copy.copied { background: #22c55e; }
  .owz-copy:disabled { filter: grayscale(.5); cursor: not-allowed; }

  /* Actions */
  .owz-actions { display: flex; gap: 10px; margin-top: 22px; align-items: center; }
  .owz-btn {
    flex: 1;
    background: linear-gradient(180deg, var(--em, #00e5a0) 0%, #00c87a 100%);
    color: #00120a; font-weight: 700; border: 0; border-radius: 12px;
    padding: 13px 20px; font-size: 15px; cursor: pointer;
    transition: filter .15s ease, transform .15s ease;
    letter-spacing: .01em;
  }
  .owz-btn:disabled { filter: grayscale(.55) brightness(.7); cursor: not-allowed; transform: none; }
  .owz-btn:not(:disabled):hover { filter: brightness(1.07); transform: translateY(-1px); }
  .owz-skip {
    background: transparent; color: var(--soft, #8fa3c0); font-size: 13px;
    border: 1px solid rgba(255,255,255,0.10); border-radius: 10px;
    padding: 13px 16px; cursor: pointer; transition: all .15s ease; white-space: nowrap;
    font-family: inherit;
  }
  .owz-skip:hover { color: var(--text, #e2eaf4); border-color: rgba(255,255,255,0.20); }

  /* Error */
  .owz-err {
    margin-top: 12px; padding: 11px 14px;
    background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.35);
    border-radius: 10px; color: #fecaca; font-size: 13px; line-height: 1.5;
  }

  /* Celebration */
  .owz-cele { text-align: center; padding: 22px 8px 8px; }
  .owz-cele-ring {
    width: 88px; height: 88px; margin: 0 auto 18px; border-radius: 50%;
    background: linear-gradient(135deg, var(--em, #00e5a0) 0%, #34d399 100%);
    display: flex; align-items: center; justify-content: center; font-size: 40px;
    box-shadow: 0 16px 36px rgba(0,229,160,0.40);
    animation: owz-pop .5s ease-out;
  }
  @keyframes owz-pop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); } }
  .owz-cele h2 {
    margin: 0 0 8px;
    font-family: var(--font-display, 'Geist', sans-serif);
    font-size: 26px; color: var(--text, #e2eaf4);
  }
  .owz-cele h2 .grad {
    background: linear-gradient(90deg, var(--em, #00e5a0) 0%, #93c5fd 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .owz-cele p {
    color: var(--soft, #8fa3c0); font-size: 14px; line-height: 1.6;
    max-width: 400px; margin: 0 auto 22px;
  }
`;

export function OnboardingWizard({ onDone }) {
  const { closeClientPanel } = usePanel();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  // Step 1 — Business info
  const [biz, setBiz] = useState({ name: '', type: '', phone: '', email: '', address: '', hours: '', services: '' });

  // Step 2 — Bot config
  const [selectedTpl, setSelectedTpl] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  // Step 3 — Show the Twilio number that was auto-assigned at payment time
  const [twilioNumber, setTwilioNumber] = useState(null);
  const [twilioLoading, setTwilioLoading] = useState(false);

  const loadTwilioNumber = useCallback(async () => {
    setTwilioLoading(true);
    try {
      const res = await apiCall('/api/customer/twilio-number');
      setTwilioNumber(res?.number || null);
    } catch { /* ignore */ }
    finally { setTwilioLoading(false); }
  }, []);

  useEffect(() => {
    if (step === 3) loadTwilioNumber();
  }, [step, loadTwilioNumber]);

  const applyTemplate = (tpl) => {
    setSelectedTpl(tpl.id);
    const name = biz.name.trim() || 'nuestro negocio';
    setGreeting(tpl.greeting.replace('{nombre}', name));
    setSystemPrompt(tpl.system_prompt);
  };

  const copyValue = async (kind, value) => {
    try { await navigator.clipboard.writeText(value); } catch { /* ignore */ }
    setCopied(kind);
    setTimeout(() => setCopied(''), 1800);
  };

  const saveStep1 = async (skip) => {
    setErr('');
    if (skip) { setStep(2); return; }
    if (!biz.name.trim()) { setStep(2); return; }
    setSaving(true);
    try {
      await apiCall('/api/customer/business', { method: 'PUT', body: JSON.stringify(biz) });
    } catch (e) {
      setErr(e?.message || 'Error guardando información');
      setSaving(false);
      return;
    }
    setSaving(false);
    setStep(2);
  };

  const saveStep2 = async (skip) => {
    setErr('');
    if (skip) { setStep(3); return; }
    if (!greeting && !systemPrompt) { setStep(3); return; }
    setSaving(true);
    try {
      await apiCall('/api/customer/bot-config', {
        method: 'PATCH',
        body: JSON.stringify({ greeting, system_prompt: systemPrompt, knowledge_base: '' }),
      });
    } catch (e) {
      setErr(e?.message || 'Error guardando configuración del bot');
      setSaving(false);
      return;
    }
    setSaving(false);
    setStep(3);
  };

  const finishWizard = () => setDone(true);

  const STEP_LABELS = ['Tu Negocio', 'Tu Bot', 'WhatsApp'];

  if (done) {
    return (
      <div className="auth-screen owz-screen">
        <style>{STYLES}</style>
        <header className="auth-header">
          <div className="auth-header-inner">
            <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
              <span className="auth-header-mini-icon"><LogoMark size={38} alt="" /></span>
              Omni<span>ra</span>
            </button>
          </div>
        </header>
        <main className="owz-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div className="owz-inner">
            <div className="owz-card owz-cele">
              <div className="owz-cele-ring">🎉</div>
              <h2>¡Todo listo{biz.name ? `, ${biz.name}` : ''}! <span className="grad">Bienvenido</span></h2>
              <p>Tu agente está configurado y listo para atender a tus clientes 24/7 en WhatsApp. Puedes ajustar todos los detalles desde el dashboard.</p>
              <button
                type="button"
                className="owz-btn"
                style={{ maxWidth: 280, margin: '0 auto', display: 'block' }}
                onClick={onDone}
              >
                Ir al dashboard →
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-screen owz-screen">
      <style>{STYLES}</style>

      {/* Header */}
      <header className="auth-header">
        <div className="auth-header-inner">
          <button type="button" className="auth-header-brand" onClick={closeClientPanel}>
            <span className="auth-header-mini-icon"><LogoMark size={38} alt="" /></span>
            Omni<span>ra</span>
          </button>
        </div>
      </header>

      {/* Progress stepper */}
      <div className="owz-stepper">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const state = step > n ? 'done' : step === n ? 'active' : '';
          return (
            <div key={label} style={{ display: 'contents' }}>
              <div className={`owz-snode ${state}`}>
                <div className="owz-scircle">{step > n ? '✓' : n}</div>
                <span className="owz-slabel">{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`owz-sline${step > n ? ' done' : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      <main className="owz-main">
        <div className="owz-inner">

          {/* ── STEP 1: Tu Negocio ── */}
          {step === 1 && (
            <div className="owz-card">
              <h1 className="owz-title">Cuéntanos sobre <span className="em">tu negocio</span></h1>
              <p className="owz-sub">El bot usará esta información para responder de forma personalizada a tus clientes.</p>
              <div className="owz-grid">
                <div className="owz-field">
                  <label className="owz-label">Nombre del negocio</label>
                  <input className="owz-input" value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} placeholder="Clínica Dental Sonrisas" />
                </div>
                <div className="owz-field">
                  <label className="owz-label">Tipo de negocio</label>
                  <input className="owz-input" value={biz.type} onChange={(e) => setBiz({ ...biz, type: e.target.value })} placeholder="Clínica dental, peluquería, restaurante…" />
                </div>
                <div className="owz-field">
                  <label className="owz-label">Teléfono</label>
                  <input className="owz-input" type="tel" value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} placeholder="+34 600 000 000" />
                </div>
                <div className="owz-field">
                  <label className="owz-label">Email de contacto</label>
                  <input className="owz-input" type="email" value={biz.email} onChange={(e) => setBiz({ ...biz, email: e.target.value })} placeholder="contacto@tu-negocio.com" />
                </div>
                <div className="owz-field full">
                  <label className="owz-label">Dirección</label>
                  <input className="owz-input" value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} placeholder="Calle Mayor 12, Madrid" />
                </div>
                <div className="owz-field full">
                  <label className="owz-label">Horario de atención</label>
                  <textarea
                    className="owz-textarea" rows={2}
                    value={biz.hours}
                    onChange={(e) => setBiz({ ...biz, hours: e.target.value })}
                    placeholder={'Lunes a Viernes: 9:00 - 20:00\nSábado: 10:00 - 14:00'}
                  />
                </div>
                <div className="owz-field full">
                  <label className="owz-label">Servicios y precios</label>
                  <textarea
                    className="owz-textarea" rows={3}
                    value={biz.services}
                    onChange={(e) => setBiz({ ...biz, services: e.target.value })}
                    placeholder={'Limpieza dental — 60€ — 30 min\nEmpaste — 80€ — 45 min'}
                  />
                </div>
              </div>
              {err ? <div className="owz-err">{err}</div> : null}
              <div className="owz-actions">
                <button type="button" className="owz-btn" disabled={saving} onClick={() => saveStep1(false)}>
                  {saving ? 'Guardando…' : 'Guardar y continuar →'}
                </button>
                <button type="button" className="owz-skip" onClick={() => saveStep1(true)}>
                  Omitir por ahora
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Tu Bot ── */}
          {step === 2 && (
            <div className="owz-card">
              <h1 className="owz-title">Personaliza tu <span className="em">agente IA</span></h1>
              <p className="owz-sub">Elige la plantilla de tu sector para configurar automáticamente el tono y estilo de respuesta.</p>
              <div className="owz-tmpl-grid">
                {BOT_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`owz-tmpl${selectedTpl === t.id ? ' selected' : ''}`}
                    onClick={() => applyTemplate(t)}
                  >
                    <span className="owz-tmpl-icon">{t.icon}</span>
                    <span className="owz-tmpl-lbl">{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="owz-grid">
                <div className="owz-field full">
                  <label className="owz-label">Mensaje de bienvenida</label>
                  <textarea
                    className="owz-textarea" rows={2}
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                    placeholder="Hola, soy el asistente virtual de tu negocio. ¿En qué puedo ayudarte?"
                  />
                </div>
                <div className="owz-field full">
                  <label className="owz-label">Instrucciones del bot (System Prompt)</label>
                  <textarea
                    className="owz-textarea" rows={5}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Eres el asistente virtual de… Ayuda a los clientes con… Tono amigable y profesional."
                  />
                </div>
              </div>
              {err ? <div className="owz-err">{err}</div> : null}
              <div className="owz-actions">
                <button
                  type="button"
                  className="owz-btn"
                  disabled={saving}
                  onClick={() => saveStep2(false)}
                >
                  {saving ? 'Guardando…' : 'Guardar y continuar →'}
                </button>
                <button type="button" className="owz-skip" onClick={() => saveStep2(true)}>
                  Omitir por ahora
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Tu número WhatsApp activo ── */}
          {step === 3 && (
            <div className="owz-card">
              <h1 className="owz-title">Tu número de <span className="em">WhatsApp</span></h1>
              <p className="owz-sub">
                Omnira te asigna automáticamente un número de WhatsApp cuando completas el pago. El bot ya está escuchando mensajes en él.
              </p>

              {twilioLoading ? (
                <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Cargando tu número…
                </div>
              ) : twilioNumber ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Number card */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(0,229,160,0.08) 0%, rgba(0,229,160,0.03) 100%)',
                    border: '1px solid rgba(0,229,160,0.28)',
                    borderRadius: 16, padding: '22px 20px',
                    display: 'flex', alignItems: 'center', gap: 16,
                  }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, var(--em) 0%, #34d399 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                    }}>
                      📱
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--em)', marginBottom: 4 }}>
                        Tu número de WhatsApp Business
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
                        {twilioNumber.phone_number}
                      </div>
                      {twilioNumber.friendly_name && (
                        <div style={{ fontSize: 12, color: 'var(--soft)', marginTop: 2 }}>{twilioNumber.friendly_name}</div>
                      )}
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--em)', fontWeight: 700 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--em)', display: 'inline-block', animation: 'owz-blink 1.6s ease-in-out infinite' }} />
                      Activo
                    </div>
                  </div>
                  <style>{`@keyframes owz-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>

                  {/* Instructions */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 18px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--soft)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      ¿Cómo probarlo?
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        `Abre WhatsApp en tu móvil`,
                        `Añade el número ${twilioNumber.phone_number} a tus contactos`,
                        `Envía un mensaje — el bot responderá en segundos`,
                      ].map((txt, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--soft)' }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--em)', flexShrink: 0 }}>
                            {i + 1}
                          </span>
                          {txt}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)',
                  borderRadius: 12, padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start',
                }}>
                  <i className="fa-solid fa-clock" style={{ color: '#fbbf24', fontSize: 18, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fde68a', marginBottom: 4 }}>Número en proceso de asignación</div>
                    <div style={{ fontSize: 13, color: 'var(--soft)', lineHeight: 1.55 }}>
                      Tu número de WhatsApp se asigna automáticamente. Si no aparece en unos minutos, contacta con soporte en{' '}
                      <strong style={{ color: 'var(--em)' }}>omniraassist@gmail.com</strong>.
                    </div>
                  </div>
                </div>
              )}

              <div className="owz-actions" style={{ marginTop: 24 }}>
                <button type="button" className="owz-btn" onClick={finishWizard}>
                  Ir al dashboard →
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
