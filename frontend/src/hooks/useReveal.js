import { useEffect } from 'react';

/**
 * Adds the `.visible` class to anything tagged .reveal / .reveal-left /
 * .reveal-right as soon as it enters the viewport. Three safety nets layered
 * on top of the basic IntersectionObserver, because users on iOS Safari and
 * older Android Chrome were reporting the landing page going dark a second
 * after load — the observer occasionally drops its first batch of callbacks
 * when the main thread is busy parsing the JS bundle, leaving every animated
 * section permanently at opacity:0.
 *
 *   1. Reveal elements that are ALREADY inside the viewport on first paint
 *      synchronously (no observer round-trip needed).
 *   2. Run the observer for everything else.
 *   3. A 2 s timeout force-reveals anything still hidden as the last line
 *      of defence. The CSS has a matching @keyframes fallback so even
 *      without JS, content surfaces at ~1.8 s — this hook just makes sure
 *      the proper React-driven state reflects the visible markup.
 */
export function useReveal() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const SELECTOR = '.reveal, .reveal-left, .reveal-right';
    const els = Array.from(document.querySelectorAll(SELECTOR));
    if (!els.length) return undefined;

    const reveal = (el) => el.classList.add('visible');

    // (1) Immediately reveal anything already on-screen so the first viewport
    //     never depends on observer timing. Use a generous offset to catch
    //     elements that are about to scroll into view as well.
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const buffer = Math.max(vh * 0.15, 80);
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < vh + buffer && rect.bottom > -buffer) {
        reveal(el);
      }
    });

    // (2) Watch the rest with IntersectionObserver — bailout to a no-op if
    //     the API is missing (vanishingly rare today but cheap insurance).
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              reveal(e.target);
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.05, rootMargin: '0px 0px -8% 0px' }
      );
      els.forEach((el) => {
        if (!el.classList.contains('visible')) io.observe(el);
      });
    } else {
      els.forEach(reveal);
    }

    // (3) Hard timeout — if the observer hasn't fired for whatever reason
    //     after 2 s, just reveal whatever's left so the page is never stuck
    //     dark. Matches the CSS @keyframes fallback delay.
    const fallback = setTimeout(() => {
      document.querySelectorAll(SELECTOR).forEach(reveal);
    }, 2000);

    return () => {
      clearTimeout(fallback);
      if (io) io.disconnect();
    };
  }, []);
}
