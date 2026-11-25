import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { PixelAvatarStyle, VoiceOrbState } from '@onq/core';

interface OnQVoiceOrbProps {
  state: VoiceOrbState;
  rmsLevel?: number;
  activeWord?: string;
  armProgress01?: number;
  engineLabel?: string;
  avatarStyle?: PixelAvatarStyle;
  onChangeAvatarStyle?: (style: PixelAvatarStyle) => void;
  className?: string;
}

const GRID_SIZE = 13;
const CELL = 9;
const PITCH = 12;

/**
 * Stepped Bayer 4x4 threshold matrix for crisp hardware-dithered SVG pixels (zero blurred CSS blobs).
 */
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * Monochrome 525nm phosphor-green Anime Dots / Claude Duet / ChatGPT Dots SVG Avatar synced live
 * to AssemblyAI STT-3.7 RMS, AI thinking scan, TTS-1 WordBoundaries, 2.0s Countdown Ring & 409 Lock.
 */
export function OnQVoiceOrb({
  state,
  rmsLevel = 0,
  activeWord = '',
  armProgress01 = 0,
  engineLabel = 'SANDBOX · LOCAL',
  avatarStyle,
  onChangeAvatarStyle,
  className = '',
}: OnQVoiceOrbProps) {
  const reduced = useReducedMotion();
  const [localStyle, setLocalStyle] = useState<PixelAvatarStyle>('muse');
  const style = avatarStyle ?? localStyle;

  const setStyle = (next: PixelAvatarStyle) => {
    setLocalStyle(next);
    onChangeAvatarStyle?.(next);
  };

  const pixels = useMemo(() => {
    const center = (GRID_SIZE - 1) / 2;
    const out: Array<{ x: number; y: number; dist: number; angle: number; bayer: number }> = [];
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const dx = gx - center;
        const dy = gy - center;
        const dist = Math.hypot(dx, dy);
        if (dist <= center + 0.35) {
          out.push({
            x: gx * PITCH + 16,
            y: gy * PITCH + 16,
            dist,
            angle: Math.atan2(dy, dx),
            bayer: BAYER_4X4[gy % 4][gx % 4] / 16,
          });
        }
      }
    }
    return out;
  }, []);

  // Pure 525nm monochrome phosphor-green optical hierarchy
  const palette =
    state === 'conflict'
      ? { primary: '#D4FFE4', secondary: '#34F57E', bright: '#FFFFFF', dim: '#1A7A3F', badge: '409 CONFLICT LOCK' }
      : state === 'armed'
        ? { primary: '#9BFFBE', secondary: '#34F57E', bright: '#E2FFEC', dim: '#156634', badge: 'ARMED · TAP TO CANCEL' }
        : state === 'speaking'
          ? { primary: '#7EFFAD', secondary: '#34F57E', bright: '#E2FFEC', dim: '#156634', badge: 'SPEAKING · TTS-1' }
          : state === 'thinking'
            ? { primary: '#34F57E', secondary: '#86FFAF', bright: '#D4FFE4', dim: '#0F4D28', badge: 'ROUTER THINKING' }
            : state === 'listening'
              ? { primary: '#5CFF9A', secondary: '#34F57E', bright: '#C8FFDC', dim: '#12592E', badge: 'LISTENING · 16KHZ' }
              : { primary: '#34F57E', secondary: '#1EA352', bright: '#9BFFBE', dim: '#0D4A26', badge: 'IDLE · READY' };

  const rmsBoost = Math.min(1, Math.max(0, rmsLevel * 7));
  const scaleOrb =
    reduced
      ? 1
      : state === 'listening'
        ? 1 + rmsBoost * 0.08
        : state === 'speaking'
          ? activeWord
            ? 1.05
            : 1.02
          : 1;

  const sizePx = GRID_SIZE * PITCH + 20;
  const cx = sizePx / 2;
  const cy = sizePx / 2;
  const ringCircumference = 2 * Math.PI * 82;
  const ringOffset =
    state === 'armed'
      ? ringCircumference * (1 - Math.max(0.06, Math.min(1, armProgress01)))
      : ringCircumference * 0.24;

  // Curated circular dot coordinates for swept anime hair crown, bangs, side locks & chin whisper
  const hairDots = useMemo(() => {
    const pts: Array<{ dx: number; dy: number; r: number; o: number }> = [];
    for (let deg = -156; deg <= -24; deg += 11) {
      const rad = (deg * Math.PI) / 180;
      pts.push({ dx: Math.cos(rad) * 53, dy: 2 + Math.sin(rad) * 48, r: 2.3, o: 0.62 });
    }
    for (let deg = -138; deg <= -42; deg += 18) {
      const rad = (deg * Math.PI) / 180;
      pts.push({ dx: Math.cos(rad) * 45, dy: 2 + Math.sin(rad) * 40, r: 1.8, o: 0.38 });
    }
    // Swept anime bangs dipping gently above eyes
    for (const [dx, dy, r, o] of [
      [-26, -37, 2.2, 0.58], [-22, -31, 2.0, 0.48], [-18, -25, 1.6, 0.34],
      [-5, -40, 2.4, 0.66], [-3, -33, 2.1, 0.56], [-1, -26, 1.8, 0.44], [1, -20, 1.5, 0.32],
      [20, -37, 2.2, 0.58], [22, -31, 2.0, 0.48], [24, -25, 1.6, 0.34],
    ] as const) {
      pts.push({ dx, dy, r, o });
    }
    // Framing cheek side-locks
    for (const side of [-1, 1] as const) {
      for (const [dy, xOff, r, o] of [
        [-16, 47, 2.2, 0.55],
        [-6, 48, 2.1, 0.5],
        [4, 46, 2.0, 0.46],
        [15, 43, 1.8, 0.4],
        [25, 39, 1.6, 0.32],
      ] as const) {
        pts.push({ dx: side * xOff, dy, r, o });
      }
    }
    // Delicate chin contour dots
    for (const [dx, dy, o] of [
      [-26, 38, 0.34],
      [-14, 46, 0.38],
      [0, 48, 0.44],
      [14, 46, 0.38],
      [26, 38, 0.34],
    ] as const) {
      pts.push({ dx, dy, r: 1.7, o });
    }
    return pts;
  }, []);

  const voiceEqRows = [
    [1, Math.max(1, Math.round(1 + rmsBoost * 2))],
    [2, Math.max(1, Math.round(2 + rmsBoost * 2 + (activeWord ? 1 : 0)))],
    [3, Math.max(2, Math.round(2 + rmsBoost * 2 + (state === 'speaking' ? 1 : 0)))],
    [2, Math.max(1, Math.round(2 + rmsBoost * 2 + (activeWord ? 1 : 0)))],
    [1, Math.max(1, Math.round(1 + rmsBoost * 2))],
  ];

  const gazeX = state === 'thinking' ? 2.5 : 0;
  const gazeY = state === 'thinking' ? -2 : 0;

  return (
    <div className={`retro-glass-well p-3 flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-dashed border-[#34f57e]/20">
        <span className="font-pixel text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.primary }}>
          {palette.badge}
        </span>
        <span className="font-pixel text-[9px] uppercase tracking-[0.12em] text-[var(--lightgray)]">
          {engineLabel}
        </span>
      </div>

      <div className="py-2 flex flex-col items-center justify-center relative">
        <motion.svg
          width={sizePx}
          height={sizePx}
          viewBox={`0 0 ${sizePx} ${sizePx}`}
          aria-label={`OnQ ${style} monochrome green anime dots avatar in ${state} state`}
          animate={{ scale: scaleOrb }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="w-36 h-36 sm:w-40 sm:h-40"
        >
          {/* Outer monochrome green dotted waveguide reticle / 2.0s countdown ring */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={82}
            fill="none"
            stroke={palette.primary}
            strokeWidth={state === 'armed' ? 3.5 : 2.2}
            strokeLinecap="round"
            strokeDasharray={state === 'armed' ? ringCircumference : state === 'conflict' ? '4 6' : '2.5 7.5'}
            strokeDashoffset={state === 'armed' ? ringOffset : 0}
            animate={
              reduced
                ? undefined
                : state === 'thinking'
                  ? { rotate: 360 }
                  : state === 'idle'
                    ? { opacity: [0.42, 0.85, 0.42] }
                    : { opacity: 0.92 }
            }
            transition={
              state === 'thinking'
                ? { repeat: Infinity, duration: 2.8, ease: 'linear' }
                : { repeat: Infinity, duration: 3.2, ease: 'easeInOut' }
            }
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />

          {style === 'muse' ? (
            <g>
              {/* Soft obsidian radial core glow */}
              <circle cx={cx} cy={cy} r={54} fill={palette.dim} fillOpacity={0.14} />

              {/* Twinkling 4-point dot sparkles framing anime silhouette */}
              {[
                { sx: cx - 56, sy: cy - 38, delay: 0 },
                { sx: cx + 56, sy: cy - 30, delay: 0.9 },
              ].map((sp, i) => (
                <motion.g
                  key={i}
                  animate={reduced ? undefined : { opacity: [0.35, 1, 0.35], scale: [0.9, 1.15, 0.9] }}
                  transition={{ repeat: Infinity, duration: 2.2, delay: sp.delay }}
                  style={{ transformOrigin: `${sp.sx}px ${sp.sy}px` }}
                >
                  <circle cx={sp.sx} cy={sp.sy} r={2.2} fill={palette.bright} />
                  <circle cx={sp.sx - 4} cy={sp.sy} r={1.2} fill={palette.primary} />
                  <circle cx={sp.sx + 4} cy={sp.sy} r={1.2} fill={palette.primary} />
                  <circle cx={sp.sx} cy={sp.sy - 4} r={1.2} fill={palette.primary} />
                  <circle cx={sp.sx} cy={sp.sy + 4} r={1.2} fill={palette.primary} />
                </motion.g>
              ))}

              {/* Swept dot-matrix anime hair & cyber hairpin dots */}
              {hairDots.map((d, i) => (
                <circle
                  key={i}
                  cx={cx + d.dx}
                  cy={cy + d.dy}
                  r={d.r}
                  fill={palette.primary}
                  opacity={d.o}
                />
              ))}
              <circle cx={cx + 28} cy={cy - 42} r={2.4} fill={palette.bright} opacity={0.95} />
              <circle cx={cx + 34} cy={cy - 39} r={1.8} fill={palette.primary} opacity={0.85} />

              {/* Sculpted Monochrome Anime Dot Eyes + Upper Lash Wing + Gleaming Catchlights */}
              {[-22, 22].map((ex, ei) => {
                const side = ei === 0 ? -1 : 1;
                const eyeCx = cx + ex;
                const eyeCy = cy - 4;
                if (state === 'conflict') {
                  return (
                    <g key={ei}>
                      <line
                        x1={eyeCx - 10}
                        y1={eyeCy - 14 - side * 3}
                        x2={eyeCx + 10}
                        y2={eyeCy - 14 + side * 3}
                        stroke={palette.bright}
                        strokeWidth={2.8}
                        strokeLinecap="round"
                      />
                      <rect
                        x={eyeCx - 9}
                        y={eyeCy - 4}
                        width={18}
                        height={8}
                        rx={4}
                        fill={palette.primary}
                      />
                      <circle cx={eyeCx} cy={eyeCy} r={2.5} fill="#000000" />
                      <circle cx={eyeCx - 3} cy={eyeCy - 1.5} r={1.8} fill={palette.bright} />
                    </g>
                  );
                }

                return (
                  <motion.g
                    key={ei}
                    animate={
                      reduced || state !== 'idle'
                        ? { scaleY: 1 }
                        : { scaleY: [1, 1, 0.08, 1, 1] }
                    }
                    transition={{ repeat: Infinity, duration: 4.4, times: [0, 0.9, 0.93, 0.96, 1] }}
                    style={{ transformOrigin: `${eyeCx}px ${eyeCy}px` }}
                  >
                    {/* Upper glowing curved anime eyelash + wing tip */}
                    <path
                      d={`M ${eyeCx - 11} ${eyeCy - 7} Q ${eyeCx} ${eyeCy - 15} ${eyeCx + 11} ${eyeCy - 7}`}
                      fill="none"
                      stroke={palette.bright}
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                    <circle cx={eyeCx + side * 12.5} cy={eyeCy - 9} r={1.6} fill={palette.primary} />
                    {/* Luminous anime iris ring + bottom crescent dot reflection */}
                    <ellipse
                      cx={eyeCx}
                      cy={eyeCy + 1}
                      rx={9}
                      ry={10.5}
                      fill={palette.dim}
                      stroke={palette.primary}
                      strokeWidth={2}
                    />
                    <path
                      d={`M ${eyeCx - 5.5} ${eyeCy + 6} Q ${eyeCx} ${eyeCy + 10} ${eyeCx + 5.5} ${eyeCy + 6}`}
                      fill="none"
                      stroke={palette.secondary}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                    {/* Deep obsidian pupil void */}
                    <ellipse cx={eyeCx + gazeX} cy={eyeCy + gazeY + 0.5} rx={4.2} ry={5} fill="#000000" />
                    {/* Dual anime catchlight dots */}
                    <circle cx={eyeCx - 3.5 + gazeX} cy={eyeCy - 3.5 + gazeY} r={2.8} fill={palette.bright} />
                    <circle cx={eyeCx + 3.5 + gazeX} cy={eyeCy + 4.5 + gazeY} r={1.4} fill={palette.bright} />
                  </motion.g>
                );
              })}

              {/* Delicate cheek blush micro-dots */}
              {[-1, 1].map((side) => (
                <g key={`blush-${side}`} opacity={0.48}>
                  <circle cx={cx + side * 31} cy={cy + 12} r={1.5} fill={palette.primary} />
                  <circle cx={cx + side * 35} cy={cy + 10} r={1.3} fill={palette.primary} />
                  <circle cx={cx + side * 38} cy={cy + 12.5} r={1.2} fill={palette.secondary} />
                </g>
              ))}

              {/* Expressive anime dot-matrix mouth / reactive voice dot columns */}
              {state === 'conflict' ? (
                <path
                  d={`M ${cx - 18} ${cy + 27} L ${cx} ${cy + 17} L ${cx + 18} ${cy + 27}`}
                  fill="none"
                  stroke={palette.bright}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : state === 'listening' || state === 'speaking' ? (
                voiceEqRows.map(([baseCount], colIdx) => {
                  const bx = cx - 18 + colIdx * 9;
                  const dotsCount = Math.max(1, Math.min(4, baseCount + (state === 'speaking' || rmsBoost > 0.25 ? 1 : 0)));
                  return (
                    <motion.g
                      key={colIdx}
                      animate={reduced ? undefined : { y: [-1.5, 1.5, -1.5] }}
                      transition={{ repeat: Infinity, duration: 0.42, delay: colIdx * 0.07 }}
                    >
                      {Array.from({ length: dotsCount }).map((_, di) => {
                        const offset = (di - (dotsCount - 1) / 2) * 5.2;
                        return (
                          <circle
                            key={di}
                            cx={bx}
                            cy={cy + 24 + offset}
                            r={2.2}
                            fill={di === Math.floor(dotsCount / 2) ? palette.bright : palette.primary}
                          />
                        );
                      })}
                    </motion.g>
                  );
                })
              ) : state === 'thinking' ? (
                [-12, 0, 12].map((dx, idx) => (
                  <motion.circle
                    key={idx}
                    cx={cx + dx}
                    cy={cy + 24}
                    r={2.6}
                    fill={palette.bright}
                    animate={reduced ? undefined : { opacity: [0.25, 1, 0.25], cy: [cy + 24, cy + 19, cy + 24] }}
                    transition={{ repeat: Infinity, duration: 0.9, delay: idx * 0.18 }}
                  />
                ))
              ) : (
                /* Cute anime 'w' cat smile in glowing dots */
                [
                  [-9, 22, 1.7],
                  [-6, 25, 2.0],
                  [-3, 25.5, 2.0],
                  [0, 23, 2.1],
                  [3, 25.5, 2.0],
                  [6, 25, 2.0],
                  [9, 22, 1.7],
                ].map(([mx, my, mr], idx) => (
                  <circle key={idx} cx={cx + mx} cy={cy + my} r={mr} fill={palette.bright} opacity={0.9} />
                ))
              )}
            </g>
          ) : (
            /* Stepped Bayer Duet / ChatGPT Circular Phosphor Dot Matrix */
            pixels.map((p, idx) => {
              const frac =
                state === 'conflict' && Math.abs(Math.sin(p.angle * 3)) < 0.45
                  ? 0.9
                  : p.dist / 6.2;
              const threshold =
                style === 'dots'
                  ? state === 'listening'
                    ? 0.85 + rmsBoost * 0.35
                    : 0.82
                  : state === 'listening'
                    ? 0.92 + rmsBoost * 0.35
                    : 0.98;
              const visible = frac + p.bayer * (style === 'dots' ? 0.25 : 0.42) < threshold;
              if (!visible) return null;
              const fill =
                p.dist < 2.1
                  ? palette.bright
                  : p.bayer < 0.45
                    ? palette.secondary
                    : palette.primary;
              const dotR = style === 'dots' ? 3.8 : CELL * 0.44;
              return (
                <motion.circle
                  key={idx}
                  cx={p.x + dotR}
                  cy={p.y + dotR}
                  r={dotR}
                  fill={fill}
                  animate={
                    reduced
                      ? { opacity: 0.85 }
                      : state === 'speaking'
                        ? { opacity: activeWord ? [0.45, 1, 0.55] : [0.3, 0.85, 0.3] }
                        : state === 'listening'
                          ? { opacity: Math.min(1, 0.35 + rmsBoost * 0.95 - p.bayer * 0.25) }
                          : state === 'conflict'
                            ? { opacity: p.dist % 2 < 1 ? 1 : 0.25 }
                            : { opacity: [0.38, 0.88, 0.38] }
                  }
                  transition={{
                    repeat: state === 'idle' || state === 'speaking' ? Infinity : 0,
                    duration: state === 'speaking' ? 0.45 : 2.4,
                    delay: (idx % 7) * 0.06,
                  }}
                />
              );
            })
          )}
        </motion.svg>

        <div className="min-h-[18px] mt-1 font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--bright)] text-center">
          {activeWord ? `"${activeWord}"` : state === 'idle' ? 'SAY "ONQ, ..."' : state.toUpperCase()}
        </div>

        {/* Crisp 3-Style Monochrome Green Avatar Switcher (Anime Dots / Claude Duet / ChatGPT Dots) */}
        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#34f57e]/20 bg-black/75 p-0.5 text-[8.5px] font-pixel uppercase">
          {(
            [
              ['muse', 'Anime'],
              ['duet', 'Duet'],
              ['dots', 'Dots'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStyle(id)}
              className={`px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                style === id
                  ? 'bg-[#34f57e] text-[#05120a]'
                  : 'text-[var(--lightgray)] hover:text-[#34f57e]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
