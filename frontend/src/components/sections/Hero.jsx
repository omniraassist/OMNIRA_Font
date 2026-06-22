import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, useSpring, useReducedMotion } from 'framer-motion';
import { AuroraEffect } from '../ui/AuroraEffect.jsx';

const SCRIPT = [
  { from: 'client', text: 'Hola, ¿tenéis hueco esta semana?' },
  { from: 'bot', text: 'Hola. Claro, ¿qué servicio necesitas?' },
  { from: 'client', text: 'Limpieza facial y masaje de espalda' },
  { from: 'bot', text: 'Tengo disponible el jueves 24 a las 17:00h. ¿Te va bien?' },
  { from: 'client', text: 'Sí, perfecto.' },
  {
    from: 'bot',
    text: 'Cita confirmada para el jueves 24 a las 17:00h. Recibirás un recordatorio 24 horas antes.',
  },
];

export function Hero() {
  const bodyRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const reduce = useReducedMotion();

  // Mouse tracking for 3D tilt.
  // useMotionValue instead of useState: never re-renders the React tree,
  // runs entirely in the motion layer on every pointer event.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotY = useSpring(useTransform(mouseX, [-300, 300], [-10, 10]), {
    stiffness: 120,
    damping: 22,
  });
  const rotX = useSpring(useTransform(mouseY, [-300, 300], [8, -8]), {
    stiffness: 120,
    damping: 22,
  });

  function handleMouseMove(e) {
    if (reduce) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  }

  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  useEffect(() => {
    let chatIdx = 0;
    let cancelled = false;
    const timers = [];

    const appendBubble = (m) => {
      const id = `m-${Date.now()}-${Math.random()}`;
      const isBot = m.from === 'bot';
      setNodes((prev) => [...prev, { id, type: 'bubble', isBot, text: m.text }]);
      requestAnimationFrame(() => {
        const el = bodyRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    };

    const run = () => {
      if (cancelled) return;
      if (chatIdx >= SCRIPT.length) {
        timers.push(
          setTimeout(() => {
            setNodes([]);
            chatIdx = 0;
            timers.push(setTimeout(run, 1000));
          }, 3500)
        );
        return;
      }
      const m = SCRIPT[chatIdx++];
      if (m.from === 'bot') {
        const typingId = `t-${Date.now()}`;
        setNodes((prev) => [...prev, { id: typingId, type: 'typing' }]);
        const el = bodyRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        timers.push(
          setTimeout(() => {
            setNodes((prev) => prev.filter((n) => n.id !== typingId));
            appendBubble(m);
            timers.push(setTimeout(run, 1600 + Math.random() * 400));
          }, 900)
        );
      } else {
        appendBubble(m);
        timers.push(setTimeout(run, 900 + Math.random() * 300));
      }
    };

    timers.push(setTimeout(run, 1200));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <section id="hero">
      <div className="hero-bg">
        <div className="hero-bg-scrim" aria-hidden="true" />
        <AuroraEffect />
        <div className="hero-grid-pattern" aria-hidden="true" />
      </div>
      <div className="container">
        <div className="hero-inner">

          {/* ── Copy column — entrance via CSS v2-rise on each child (global_v2.css) ── */}
          <div className="hero-copy">
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              Para clínicas · Estética · Fisioterapeutas
            </div>
            <h1 className="hero-title">
              <span className="hero-title-kicker">Tu agenda inteligente</span>
              <span className="hero-title-main">
                Convierte mensajes en{' '}
                <span className="gradient-text">
                  citas{' '}
                  <span style={{ display: 'inline-block' }}>automáticas</span>
                </span>
              </span>
              <span className="hero-title-sub">Por WhatsApp, sin esfuerzo, las 24 horas.</span>
            </h1>
            <p className="hero-subtitle">
              Omnira responde a tus clientes, gestiona reservas y llena tu agenda{' '}
              <strong>24/7 sin esfuerzo</strong>, mientras tú te enfocas en lo que importa.
            </p>
            <div className="hero-kpis" aria-hidden="true">
              <div className="hero-kpi">
                <span className="hero-kpi-val">&lt;2s</span>
                <span className="hero-kpi-lbl">respuesta</span>
              </div>
              <div className="hero-kpi">
                <span className="hero-kpi-val">24/7</span>
                <span className="hero-kpi-lbl">activo</span>
              </div>
              <div className="hero-kpi">
                <span className="hero-kpi-val">+120</span>
                <span className="hero-kpi-lbl">negocios</span>
              </div>
            </div>
            <div className="hero-actions">
              <a href="#cta-final" className="btn-primary btn-lg">
                <i className="fa-solid fa-rocket" />
                Solicitar demo gratis
              </a>
              <a href="#precios" className="btn-ghost btn-lg">
                Ver precios, desde 33€/mes
              </a>
            </div>
            <div className="hero-proof">
              <div className="proof-avatars">
                <div className="proof-avatar">
                  <img
                    src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face"
                    alt=""
                    loading="lazy"
                  />
                </div>
                <div className="proof-avatar">
                  <img
                    src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face"
                    alt=""
                    loading="lazy"
                  />
                </div>
                <div className="proof-avatar">
                  <img
                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face"
                    alt=""
                    loading="lazy"
                  />
                </div>
                <div className="proof-avatar">
                  <img
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face"
                    alt=""
                    loading="lazy"
                  />
                </div>
                <div className="proof-avatar">
                  <div className="proof-avatar-fallback">+</div>
                </div>
              </div>
              <div className="proof-text">
                <div className="proof-stars">
                  <i className="fa-solid fa-star" />
                  <i className="fa-solid fa-star" />
                  <i className="fa-solid fa-star" />
                  <i className="fa-solid fa-star" />
                  <i className="fa-solid fa-star" />
                </div>
                <p className="proof-label">
                  <strong>+120 negocios</strong> ya automatizan con Omnira
                </p>
              </div>
            </div>
            <div className="hero-trust">
              <div className="trust-badge">
                <i className="fa-solid fa-shield-halved" /> Pago 100% seguro
              </div>
              <div className="trust-badge">
                <i className="fa-solid fa-clock-rotate-left" /> 14 días gratis
              </div>
              <div className="trust-badge">
                <i className="fa-solid fa-bolt" /> Activo en 30 min
              </div>
            </div>
          </div>

          {/* ── Visual column: 3D tilt stage ── */}
          {/* perspective on the parent, entrance via CSS v2-rise on .hero-visual */}
          <div
            className="hero-visual"
            style={{ perspective: '1000px' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <motion.div
              className="hero-stage"
              style={reduce ? {} : { rotateX: rotX, rotateY: rotY }}
            >
              <div className="hero-visual-wrap">
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
                  <div className="phone-body" ref={bodyRef} id="chat-body">
                    {nodes.map((n) =>
                      n.type === 'typing' ? (
                        <div key={n.id} className="msg-wrap msg-enter">
                          <div className="typing-indicator">
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                            <div className="typing-dot" />
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
                    <div className="phone-send-btn">
                      <i className="fa-solid fa-paper-plane" />
                    </div>
                  </div>
                </div>

                {/* Mobile-only live chip */}
                <div className="phone-live-chip" aria-hidden="true">
                  <span className="phone-live-chip-dot" />
                  Respondiendo en vivo · <strong>24/7</strong>
                </div>

                <div className="float-card float-card-1">
                  <div className="float-icon green">
                    <i className="fa-solid fa-calendar-check" style={{ color: 'var(--em)' }} />
                  </div>
                  <div className="float-card-text">
                    <strong>Cita confirmada</strong>
                    <small>Jueves 24 · 17:00h</small>
                  </div>
                </div>
                <div className="float-card float-card-2">
                  <div className="float-icon blue">
                    <i className="fa-solid fa-bolt" style={{ color: '#60A5FA' }} />
                  </div>
                  <div className="float-card-text">
                    <strong style={{ color: 'var(--em)' }}>Respuesta: 1.2s</strong>
                    <small>Automática 24/7</small>
                  </div>
                </div>
                <div className="float-card float-card-3">
                  <div className="float-icon gold">
                    <i className="fa-solid fa-star" style={{ color: 'var(--gold)' }} />
                  </div>
                  <div className="float-card-text">
                    <strong>4.9 valoración</strong>
                    <small>Media de clientes</small>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
