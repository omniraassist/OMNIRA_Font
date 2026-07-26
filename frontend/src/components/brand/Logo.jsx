export function Logo({ height = 36, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 80"
      height={height}
      style={{ display: 'block' }}
      className={className}
      fill="none"
      aria-label="Omnira"
    >
      <defs>
        <filter id="omn-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="omn-glow-strong" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Dark background */}
      <rect width="240" height="80" fill="#070f09" rx="14"/>

      {/* Icon container */}
      <rect x="10" y="10" width="60" height="60" rx="15" fill="#0c1f14"/>
      <rect x="10" y="10" width="60" height="60" rx="15" stroke="#00e5a0" strokeWidth="1" fill="none" opacity="0.3"/>

      {/* Triangle outer edges */}
      <line x1="40" y1="24" x2="54" y2="48" stroke="#00e5a0" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      <line x1="54" y1="48" x2="26" y2="48" stroke="#00e5a0" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      <line x1="26" y1="48" x2="40" y2="24" stroke="#00e5a0" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>

      {/* Arms from center */}
      <line x1="40" y1="40" x2="40" y2="24" stroke="#00e5a0" strokeWidth="2" strokeLinecap="round" filter="url(#omn-glow)"/>
      <line x1="40" y1="40" x2="54" y2="48" stroke="#00e5a0" strokeWidth="2" strokeLinecap="round" filter="url(#omn-glow)"/>
      <line x1="40" y1="40" x2="26" y2="48" stroke="#00e5a0" strokeWidth="2" strokeLinecap="round" filter="url(#omn-glow)"/>

      {/* Outer nodes */}
      <circle cx="40" cy="24" r="3.5" fill="#00e5a0" filter="url(#omn-glow)"/>
      <circle cx="54" cy="48" r="3.5" fill="#00e5a0" filter="url(#omn-glow)"/>
      <circle cx="26" cy="48" r="3.5" fill="#00e5a0" filter="url(#omn-glow)"/>

      {/* Center node */}
      <circle cx="40" cy="40" r="5" fill="#00e5a0" filter="url(#omn-glow-strong)"/>
      <circle cx="40" cy="40" r="2.5" fill="#ffffff"/>

      {/* Wordmark */}
      <text
        x="84" y="50"
        fontFamily="'Inter', 'Helvetica Neue', Arial, sans-serif"
        fontSize="27"
        fontWeight="500"
        fill="#ffffff"
        letterSpacing="1"
        opacity="0.95"
      >omnira</text>
    </svg>
  );
}

export function LogoIcon({ size = 40, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 80"
      width={size}
      height={size}
      style={{ display: 'block' }}
      className={className}
      fill="none"
      aria-label="Omnira"
    >
      <defs>
        <filter id="omni-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="omni-glow-strong" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <rect width="80" height="80" fill="#070f09" rx="18"/>
      <rect width="80" height="80" fill="none" stroke="#00e5a0" strokeWidth="1.5" rx="18" opacity="0.25"/>

      <line x1="40" y1="18" x2="59" y2="52" stroke="#00e5a0" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <line x1="59" y1="52" x2="21" y2="52" stroke="#00e5a0" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <line x1="21" y1="52" x2="40" y2="18" stroke="#00e5a0" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>

      <line x1="40" y1="40" x2="40" y2="18" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round" filter="url(#omni-glow)"/>
      <line x1="40" y1="40" x2="59" y2="52" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round" filter="url(#omni-glow)"/>
      <line x1="40" y1="40" x2="21" y2="52" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round" filter="url(#omni-glow)"/>

      <circle cx="40" cy="18" r="4.5" fill="#00e5a0" filter="url(#omni-glow)"/>
      <circle cx="59" cy="52" r="4.5" fill="#00e5a0" filter="url(#omni-glow)"/>
      <circle cx="21" cy="52" r="4.5" fill="#00e5a0" filter="url(#omni-glow)"/>

      <circle cx="40" cy="40" r="7" fill="#00e5a0" filter="url(#omni-glow-strong)"/>
      <circle cx="40" cy="40" r="3.5" fill="#ffffff"/>
    </svg>
  );
}
