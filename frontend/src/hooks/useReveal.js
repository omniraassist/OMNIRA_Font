import { useEffect } from 'react';

/**
 * Adds the `.visible` class to anything tagged .reveal / .reveal-left /
 * .reveal-right as it enters the viewport, for the desktop entrance
 * animation. On phones the CSS short-circuits this — content is already
 * visible at first paint — so this hook only does meaningful work on
 * larger screens. We still eagerly reveal above-the-fold elements
 * synchronously so the hero never depends on observer timing.
 */
export function useReveal() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const SELECTOR = '.reveal, .reveal-left, .reveal-right';
    const els = Array.from(document.querySelectorAll(SELECTOR));
    if (!els.length) return undefined;

    const reveal = (el) => el.classList.add('visible');

    // Above-the-fold elements get revealed synchronously so the first
    // paint never depends on an observer round-trip.
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const buffer = Math.max(vh * 0.2, 120);
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < vh + buffer && rect.bottom > -buffer) reveal(el);
    });

    // Watch everything else with IntersectionObserver. If the API is
    // missing (very old browser), just reveal them all — preferable to
    // leaving content invisible.
    if (!('IntersectionObserver' in window)) {
      els.forEach(reveal);
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            reveal(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.04, rootMargin: '0px 0px 200px 0px' }
    );
    els.forEach((el) => {
      if (!el.classList.contains('visible')) io.observe(el);
    });

    return () => io.disconnect();
  }, []);
}
