import { SITE_LOGO_URL } from '../../constants/site.js';

export function LogoMark({ className = '', size = 36, alt = 'Omnira' }) {
  return (
    <img
      src={SITE_LOGO_URL}
      width={size}
      height={size}
      alt={alt}
      className={`logo-mark ${className}`.trim()}
      decoding="async"
    />
  );
}
