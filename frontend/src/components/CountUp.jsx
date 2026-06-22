import { useEffect, useRef, useState } from 'react';

export function CountUp({ target, prefix = '', suffix = '', decimals = 0, duration = 1600, className = '' }) {
  const ref = useRef(null);
  const started = useRef(false);
  const startVal = decimals > 0 ? target - 1 : 0;
  const [value, setValue] = useState(startVal.toFixed(decimals));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!('IntersectionObserver' in window)) {
      setValue(target.toFixed(decimals));
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();

        const t0 = performance.now();
        const tick = (now) => {
          const progress = Math.min((now - t0) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue((startVal + (target - startVal) * eased).toFixed(decimals));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span ref={ref} className={className}>
      {prefix}{value}{suffix}
    </span>
  );
}
