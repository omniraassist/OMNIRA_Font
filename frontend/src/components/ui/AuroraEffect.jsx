import { motion, useReducedMotion } from 'framer-motion';

// Four layered emerald blobs — each with its own drift path and timing.
// Opacities are deliberately very low; the effect should register as
// "alive" rather than "animated". mix-blend-mode:screen lifts brightness
// without washing out the dark background or text.
const BLOBS = [
  {
    id: 'a1',
    style: { width: 'min(75vw, 820px)', height: 'min(75vw, 820px)', top: '-22%', left: '-10%' },
    color: 'rgba(0, 229, 160, 0.16)',
    animate: { x: [0, 38, -14, 22, 0], y: [0, -28, 14, -10, 0], scale: [1, 1.06, 0.97, 1.03, 1] },
    duration: 24,
    delay: 0,
  },
  {
    id: 'a2',
    style: { width: 'min(52vw, 580px)', height: 'min(52vw, 580px)', bottom: '-18%', right: '-6%' },
    color: 'rgba(0, 185, 130, 0.10)',
    animate: { x: [0, -24, 10, 0], y: [0, 18, -12, 0], scale: [1, 0.95, 1.04, 1] },
    duration: 30,
    delay: 4,
  },
  {
    id: 'a3',
    style: { width: 'min(33vw, 380px)', height: 'min(33vw, 380px)', top: '33%', right: '13%' },
    color: 'rgba(16, 200, 160, 0.08)',
    animate: { x: [0, 16, -10, 0], y: [0, -16, 9, 0] },
    duration: 19,
    delay: 8,
  },
  {
    id: 'a4',
    style: { width: 'min(28vw, 320px)', height: 'min(28vw, 320px)', top: '8%', right: '28%' },
    color: 'rgba(0, 255, 150, 0.055)',
    animate: { x: [0, -11, 7, 0], y: [0, 13, -7, 0] },
    duration: 26,
    delay: 12,
  },
];

export function AuroraEffect() {
  const reduce = useReducedMotion();

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
      aria-hidden="true"
    >
      {BLOBS.map(({ id, style, color, animate, duration, delay }) => (
        <motion.div
          key={id}
          style={{
            position: 'absolute',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
            filter: 'blur(80px)',
            mixBlendMode: 'screen',
            willChange: 'transform',
            ...style,
          }}
          animate={reduce ? undefined : animate}
          transition={
            reduce
              ? undefined
              : { duration, delay, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      ))}
    </div>
  );
}
