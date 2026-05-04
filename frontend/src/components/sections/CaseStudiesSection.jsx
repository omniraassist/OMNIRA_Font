import { useState } from 'react';

const CASES = [
  {
    img: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=600&h=400&fit=crop',
    icon: 'fa-solid fa-tooth',
    label: 'Clínica Dental',
    title: '+38 citas nuevas\nal mes',
    quote: '"La agenda se llena sola. Los pacientes reservan a cualquier hora sin llamarme."',
  },
  {
    img: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=600&h=400&fit=crop',
    icon: 'fa-solid fa-spa',
    label: 'Centro Estética',
    title: '10h ahorradas\ncada semana',
    quote: '"Antes respondía mensajes todo el día. Ahora me dedico completamente a mis clientes."',
  },
  {
    img: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&h=400&fit=crop',
    icon: 'fa-solid fa-person-running',
    label: 'Fisioterapia',
    title: '-85% en no\npresentaciones',
    quote: '"Los recordatorios automáticos han reducido las cancelaciones a casi cero."',
  },
];

export function CaseStudiesSection() {
  const [hover, setHover] = useState(null);
  return (
    <section className="section" style={{ background: 'var(--ink)', overflow: 'hidden', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: '600px',
          height: '400px',
          background: 'radial-gradient(ellipse,rgba(0,229,160,0.04),transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="section-header reveal">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> Resultados reales
          </div>
          <h2>Casos de éxito reales</h2>
          <p>Negocios como el tuyo ya están llenando su agenda con Omnira cada día.</p>
        </div>
        <div className="reveal case-studies-grid">
          {CASES.map((c, i) => (
            <div
              key={c.label}
              className="glass"
              style={{
                borderRadius: 'var(--r-xl)',
                overflow: 'hidden',
                transition: 'var(--transition)',
                transform: hover === i ? 'translateY(-6px)' : 'none',
              }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <img src={c.img} alt={c.label} loading="lazy" style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <i className={c.icon} style={{ color: 'var(--em)', fontSize: '16px' }} />
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '.08em',
                      fontWeight: 600,
                    }}
                  >
                    {c.label}
                  </span>
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '8px', fontFamily: "'Outfit',sans-serif", whiteSpace: 'pre-line' }}>
                  {c.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7 }}>{c.quote}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
