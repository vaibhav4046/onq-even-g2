interface OnQLogoProps {
  className?: string;
  showWordmark?: boolean;
  theme?: 'dark' | 'light';
}

/**
 * 100% pure inline vector brand mark for OnQ:
 * Geometric obsidian + 525nm phosphor-green waveguide aperture "O"
 * interlocked with a sharp pixel-notched "Q" ring (Even R1 / 2.0s Undo Ring geometry).
 */
export function OnQLogo({ className = 'h-7', showWordmark = true, theme = 'dark' }: OnQLogoProps) {
  const frameInk = theme === 'light' ? '#0a0a0a' : '#f2f2f2';
  const phosphor = theme === 'light' ? '#0a0a0a' : '#34F57E';
  const lime = theme === 'light' ? '#0a0a0a' : '#daff52';
  const wordColor = theme === 'light' ? 'text-[#0a0a0a]' : 'text-[var(--bright)]';

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        shapeRendering="crispEdges"
        aria-hidden="true"
        className="w-7 h-7 shrink-0"
      >
        {/* Outer waveguide square aperture */}
        <rect x="2" y="2" width="24" height="3" fill={frameInk} />
        <rect x="2" y="23" width="24" height="3" fill={frameInk} />
        <rect x="2" y="5" width="3" height="18" fill={frameInk} />
        <rect x="23" y="5" width="3" height="18" fill={frameInk} />
        {/* Inner 525nm phosphor reticle ring */}
        <rect x="9" y="9" width="10" height="2" fill={phosphor} />
        <rect x="9" y="17" width="10" height="2" fill={phosphor} />
        <rect x="9" y="11" width="2" height="6" fill={phosphor} />
        <rect x="17" y="11" width="2" height="6" fill={phosphor} />
        {/* Pixel-notched Q tail echoing the 2.0s R1 Undo Ring */}
        <rect x="19" y="19" width="4" height="4" fill={lime} />
        <rect x="23" y="23" width="4" height="4" fill={lime} />
        <rect x="26" y="26" width="4" height="4" fill={lime} />
      </svg>
      {showWordmark && (
        <span className={`font-dots text-xl font-black leading-none tracking-[0.04em] whitespace-nowrap ${wordColor}`}>
          OnQ
        </span>
      )}
    </span>
  );
}
