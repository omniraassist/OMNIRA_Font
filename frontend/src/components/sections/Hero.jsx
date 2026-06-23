import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AuroraEffect } from '../ui/AuroraEffect.jsx';

const SCRIPT = [
  { from: 'client', text: 'Hola, ¿tenéis hueco esta semana?' },
  { from: 'bot',    text: 'Hola. Claro, ¿qué servicio necesitas?' },
  { from: 'client', text: 'Limpieza facial y masaje de espalda' },
  { from: 'bot',    text: 'Tengo disponible el jueves 24 a las 17:00h. ¿Te va bien?' },
  { from: 'client', text: 'Sí, perfecto.' },
  { from: 'bot',    text: 'Cita confirmada para el jueves 24 a las 17:00h. Recibirás un recordatorio 24 horas antes.' },
];

const WORDS = [
  'clínicas',
  'estéticas',
  'fisioterapeutas',
  'peluquerías',
  'centros de salud',
];

const STATS = [
  { val: '+120', lbl: 'negocios confían', icon: 'fa-building-user' },
  { val: '<2s',  lbl: 'de respuesta',     icon: 'fa-bolt' },
  { val: '24/7', lbl: 'siempre activo',   icon: 'fa-circle-check' },
];

export function Hero() {
  const bodyRef  = useRef(null);
  const [nodes,   setNodes]   = useState([]);
  const [wordIdx, setWordIdx] = useState(0);
  const reduce = useReducedMotion();

  /* ── Rotating headline ── */
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setWordIdx(i => (i + 1) % WORDS.length), 2400);
    return () => clearInterval(id);
  }, [reduce]);

  /* ── 3-D tilt — RAF+lerp, no library dependency ── */
  const stageRef = useRef(null);
  const rafRef   = useRef(null);
  const tilt     = useRef({ tx: 0, ty: 0, cx: 0, cy: 0 });

  function runTick() {
    const t = tilt.current;
    t.cx += (t.tx - t.cx) * 0.09;
    t.cy += (t.ty - t.cy) * 0.09;
    if (stageRef.current) {
      stageRef.current.style.transform =
        `rotateX(${t.cx}deg) rotateY(${t.cy}deg)`;
    }
    if (Math.abs(t.cx - t.tx) > 0.02 || Math.abs(t.cy - t.ty) > 0.02) {
      rafRef.current = requestAnimationFrame(runTick);
    } else {
      rafRef.current = null;
    }
  }

  function kickTick() {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(runTick);
  }

  function handleMouseMove(e) {
    if (reduce) return;
    const rect = e.currentTarget.getBoundingClientRect();
    tilt.current.ty =  ((e.clientX - rect.left) / rect.width  - 0.5) * 52;
    tilt.current.tx = -((e.clientY - rect.top)  / rect.height - 0.5) * 38;
    kickTick();
  }

  function handleMouseLeave() {
    tilt.current.tx = 0;
    tilt.current.ty = 0;
    kickTick();
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  /* ── WhatsApp chat loop ── */
  useEffect(() => {
    let idx = 0, cancelled = false;
    const timers = [];

    const append = m => {
      const id = `m-${Date.now()}-${Math.random()}`;
      setNodes(p => [...p, { id, type: 'bubble', isBot: m.from === 'bot', text: m.text }]);
      requestAnimationFrame(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; });
    };

    const run = () => {
      if (cancelled) return;
      if (idx >= SCRIPT.length) {
        timers.push(setTimeout(() => { setNodes([]); idx = 0; timers.push(setTimeout(run, 1000)); }, 3500));
        return;
      }
      const m = SCRIPT[idx++];
      if (m.from === 'bot') {
        const tid = `t-${Date.now()}`;
        setNodes(p => [...p, { id: tid, type: 'typing' }]);
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        timers.push(setTimeout(() => {
          setNodes(p => p.filter(n => n.id !== tid));
          append(m);
          timers.push(setTimeout(run, 1600 + Math.random() * 400));
        }, 900));
      } else {
        append(m);
        timers.push(setTimeout(run, 900 + Math.random() * 300));
      }
    };

    timers.push(setTimeout(run, 1200));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, []);

  return (
    <section id="hero">
      {/* ── Background ── */}
      <div className="hero-bg">
        <div className="hero-bg-scrim" aria-hidden="true" />
        <AuroraEffect />
        <div className="hero-grid-pattern" aria-hidden="true" />
      </div>

      {/* ── Dot ripple (lab-bg) ── */}
      <div className="hero-dot-bg" aria-hidden="true" />

      {/* ── Floating stat pills ── */}
      <div className="hero-floaters" aria-hidden="true">
        {STATS.map(s => (
          <div key={s.val} className="hero-floater">
            <i className={`fa-solid ${s.icon}`} />
            <div className="hero-floater-text">
              <strong>{s.val}</strong>
              <span>{s.lbl}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="container">
        <div className="hero-inner">

          {/* ── LEFT: copy ── */}
          <div className="hero-copy">

            <div className="hero-badge">
              <span className="hero-badge-dot" />
              WhatsApp IA para negocios en España
              <i className="fa-solid fa-arrow-right" style={{ fontSize: '10px', opacity: 0.7 }} />
            </div>

            <h1 className="hero-title">
              <span className="hero-title-static">Tu agenda automática</span>
              <span className="hero-title-rotate" aria-live="polite" aria-atomic="true">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={wordIdx}
                    className="hero-title-word"
                    initial={reduce ? false : { opacity: 0, y: '-100%' }}
                    animate={{ opacity: 1, y: '0%' }}
                    exit={reduce ? undefined : { opacity: 0, y: '100%' }}
                    transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {WORDS[wordIdx]}
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>

            <p className="hero-subtitle">
              Omnira gestiona tus reservas por WhatsApp — responde, confirma y
              recuerda a tus clientes{' '}
              <strong>sin que levantes un dedo, las 24&nbsp;horas</strong>.
            </p>

            <div className="hero-actions">
              <a href="#cta-final" className="btn-primary btn-lg">
                <i className="fa-solid fa-rocket" />
                Solicitar demo gratis
              </a>
              <a href="#como-funciona" className="btn-ghost btn-lg">
                Ver cómo funciona
                <i className="fa-solid fa-arrow-right" />
              </a>
            </div>

            <div className="hero-proof">
              <div className="proof-avatars">
                {[
                  'photo-1438761681033-6461ffad8d80',
                  'photo-1500648767791-00dcc994a43e',
                  'photo-1494790108377-be9c29b29330',
                  'photo-1507003211169-0a1dd7228f2d',
                ].map(id => (
                  <div key={id} className="proof-avatar">
                    <img src={`https://images.unsplash.com/${id}?w=80&h=80&fit=crop&crop=face`} alt="" loading="lazy" />
                  </div>
                ))}
              </div>
              <div className="proof-text">
                <div className="proof-stars">
                  {[1, 2, 3, 4, 5].map(i => <i key={i} className="fa-solid fa-star" />)}
                </div>
                <p className="proof-label"><strong>+120 negocios</strong> ya automatizan con Omnira</p>
              </div>
            </div>

            <div className="hero-trust">
              <div className="trust-badge"><i className="fa-solid fa-shield-halved" /> Pago 100% seguro</div>
              <div className="trust-badge"><i className="fa-solid fa-clock-rotate-left" /> 14 días gratis</div>
              <div className="trust-badge"><i className="fa-solid fa-bolt" /> Activo en 30 min</div>
            </div>

          </div>

          {/* ── RIGHT: phone with dramatic 3-D tilt ── */}
          <div
            className="hero-visual"
            style={{ perspective: '800px', perspectiveOrigin: '50% 45%' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <div
              ref={stageRef}
              className="hero-stage"
              style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
            >
              <div className="hero-visual-wrap" style={{ transformStyle: 'preserve-3d' }}>
                <div className="phone-frame">
                  <div className="phone-notch">
                    <div className="phone-notch-dot" />
                    <div className="phone-notch-dot cam" />
                    <div className="phone-notch-dot" />
                  </div>
                  <div className="phone-top-bar">
                    <div className="phone-contact-avatar">
                      <i className="fa-brands fa-whatsapp" />
                    </div>
                    <div className="phone-contact-info">
                      <div className="phone-contact-name">Omnira Assistant</div>
                      <div className="phone-contact-status">En línea</div>
                    </div>
                    <div className="phone-status-icons">
                      <i className="fa-solid fa-video" />
                      <i className="fa-solid fa-phone" />
                    </div>
                  </div>
                  <div className="phone-body" ref={bodyRef}>
                    {nodes.map(n =>
                      n.type === 'typing' ? (
                        <div key={n.id} className="msg-wrap msg-enter">
                          <div className="typing-indicator">
                            <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                          </div>
                        </div>
                      ) : (
                        <div key={n.id} className={`msg-wrap msg-enter${n.isBot ? '' : ' right'}`}>
                          <div className={n.isBot ? 'msg msg-bot' : 'msg msg-client'}>{n.text}</div>
                        </div>
                      )
                    )}
                  </div>
                  <div className="phone-input-bar">
                    <div className="phone-input-field">Escribe un mensaje...</div>
                    <div className="phone-send-btn"><i className="fa-solid fa-paper-plane" /></div>
                  </div>
                </div>

                <div className="phone-live-chip" aria-hidden="true">
                  <span className="phone-live-chip-dot" />
                  Respondiendo en vivo · <strong>24/7</strong>
                </div>

                <div className="float-card float-card-1" style={{ transform: 'translateZ(80px)' }}>
                  <div className="float-icon green"><i className="fa-solid fa-calendar-check" style={{ color: 'var(--em)' }} /></div>
                  <div className="float-card-text"><strong>Cita confirmada</strong><small>Jueves 24 · 17:00h</small></div>
                </div>
                <div className="float-card float-card-2" style={{ transform: 'translateZ(110px)' }}>
                  <div className="float-icon blue"><i className="fa-solid fa-bolt" style={{ color: '#60A5FA' }} /></div>
                  <div className="float-card-text"><strong style={{ color: 'var(--em)' }}>Respuesta: 1.2s</strong><small>Automática 24/7</small></div>
                </div>
                <div className="float-card float-card-3" style={{ transform: 'translateZ(60px)' }}>
                  <div className="float-icon gold"><i className="fa-solid fa-star" style={{ color: 'var(--gold)' }} /></div>
                  <div className="float-card-text"><strong>4.9 valoración</strong><small>Media de clientes</small></div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
