import type { ReactNode } from 'react';

export interface PixelLogoProps {
  className?: string;
  theme?: 'dark' | 'light';
}

/** Crisp pixel-art Even Realities G2 optical glasses silhouette with phosphor waveguide scanlines. */
export function EvenG2Logo({ className = 'w-7 h-4', theme = 'dark' }: PixelLogoProps) {
  const frame = theme === 'light' ? '#0a0a0a' : '#f2f2f2';
  const beam = theme === 'light' ? '#0a0a0a' : '#daff52';
  const glass = theme === 'light' ? '#d4d4d4' : '#141414';

  return (
    <svg viewBox="0 0 24 14" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Left lens interior + frame */}
      <rect x="2" y="3" width="8" height="8" fill={glass} />
      <rect x="1" y="2" width="10" height="1" fill={frame} />
      <rect x="1" y="11" width="10" height="1" fill={frame} />
      <rect x="1" y="3" width="1" height="8" fill={frame} />
      <rect x="10" y="3" width="1" height="8" fill={frame} />
      {/* Right lens interior + frame */}
      <rect x="14" y="3" width="8" height="8" fill={glass} />
      <rect x="13" y="2" width="10" height="1" fill={frame} />
      <rect x="13" y="11" width="10" height="1" fill={frame} />
      <rect x="13" y="3" width="1" height="8" fill={frame} />
      <rect x="22" y="3" width="1" height="8" fill={frame} />
      {/* Nose bridge + temples */}
      <rect x="11" y="5" width="2" height="2" fill={frame} />
      <rect x="0" y="4" width="1" height="2" fill={frame} />
      <rect x="23" y="4" width="1" height="2" fill={frame} />
      {/* Phosphor waveguide scanlines inside lenses */}
      <rect x="3" y="5" width="5" height="1" fill={beam} />
      <rect x="3" y="7" width="4" height="1" fill={beam} />
      <rect x="3" y="9" width="6" height="1" fill={beam} />
      <rect x="15" y="5" width="5" height="1" fill={beam} />
      <rect x="15" y="7" width="3" height="1" fill={beam} />
      <rect x="15" y="9" width="6" height="1" fill={beam} />
    </svg>
  );
}

/** 16x16 pixel-art Google Workspace "G" mark. */
export function GoogleWorkspaceLogo({ className = 'w-4 h-4' }: PixelLogoProps) {
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Top arc (Red) */}
      <rect x="5" y="1" width="6" height="1" fill="#EA4335" />
      <rect x="3" y="2" width="10" height="1" fill="#EA4335" />
      <rect x="2" y="3" width="3" height="2" fill="#EA4335" />
      <rect x="11" y="3" width="2" height="1" fill="#EA4335" />
      {/* Left arc (Yellow) */}
      <rect x="1" y="5" width="3" height="6" fill="#FBBC05" />
      <rect x="2" y="10" width="2" height="1" fill="#FBBC05" />
      {/* Bottom arc (Green) */}
      <rect x="2" y="11" width="3" height="2" fill="#34A853" />
      <rect x="3" y="13" width="9" height="1" fill="#34A853" />
      <rect x="5" y="14" width="6" height="1" fill="#34A853" />
      {/* Right arc + crossbar (Blue) */}
      <rect x="8" y="7" width="7" height="2" fill="#4285F4" />
      <rect x="12" y="9" width="3" height="2" fill="#4285F4" />
      <rect x="11" y="11" width="3" height="2" fill="#4285F4" />
      <rect x="10" y="12" width="2" height="1" fill="#4285F4" />
    </svg>
  );
}

/** 16x16 pixel-art Google Calendar tile ("31"). */
export function GoogleCalendarLogo({ className = 'w-4 h-4' }: PixelLogoProps) {
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Center white card */}
      <rect x="4" y="4" width="8" height="8" fill="#FFFFFF" />
      {/* Outer 4-color frame */}
      <rect x="2" y="1" width="10" height="3" fill="#4285F4" />
      <rect x="1" y="2" width="3" height="10" fill="#4285F4" />
      <rect x="12" y="1" width="2" height="3" fill="#EA4335" />
      <rect x="12" y="2" width="3" height="10" fill="#EA4335" />
      <rect x="1" y="12" width="3" height="2" fill="#FBBC05" />
      <rect x="2" y="12" width="10" height="3" fill="#34A853" />
      <rect x="12" y="12" width="2" height="2" fill="#0F9D58" />
      {/* Pixel digits "31" */}
      <rect x="5" y="5" width="3" height="1" fill="#1967D2" />
      <rect x="7" y="6" width="1" height="1" fill="#1967D2" />
      <rect x="6" y="7" width="2" height="1" fill="#1967D2" />
      <rect x="7" y="8" width="1" height="2" fill="#1967D2" />
      <rect x="5" y="10" width="3" height="1" fill="#1967D2" />
      <rect x="9" y="6" width="1" height="1" fill="#1967D2" />
      <rect x="10" y="5" width="1" height="5" fill="#1967D2" />
      <rect x="9" y="10" width="3" height="1" fill="#1967D2" />
    </svg>
  );
}

/** 16x16 pixel-art Gmail "M" envelope. */
export function GmailLogo({ className = 'w-4 h-4' }: PixelLogoProps) {
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Paper body backdrop */}
      <rect x="2" y="3" width="12" height="10" fill="#F2F2F2" />
      {/* Left pillar (Blue) */}
      <rect x="1" y="4" width="3" height="9" fill="#4285F4" />
      <rect x="2" y="3" width="2" height="1" fill="#4285F4" />
      {/* Right pillar (Green) */}
      <rect x="12" y="4" width="3" height="9" fill="#34A853" />
      <rect x="12" y="3" width="2" height="1" fill="#34A853" />
      {/* Left inner fold (Red) */}
      <rect x="3" y="3" width="2" height="2" fill="#EA4335" />
      <rect x="4" y="5" width="2" height="2" fill="#EA4335" />
      <rect x="5" y="6" width="2" height="2" fill="#EA4335" />
      <rect x="6" y="7" width="2" height="2" fill="#EA4335" />
      <rect x="7" y="8" width="2" height="2" fill="#EA4335" />
      {/* Right inner diagonal (Deep Red -> Yellow corner) */}
      <rect x="8" y="7" width="2" height="2" fill="#C5221F" />
      <rect x="9" y="6" width="2" height="2" fill="#C5221F" />
      <rect x="10" y="5" width="2" height="2" fill="#FBBC05" />
      <rect x="11" y="3" width="2" height="2" fill="#FBBC05" />
    </svg>
  );
}

/** 16x16 pixel-art Google Drive tri-color ribbon. */
export function GoogleDriveLogo({ className = 'w-4 h-4' }: PixelLogoProps) {
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Left leg (Green) */}
      <rect x="6" y="2" width="3" height="2" fill="#0F9D58" />
      <rect x="5" y="4" width="3" height="2" fill="#0F9D58" />
      <rect x="4" y="6" width="3" height="2" fill="#0F9D58" />
      <rect x="3" y="8" width="3" height="2" fill="#0F9D58" />
      <rect x="2" y="10" width="3" height="3" fill="#0F9D58" />
      {/* Right leg (Yellow) */}
      <rect x="7" y="2" width="3" height="2" fill="#FBBC05" />
      <rect x="8" y="4" width="3" height="2" fill="#FBBC05" />
      <rect x="9" y="6" width="3" height="2" fill="#FBBC05" />
      <rect x="10" y="8" width="3" height="2" fill="#FBBC05" />
      <rect x="11" y="10" width="3" height="1" fill="#FBBC05" />
      {/* Bottom bar (Blue) */}
      <rect x="5" y="11" width="10" height="3" fill="#4285F4" />
      <rect x="3" y="12" width="2" height="2" fill="#4285F4" />
    </svg>
  );
}

/** 16x16 pixel-art Notion 3D cube mark. */
export function NotionLogo({ className = 'w-4 h-4', theme = 'dark' }: PixelLogoProps) {
  const face = theme === 'light' ? '#ffffff' : '#f2f2f2';
  const ink = '#0a0a0a';
  const edge = theme === 'light' ? '#525252' : '#9a9a9a';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Top 3D edge + left spine */}
      <rect x="3" y="1" width="10" height="1" fill={face} />
      <rect x="2" y="2" width="12" height="2" fill={edge} />
      <rect x="1" y="3" width="2" height="10" fill={edge} />
      {/* Main front face */}
      <rect x="3" y="4" width="11" height="11" fill={face} />
      {/* Outer pixel outline */}
      <rect x="3" y="4" width="11" height="1" fill={ink} />
      <rect x="3" y="14" width="11" height="1" fill={ink} />
      <rect x="3" y="4" width="1" height="11" fill={ink} />
      <rect x="13" y="4" width="1" height="11" fill={ink} />
      {/* Serif pixel N inside front face */}
      <rect x="5" y="6" width="2" height="6" fill={ink} />
      <rect x="7" y="7" width="1" height="2" fill={ink} />
      <rect x="8" y="8" width="1" height="2" fill={ink} />
      <rect x="9" y="9" width="1" height="2" fill={ink} />
      <rect x="10" y="6" width="2" height="6" fill={ink} />
    </svg>
  );
}

/** 16x16 pixel-art RFC 5545 .ics calendar sheet. */
export function IcsCalendarLogo({ className = 'w-4 h-4', theme = 'dark' }: PixelLogoProps) {
  const border = theme === 'light' ? '#0a0a0a' : '#f2f2f2';
  const accent = theme === 'light' ? '#0a0a0a' : '#daff52';
  const bg = theme === 'light' ? '#ffffff' : '#141414';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" fill={bg} />
      <rect x="4" y="1" width="2" height="3" fill={accent} />
      <rect x="10" y="1" width="2" height="3" fill={accent} />
      <rect x="2" y="3" width="12" height="3" fill={accent} />
      <rect x="2" y="3" width="1" height="11" fill={border} />
      <rect x="13" y="3" width="1" height="11" fill={border} />
      <rect x="2" y="13" width="12" height="1" fill={border} />
      {/* Event slots grid */}
      <rect x="4" y="7" width="2" height="2" fill={border} />
      <rect x="7" y="7" width="2" height="2" fill={accent} />
      <rect x="10" y="7" width="2" height="2" fill={border} />
      <rect x="4" y="10" width="2" height="2" fill={border} />
      <rect x="7" y="10" width="5" height="2" fill={accent} />
    </svg>
  );
}

/** 16x16 pixel-art 16kHz Local Whisper audio waveform + mic mark. */
export function WhisperLogo({ className = 'w-4 h-4', theme = 'dark' }: PixelLogoProps) {
  const accent = theme === 'light' ? '#0a0a0a' : '#daff52';
  const rail = theme === 'light' ? '#525252' : '#f2f2f2';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Mic capsule */}
      <rect x="6" y="1" width="4" height="7" fill={accent} />
      <rect x="5" y="2" width="1" height="5" fill={accent} />
      <rect x="10" y="2" width="1" height="5" fill={accent} />
      {/* Cradle + stem */}
      <rect x="4" y="6" width="1" height="3" fill={rail} />
      <rect x="11" y="6" width="1" height="3" fill={rail} />
      <rect x="5" y="9" width="6" height="1" fill={rail} />
      <rect x="7" y="10" width="2" height="3" fill={rail} />
      <rect x="5" y="13" width="6" height="2" fill={rail} />
      {/* Sound ticks */}
      <rect x="1" y="4" width="2" height="2" fill={accent} />
      <rect x="13" y="4" width="2" height="2" fill={accent} />
      <rect x="2" y="7" width="1" height="2" fill={rail} />
      <rect x="13" y="7" width="1" height="2" fill={rail} />
    </svg>
  );
}

/** 16x16 pixel-art Anthropic Claude starburst mark. */
export function ClaudeLogo({ className = 'w-4 h-4' }: PixelLogoProps) {
  const c = '#D97757';
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="7" y="1" width="2" height="14" fill={c} />
      <rect x="1" y="7" width="14" height="2" fill={c} />
      <rect x="3" y="3" width="2" height="2" fill={c} />
      <rect x="5" y="5" width="2" height="2" fill={c} />
      <rect x="9" y="9" width="2" height="2" fill={c} />
      <rect x="11" y="11" width="2" height="2" fill={c} />
      <rect x="11" y="3" width="2" height="2" fill={c} />
      <rect x="9" y="5" width="2" height="2" fill={c} />
      <rect x="5" y="9" width="2" height="2" fill={c} />
      <rect x="3" y="11" width="2" height="2" fill={c} />
    </svg>
  );
}

/** 16x16 pixel-art OpenAI / ChatGPT geometric knot mark. */
export function OpenAILogo({ className = 'w-4 h-4', theme = 'dark' }: PixelLogoProps) {
  const c = theme === 'light' ? '#0a0a0a' : '#10A37F';
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="5" y="1" width="6" height="2" fill={c} />
      <rect x="3" y="3" width="2" height="2" fill={c} />
      <rect x="11" y="3" width="2" height="2" fill={c} />
      <rect x="1" y="5" width="2" height="6" fill={c} />
      <rect x="13" y="5" width="2" height="6" fill={c} />
      <rect x="3" y="11" width="2" height="2" fill={c} />
      <rect x="11" y="11" width="2" height="2" fill={c} />
      <rect x="5" y="13" width="6" height="2" fill={c} />
      {/* Inner woven aperture */}
      <rect x="6" y="4" width="4" height="1" fill={c} />
      <rect x="5" y="5" width="1" height="6" fill={c} />
      <rect x="10" y="5" width="1" height="6" fill={c} />
      <rect x="6" y="11" width="4" height="1" fill={c} />
      <rect x="7" y="6" width="2" height="4" fill={c} />
    </svg>
  );
}

/** 16x16 pixel-art Neon Postgres cube/bolt mark. */
export function NeonPostgresLogo({ className = 'w-4 h-4', theme = 'dark' }: PixelLogoProps) {
  const c = theme === 'light' ? '#0a0a0a' : '#00E599';
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="2" y="2" width="12" height="2" fill={c} />
      <rect x="2" y="4" width="2" height="10" fill={c} />
      <rect x="2" y="12" width="6" height="2" fill={c} />
      <rect x="6" y="6" width="2" height="6" fill={c} />
      <rect x="8" y="8" width="2" height="6" fill={c} />
      <rect x="12" y="4" width="2" height="10" fill={c} />
      <rect x="10" y="12" width="4" height="2" fill={c} />
    </svg>
  );
}

/** 16x16 pixel-art Security Shield + Lock mark. */
export function ShieldLockLogo({ className = 'w-4 h-4', theme = 'dark' }: PixelLogoProps) {
  const frame = theme === 'light' ? '#0a0a0a' : '#daff52';
  const fill = theme === 'light' ? '#0a0a0a' : '#f2f2f2';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="3" y="1" width="10" height="2" fill={frame} />
      <rect x="2" y="3" width="2" height="6" fill={frame} />
      <rect x="12" y="3" width="2" height="6" fill={frame} />
      <rect x="3" y="9" width="2" height="2" fill={frame} />
      <rect x="11" y="9" width="2" height="2" fill={frame} />
      <rect x="5" y="11" width="2" height="2" fill={frame} />
      <rect x="9" y="11" width="2" height="2" fill={frame} />
      <rect x="7" y="13" width="2" height="2" fill={frame} />
      {/* Center keyhole */}
      <rect x="7" y="5" width="2" height="2" fill={fill} />
      <rect x="7" y="7" width="2" height="3" fill={fill} />
    </svg>
  );
}

interface PixelLogoChipProps {
  icon: ReactNode;
  label: string;
  theme?: 'dark' | 'light';
}

export function PixelLogoChip({ icon, label, theme = 'dark' }: PixelLogoChipProps) {
  const cls =
    theme === 'light'
      ? 'inline-flex items-center gap-2 border border-[#c4c4c4] bg-[#e8e8e8] px-2.5 py-1.5 font-pixel text-[10px] uppercase tracking-[0.14em] text-[#0a0a0a]'
      : 'inline-flex items-center gap-2 border border-[var(--hairline)] bg-[var(--surface)] px-2.5 py-1.5 font-pixel text-[10px] uppercase tracking-[0.14em] text-[var(--bright)]';
  return (
    <span className={cls}>
      {icon}
      <span>{label}</span>
    </span>
  );
}
