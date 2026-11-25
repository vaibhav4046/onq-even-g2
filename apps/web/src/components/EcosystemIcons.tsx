import type { ReactNode } from 'react';

export interface EcosystemIconProps {
  className?: string;
  theme?: 'dark' | 'light';
}

/** 16x16 crisp pixel-art Notion cube "N" SVG. */
export function NotionPixelSvg({ className = 'w-4 h-4', theme = 'dark' }: EcosystemIconProps) {
  const face = theme === 'light' ? '#ffffff' : '#f2f2f2';
  const ink = '#0a0a0a';
  const edge = theme === 'light' ? '#525252' : '#9a9a9a';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="3" y="1" width="10" height="1" fill={face} />
      <rect x="2" y="2" width="12" height="2" fill={edge} />
      <rect x="1" y="3" width="2" height="10" fill={edge} />
      <rect x="3" y="4" width="11" height="11" fill={face} />
      <rect x="3" y="4" width="11" height="1" fill={ink} />
      <rect x="3" y="14" width="11" height="1" fill={ink} />
      <rect x="3" y="4" width="1" height="11" fill={ink} />
      <rect x="13" y="4" width="1" height="11" fill={ink} />
      <rect x="5" y="6" width="2" height="6" fill={ink} />
      <rect x="7" y="7" width="1" height="2" fill={ink} />
      <rect x="8" y="8" width="1" height="2" fill={ink} />
      <rect x="9" y="9" width="1" height="2" fill={ink} />
      <rect x="10" y="6" width="2" height="6" fill={ink} />
    </svg>
  );
}

/** 16x16 4-color pixel-art Google "G" mark. */
export function GooglePixelSvg({ className = 'w-4 h-4', theme = 'dark' }: EcosystemIconProps) {
  const red = theme === 'light' ? '#0a0a0a' : '#EA4335';
  const yellow = theme === 'light' ? '#525252' : '#FBBC05';
  const green = theme === 'light' ? '#0a0a0a' : '#34A853';
  const blue = theme === 'light' ? '#0a0a0a' : '#4285F4';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Top red arc */}
      <rect x="5" y="1" width="6" height="2" fill={red} />
      <rect x="3" y="2" width="2" height="2" fill={red} />
      <rect x="11" y="2" width="2" height="2" fill={red} />
      {/* Left yellow arc */}
      <rect x="2" y="4" width="2" height="8" fill={yellow} />
      <rect x="1" y="5" width="1" height="6" fill={yellow} />
      {/* Bottom green arc */}
      <rect x="3" y="12" width="2" height="2" fill={green} />
      <rect x="5" y="13" width="6" height="2" fill={green} />
      <rect x="11" y="12" width="2" height="1" fill={green} />
      {/* Right blue bar & lower curve */}
      <rect x="8" y="7" width="7" height="2" fill={blue} />
      <rect x="12" y="9" width="3" height="3" fill={blue} />
      <rect x="10" y="11" width="3" height="2" fill={blue} />
    </svg>
  );
}

/** 16x16 pixel-art Google Calendar icon ("31"). */
export function CalendarPixelSvg({ className = 'w-4 h-4', theme = 'dark' }: EcosystemIconProps) {
  const stroke = theme === 'light' ? '#0a0a0a' : '#f2f2f2';
  const accent = theme === 'light' ? '#0a0a0a' : '#4285F4';
  const hi = theme === 'light' ? '#525252' : '#34A853';
  const bg = theme === 'light' ? '#f2f2f2' : '#0a0a0a';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" fill={bg} />
      <rect x="2" y="2" width="12" height="3" fill={accent} />
      <rect x="2" y="2" width="1" height="12" fill={stroke} />
      <rect x="13" y="2" width="1" height="12" fill={stroke} />
      <rect x="2" y="13" width="12" height="1" fill={hi} />
      <rect x="4" y="1" width="2" height="2" fill={stroke} />
      <rect x="10" y="1" width="2" height="2" fill={stroke} />
      <rect x="5" y="7" width="3" height="1" fill={stroke} />
      <rect x="6" y="8" width="2" height="1" fill={stroke} />
      <rect x="5" y="10" width="3" height="1" fill={stroke} />
      <rect x="10" y="7" width="1" height="4" fill={hi} />
    </svg>
  );
}

/** 16x16 pixel-art Gmail "M" envelope. */
export function GmailPixelSvg({ className = 'w-4 h-4', theme = 'dark' }: EcosystemIconProps) {
  const left = theme === 'light' ? '#0a0a0a' : '#4285F4';
  const right = theme === 'light' ? '#0a0a0a' : '#34A853';
  const peak = theme === 'light' ? '#525252' : '#EA4335';
  const wing = theme === 'light' ? '#525252' : '#FBBC05';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="1" y="3" width="2" height="10" fill={left} />
      <rect x="13" y="3" width="2" height="10" fill={right} />
      <rect x="2" y="3" width="2" height="2" fill={peak} />
      <rect x="12" y="3" width="2" height="2" fill={wing} />
      <rect x="4" y="5" width="2" height="2" fill={peak} />
      <rect x="10" y="5" width="2" height="2" fill={peak} />
      <rect x="6" y="7" width="4" height="2" fill={peak} />
      <rect x="3" y="12" width="10" height="1" fill="#37383a" />
    </svg>
  );
}

/** 16x16 pixel-art Google Drive triangle mark. */
export function DrivePixelSvg({ className = 'w-4 h-4', theme = 'dark' }: EcosystemIconProps) {
  const gold = theme === 'light' ? '#525252' : '#FBBC05';
  const green = theme === 'light' ? '#0a0a0a' : '#34A853';
  const blue = theme === 'light' ? '#0a0a0a' : '#4285F4';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="6" y="2" width="4" height="2" fill={gold} />
      <rect x="5" y="4" width="2" height="3" fill={green} />
      <rect x="9" y="4" width="2" height="3" fill={gold} />
      <rect x="3" y="7" width="2" height="4" fill={green} />
      <rect x="11" y="7" width="2" height="4" fill={gold} />
      <rect x="2" y="11" width="12" height="2" fill={blue} />
    </svg>
  );
}

/** 16x16 pixel-art Anthropic Claude starburst mark. */
export function ClaudePixelSvg({ className = 'w-4 h-4', theme = 'dark' }: EcosystemIconProps) {
  const c = theme === 'light' ? '#0a0a0a' : '#D97757';
  const hi = theme === 'light' ? '#525252' : '#f2f2f2';
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
      <rect x="7" y="7" width="2" height="2" fill={hi} />
    </svg>
  );
}

/** 16x16 geometric OpenAI / ChatGPT 6-petal interwoven blossom knot. */
export function ChatGptPixelSvg({ className = 'w-4 h-4', theme = 'dark' }: EcosystemIconProps) {
  const teal = theme === 'light' ? '#0a0a0a' : '#10A37F';
  const core = theme === 'light' ? '#525252' : '#f2f2f2';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Upper petals */}
      <rect x="5" y="1" width="6" height="2" fill={teal} />
      <rect x="3" y="3" width="2" height="2" fill={teal} />
      <rect x="11" y="3" width="2" height="2" fill={teal} />
      {/* Side petals */}
      <rect x="1" y="5" width="2" height="6" fill={teal} />
      <rect x="13" y="5" width="2" height="6" fill={teal} />
      {/* Inner woven knot spokes */}
      <rect x="5" y="4" width="2" height="3" fill={teal} />
      <rect x="9" y="4" width="2" height="3" fill={teal} />
      <rect x="4" y="7" width="3" height="2" fill={teal} />
      <rect x="9" y="7" width="3" height="2" fill={teal} />
      <rect x="5" y="9" width="2" height="3" fill={teal} />
      <rect x="9" y="9" width="2" height="3" fill={teal} />
      {/* Lower petals */}
      <rect x="3" y="11" width="2" height="2" fill={teal} />
      <rect x="11" y="11" width="2" height="2" fill={teal} />
      <rect x="5" y="13" width="6" height="2" fill={teal} />
      {/* Hollow hex core */}
      <rect x="7" y="7" width="2" height="2" fill={core} />
    </svg>
  );
}

/** 16x16 pixel-art OpenRouter branching route nodes glyph. */
export function OpenRouterPixelSvg({ className = 'w-4 h-4', theme = 'dark' }: EcosystemIconProps) {
  const lime = theme === 'light' ? '#0a0a0a' : '#daff52';
  const wire = theme === 'light' ? '#525252' : '#f2f2f2';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Entry node */}
      <rect x="1" y="6" width="3" height="4" fill={lime} />
      <rect x="4" y="7" width="3" height="2" fill={wire} />
      {/* Split vertical spine */}
      <rect x="7" y="3" width="2" height="10" fill={wire} />
      {/* Three routed paths */}
      <rect x="9" y="3" width="3" height="2" fill={wire} />
      <rect x="9" y="7" width="3" height="2" fill={lime} />
      <rect x="9" y="11" width="3" height="2" fill={wire} />
      {/* Target nodes */}
      <rect x="12" y="2" width="3" height="3" fill={wire} />
      <rect x="12" y="6" width="3" height="4" fill={lime} />
      <rect x="12" y="11" width="3" height="3" fill={wire} />
    </svg>
  );
}

/** 16x16 pixel-art AssemblyAI waveform mark. */
export function AssemblyAiPixelSvg({ className = 'w-4 h-4', theme = 'dark' }: EcosystemIconProps) {
  const primary = theme === 'light' ? '#0a0a0a' : '#daff52';
  const secondary = theme === 'light' ? '#525252' : '#f2f2f2';

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="1" y="6" width="2" height="4" fill={secondary} />
      <rect x="4" y="4" width="2" height="8" fill={primary} />
      <rect x="7" y="1" width="2" height="14" fill={primary} />
      <rect x="10" y="4" width="2" height="8" fill={primary} />
      <rect x="13" y="6" width="2" height="4" fill={secondary} />
    </svg>
  );
}

/** 24x14 pixel-art Even G2 optical frame mark. */
export function EvenG2PixelSvg({ className = 'w-6 h-3.5', theme = 'dark' }: EcosystemIconProps) {
  const frame = theme === 'light' ? '#0a0a0a' : '#f2f2f2';
  const beam = theme === 'light' ? '#0a0a0a' : '#daff52';

  return (
    <svg viewBox="0 0 24 14" shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="1" y="2" width="10" height="1" fill={frame} />
      <rect x="1" y="11" width="10" height="1" fill={frame} />
      <rect x="1" y="3" width="1" height="8" fill={frame} />
      <rect x="10" y="3" width="1" height="8" fill={frame} />
      <rect x="13" y="2" width="10" height="1" fill={frame} />
      <rect x="13" y="11" width="10" height="1" fill={frame} />
      <rect x="13" y="3" width="1" height="8" fill={frame} />
      <rect x="22" y="3" width="1" height="8" fill={frame} />
      <rect x="11" y="5" width="2" height="2" fill={frame} />
      <rect x="3" y="5" width="5" height="1" fill={beam} />
      <rect x="15" y="5" width="5" height="1" fill={beam} />
    </svg>
  );
}

/** 16x16 pixel-art Shield Lock mark. */
export function ShieldPixelSvg({ className = 'w-4 h-4', theme = 'dark' }: EcosystemIconProps) {
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
      <rect x="7" y="5" width="2" height="5" fill={fill} />
    </svg>
  );
}

export function EcosystemStrip() {
  const items: Array<{ label: string; icon: ReactNode }> = [
    { label: 'Google Calendar', icon: <CalendarPixelSvg className="w-3.5 h-3.5" /> },
    { label: 'Gmail', icon: <GmailPixelSvg className="w-3.5 h-3.5" /> },
    { label: 'Drive', icon: <DrivePixelSvg className="w-3.5 h-3.5" /> },
    { label: 'Notion', icon: <NotionPixelSvg className="w-3.5 h-3.5" /> },
    { label: 'Claude', icon: <ClaudePixelSvg className="w-3.5 h-3.5" /> },
    { label: 'ChatGPT', icon: <ChatGptPixelSvg className="w-3.5 h-3.5" /> },
    { label: 'OpenRouter', icon: <OpenRouterPixelSvg className="w-3.5 h-3.5" /> },
    { label: 'AssemblyAI', icon: <AssemblyAiPixelSvg className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-[11px] text-[var(--lightgray)]"
      aria-label="Supported integrations"
    >
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 hover:text-[var(--bright)] transition-colors">
          {item.icon}
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}
