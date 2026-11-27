import { useId, useMemo } from 'react';
import {
  encodeCountdownRingPng,
  encodePixelAvatarPng,
  formatLensFrame,
  resolveHudBadgeKind,
} from '@onq/core';
import type { AppBadgeKind, HudState } from '@onq/core';

interface G2LensCanvasProps {
  hudState: HudState;
  opticsMode: 'waveguide' | 'raw';
  negativeControlOverflow?: boolean;
}

const BADGE_LABELS: Record<AppBadgeKind, string> = {
  calendar_gmail: 'CAL · GMAIL',
  notion: 'NOTION',
  telegram: 'TELEGRAM',
  pc_ai_host: 'PC BRAIN',
  onq_os: 'WORKSPACE',
  coding_pr: 'GIT PR',
  career_pack: 'CAREER',
  safety_no: 'CONFIRM',
  conflict_409: '409 LOCK',
  receipt_ok: 'DONE',
  killswitch_423: 'PAUSED',
  stale_offline: 'OFFLINE',
  focus_music: 'FOCUS',
};

function bytesToDataUrl(pngBytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < pngBytes.length; i++) {
    bin += String.fromCharCode(pngBytes[i]);
  }
  return `data:image/png;base64,${btoa(bin)}`;
}

/** Crisp real monochrome-green (#34F57E) inline vector logos for Even G2 waveguide optics. */
function MonochromeAppLogo({ kind }: { kind: AppBadgeKind }) {
  const stroke = '#34f57e';
  const dim = '#1ea352';
  switch (kind) {
    case 'calendar_gmail':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <rect x="2" y="5" width="14" height="14" rx="2" stroke={stroke} strokeWidth="1.7" />
          <path d="M5 3v4M13 3v4M2 9.5h14" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
          <text x="9" y="16.5" textAnchor="middle" fill={stroke} fontSize="7" fontFamily="monospace" fontWeight="700">31</text>
          <rect x="13" y="13" width="13" height="10" rx="1.5" fill="#000" stroke={stroke} strokeWidth="1.6" />
          <path d="M14 14.5l5.5 4.2L25 14.5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'notion':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <path d="M5 6.5L18.5 4l4.5 2.5V22l-13.5 2L5 21.5V6.5z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M9.5 19V10l7 9V10" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'telegram':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <path d="M24 5L3.5 13.2l7.2 2.4L20 9.2l-6.8 8.1v5.2l3.8-3.6 4.4 2.8L24 5z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      );
    case 'pc_ai_host':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <path d="M10 3.5v9M5.5 8h9M6.8 4.8l6.4 6.4M13.2 4.8l-6.4 6.4" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
          <rect x="12" y="13" width="13.5" height="11" rx="1.8" fill="#000" stroke={stroke} strokeWidth="1.6" />
          <path d="M15.2 17l2.5 2-2.5 2M19.5 21h3.2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'coding_pr':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <circle cx="8" cy="7" r="2.5" stroke={stroke} strokeWidth="1.7" />
          <circle cx="8" cy="21" r="2.5" stroke={stroke} strokeWidth="1.7" />
          <circle cx="20" cy="21" r="2.5" stroke={stroke} strokeWidth="1.7" />
          <path d="M8 9.5v9M20 18.5v-6a4 4 0 0 0-4-4h-2.5" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
          <path d="M15.5 6.5l-2 2 2 2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'career_pack':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <rect x="3.5" y="9" width="21" height="14" rx="2" stroke={stroke} strokeWidth="1.7" />
          <path d="M10 9V6.5A1.5 1.5 0 0 1 11.5 5h5A1.5 1.5 0 0 1 18 6.5V9M3.5 15h21" stroke={stroke} strokeWidth="1.6" />
        </svg>
      );
    case 'conflict_409':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <polygon points="9,3 19,3 25,9 25,19 19,25 9,25 3,19 3,9" stroke={stroke} strokeWidth="1.8" />
          <path d="M14 9v7" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" />
          <circle cx="14" cy="19.5" r="1.2" fill={stroke} />
        </svg>
      );
    case 'receipt_ok':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <circle cx="14" cy="14" r="10.5" stroke={stroke} strokeWidth="1.7" />
          <path d="M9.5 14.5l3.2 3.2 6.3-6.7" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'killswitch_423':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <rect x="6" y="12" width="16" height="12" rx="2" stroke={stroke} strokeWidth="1.7" />
          <path d="M9.5 12V8.5a4.5 4.5 0 0 1 9 0V12" stroke={stroke} strokeWidth="1.7" />
          <circle cx="14" cy="18" r="1.6" fill={stroke} />
        </svg>
      );
    case 'focus_music':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <path d="M11 20V8l12-2v12" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="8.5" cy="20" r="2.5" stroke={stroke} strokeWidth="1.7" />
          <circle cx="20.5" cy="18" r="2.5" stroke={stroke} strokeWidth="1.7" />
        </svg>
      );
    case 'safety_no':
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <path d="M14 3l9 4v6.5c0 5.5-3.8 9.8-9 11.5-5.2-1.7-9-6-9-11.5V7l9-4z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M14 9.5v5.5M14 18.2v.4" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 28 28" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
          <rect x="2.5" y="10" width="9.5" height="7" rx="1.6" stroke={stroke} strokeWidth="1.7" />
          <rect x="16" y="10" width="9.5" height="7" rx="1.6" stroke={stroke} strokeWidth="1.7" />
          <path d="M12 13h4" stroke={dim} strokeWidth="1.7" />
        </svg>
      );
  }
}

export function G2LensCanvas({
  hudState,
  opticsMode,
  negativeControlOverflow = false,
}: G2LensCanvasProps) {
  const phosphorId = useId().replace(/:/g, '');
  const frame = useMemo(() => formatLensFrame(hudState), [hudState]);
  const liveTitleHint =
    hudState.phase === 'idle' && hudState.answerLines.length > 0
      ? hudState.answerLines.join(' ')
      : undefined;
  const badgeKind = useMemo(
    () => resolveHudBadgeKind(hudState, liveTitleHint),
    [hudState, liveTitleHint],
  );

  const orbMode =
    hudState.phase === 'armed'
      ? 'armed'
      : hudState.phase === 'listening'
        ? 'listening'
        : hudState.phase === 'meeting_live'
          ? 'speaking'
          : hudState.phase === 'conflict'
            ? 'conflict'
            : hudState.phase === 'committing'
              ? 'thinking'
              : 'idle';

  const orbSprite = useMemo(() => {
    if (hudState.phase === 'armed' && frame.ringProgress01 !== undefined) {
      return {
        url: bytesToDataUrl(encodeCountdownRingPng(frame.ringProgress01, 76)),
        label: '2.0s RING',
        alt: '2.0 second countdown undo ring',
      };
    }
    return {
      url: bytesToDataUrl(
        encodePixelAvatarPng(orbMode, {
          tick: hudState.avatarTick ?? hudState.meeting?.turns.length ?? 2,
          rmsLevel: Math.max(orbMode === 'idle' ? 0.12 : 0.42, hudState.rmsLevel),
          style: 'orb',
          size: 76,
        }),
      ),
      label:
        orbMode === 'listening'
          ? 'LISTENING'
          : orbMode === 'speaking'
            ? 'SPEAKING'
            : orbMode === 'thinking'
              ? 'SYNCING'
              : 'VOICE ORB',
      alt: 'OnQ monochrome Voice Orb',
    };
  }, [
    hudState.phase,
    hudState.rmsLevel,
    hudState.avatarTick,
    hudState.meeting?.turns.length,
    frame.ringProgress01,
    orbMode,
  ]);

  if (negativeControlOverflow) {
    // Deliberate defect injection mode used ONLY by Check 11 of verify-geometry.mjs
    return (
      <div
        data-testid="g2-lens"
        data-provenance={frame.provenanceTag}
        data-utf8-bytes={9999}
        className="g2-lens-canvas"
        style={{ fontSize: '32px', lineHeight: 1.8 }}
      >
        <div data-testid="g2-line-0">
          INTENTIONAL NEGATIVE CONTROL OVERFLOW LINE EXCEEDING 42 COLUMNS AND 576PX BOUNDS
        </div>
        <div data-testid="g2-line-1">OVERFLOW LINE 2</div>
        <div data-testid="g2-line-2">OVERFLOW LINE 3</div>
        <div data-testid="g2-line-3">OVERFLOW LINE 4</div>
      </div>
    );
  }

  const showAgentGrid =
    hudState.phase === 'idle' &&
    hudState.answerLines.length === 0 &&
    (badgeKind === 'pc_ai_host' || badgeKind === 'onq_os') &&
    (hudState.agentGrid?.length ?? 0) > 0;

  return (
    <div
      data-testid="g2-lens"
      data-phase={hudState.phase}
      data-provenance={frame.provenanceTag}
      data-utf8-bytes={frame.utf8Bytes}
      className={`g2-lens-canvas ${opticsMode === 'waveguide' ? 'g2-lens-waveguide' : 'g2-lens-raw'}`}
    >
      <svg width="0" height="0" aria-hidden="true" className="absolute pointer-events-none">
        <filter id={`g2-phosphor-${phosphorId}`} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.204 0 0 0 0  0.961 0 0 0 0  0.494 0 0 0 0  0 0 0 1 0"
          />
        </filter>
      </svg>

      <div className="flex flex-col justify-between w-full h-full min-w-0">
        {/* Top Ambient Row + Pop-up Content Zone (Meta-style minimal layout) */}
        <div className="flex items-start justify-between gap-2.5 min-w-0">
          <div className="flex flex-col flex-1 min-w-0">
            {frame.lines.map((line, idx) => (
              <div
                key={idx}
                data-testid={`g2-line-${idx}`}
                className={`whitespace-pre font-plex text-[14.5px] leading-[1.42] tracking-normal ${
                  idx === 1 && line === '' ? 'h-[6px]' : ''
                }`}
                style={
                  idx === 0
                    ? { color: '#34f57e', fontWeight: 600, opacity: 0.92 }
                    : idx === 2
                      ? { color: '#34f57e', fontWeight: 600 }
                      : { color: '#2bd46c' }
                }
              >
                {line}
              </div>
            ))}
          </div>

          {/* Right Real SVG App Logo + Living Voice Orb */}
          <div className="w-[82px] shrink-0 flex flex-col items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-col items-center gap-0.5">
              <MonochromeAppLogo kind={badgeKind} />
              <span className="font-plex text-[8px] tracking-[0.14em] uppercase text-[#1ea352] whitespace-nowrap">
                {BADGE_LABELS[badgeKind]}
              </span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <img
                src={orbSprite.url}
                width={64}
                height={64}
                alt={orbSprite.alt}
                className="shrink-0"
                style={{
                  imageRendering: 'pixelated',
                  filter:
                    opticsMode === 'waveguide'
                      ? `url(#g2-phosphor-${phosphorId}) drop-shadow(0 0 6px rgba(52, 245, 126, 0.52))`
                      : `url(#g2-phosphor-${phosphorId})`,
                }}
              />
              <span className="font-plex text-[8px] tracking-[0.16em] uppercase text-[#1ea352] whitespace-nowrap">
                {orbSprite.label}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Minimal Square-Pair Agent/Cron Strip (only on PC AI / Workspace cards) or Quiet Pager Dots */}
        <div className="flex items-center justify-between pt-1">
          {showAgentGrid && hudState.agentGrid ? (
            <div className="grid grid-cols-4 gap-1.5 flex-1 mr-3">
              {hudState.agentGrid.slice(0, 4).map((cell) => (
                <div
                  key={cell.label}
                  className="border border-[#1ea352]/40 px-1.5 py-0.5 flex items-center justify-between gap-1 text-[9px] font-plex text-[#34f57e]"
                >
                  <span className="text-[#1ea352]">{cell.label}</span>
                  <span>{cell.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {Array.from({ length: Math.min(5, Math.max(1, hudState.cards.length)) }).map((_, i) => (
                <span
                  key={i}
                  className={`inline-block rounded-full ${
                    i === hudState.selectedCardIndex
                      ? 'w-3.5 h-1.5 bg-[#34f57e]'
                      : 'w-1.5 h-1.5 bg-[#1ea352]/45'
                  }`}
                />
              ))}
            </div>
          )}
          <span className="font-plex text-[8.5px] tracking-[0.14em] uppercase text-[#1ea352]/80 whitespace-nowrap">
            OnQ
          </span>
        </div>
      </div>
    </div>
  );
}
