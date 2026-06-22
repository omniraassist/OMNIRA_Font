import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AuroraEffect } from '../ui/AuroraEffect.jsx';

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
  const [wordIdx, setWordIdx] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setWordIdx(i => (i + 1) % WORDS.length), 2400);
    return () => clearInterval(id);
  }, [reduce]);

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

      {/* ── Floating stat pills — top right ── */}
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

      {/* ── Main content — centered column ── */}
      <div className="container">
        <div className="hero-center">

          {/* Announcement badge */}
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            WhatsApp IA para negocios en España
            <i className="fa-solid fa-arrow-right" style={{ fontSize: '10px', opacity: 0.7 }} />
          </div>

          {/* Headline: static emerald line + rotating white line */}
          <h1 className="hero-title">
            <span className="hero-title-static">Tu agenda automática</span>
            <span
              className="hero-title-rotate"
              aria-live="polite"
              aria-atomic="true"
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={wordIdx}
                  className="hero-title-word"
                  initial={reduce ? false : { opacity: 0, y: '-100%' }}
                  animate={{ opacity: 1, y: '0%' }}
                  exit={reduce ? undefined : { opacity: 0, y: '100%' }}
                  transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                >
                  {WORDS[wordIdx]}
                </motion.span>
              </AnimatePresence>
            </span>
          </h1>

          {/* Subtitle */}
          <p className="hero-subtitle">
            Omnira gestiona tus reservas por WhatsApp — responde, confirma y
            recuerda a tus clientes{' '}
            <strong>sin que levantes un dedo, las 24&nbsp;horas</strong>.
          </p>

          {/* CTAs */}
          <div className="hero-actions">
            <a href="#como-funciona" className="btn-ghost btn-lg">
              Ver cómo funciona
              <i className="fa-solid fa-arrow-right" />
            </a>
            <a href="#cta-final" className="btn-primary btn-lg">
              <i className="fa-solid fa-rocket" />
              Solicitar demo gratis
            </a>
          </div>

          {/* Social proof */}
          <div className="hero-proof">
            <div className="proof-avatars">
              {[
                'photo-1438761681033-6461ffad8d80',
                'photo-1500648767791-00dcc994a43e',
                'photo-1494790108377-be9c29b29330',
                'photo-1507003211169-0a1dd7228f2d',
              ].map(id => (
                <div key={id} className="proof-avatar">
                  <img
                    src={`https://images.unsplash.com/${id}?w=80&h=80&fit=crop&crop=face`}
                    alt=""
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
            <div className="proof-text">
              <div className="proof-stars">
                {[1, 2, 3, 4, 5].map(i => (
                  <i key={i} className="fa-solid fa-star" />
                ))}
              </div>
              <p className="proof-label">
                <strong>+120 negocios</strong> ya automatizan con Omnira
              </p>
            </div>
          </div>

          {/* Trust micro-badges */}
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
      </div>
    </section>
  );
}
