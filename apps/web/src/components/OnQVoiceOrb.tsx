import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { AliveMood, PixelAvatarStyle, VoiceOrbState } from '@onq/core';

interface OnQVoiceOrbProps {
  state: VoiceOrbState;
  rmsLevel?: number;
  activeWord?: string;
  armProgress01?: number;
  engineLabel?: string;
  latencyMs?: number | null;
  backchannelText?: string | null;
  aliveMood?: AliveMood;
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
 * Jujutsu Kaisen (JJK) Monochrome Matrix-Green Sorcerer / Claude Duet / ChatGPT Dots SVG Avatar
 * with word-synced viseme lip-sync, blindfold -> Six Eyes reveal, Matrix dot rain, and duplex status.
 */
export function OnQVoiceOrb({
  state,
  rmsLevel = 0,
  activeWord = '',
  armProgress01 = 0,
  engineLabel = 'LOCAL VOICE',
  latencyMs,
  backchannelText,
  aliveMood = 'neutral',
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

  // Pure 525nm Matrix-green optical hierarchy
  const palette =
    state === 'conflict'
      ? { primary: '#D4FFE4', secondary: '#34F57E', bright: '#FFFFFF', dim: '#1A7A3F', badge: 'BLOCKED' }
      : state === 'armed'
        ? { primary: '#9BFFBE', secondary: '#34F57E', bright: '#E2FFEC', dim: '#156634', badge: 'TAP TO CANCEL' }
        : state === 'speaking'
          ? { primary: '#7EFFAD', secondary: '#34F57E', bright: '#E2FFEC', dim: '#156634', badge: 'SPEAKING' }
          : state === 'thinking'
            ? { primary: '#34F57E', secondary: '#86FFAF', bright: '#D4FFE4', dim: '#0F4D28', badge: 'THINKING' }
            : state === 'listening'
              ? { primary: '#5CFF9A', secondary: '#34F57E', bright: '#C8FFDC', dim: '#12592E', badge: 'LISTENING' }
              : { primary: '#34F57E', secondary: '#1EA352', bright: '#9BFFBE', dim: '#0D4A26', badge: 'READY' };

  const rmsBoost = Math.min(1, Math.max(0, rmsLevel * 7));
  const scaleOrb =
    reduced
      ? 1
      : state === 'listening'
        ? 1 + rmsBoost * 0.07
        : state === 'speaking'
          ? activeWord
            ? 1.04
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

  // Spiky JJK Gojo/Megumi dot-matrix hair spikes + jagged bangs + high-collar coat dots
  const jjkDots = useMemo(() => {
    const pts: Array<{ dx: number; dy: number; r: number; o: number; bright?: boolean }> = [];
    const spikes: Array<[number, number, number]> = [
      [-152, 54, 0.56],
      [-132, 65, 0.72],
      [-114, 56, 0.6],
      [-98, 67, 0.82],
      [-82, 57, 0.64],
      [-66, 65, 0.76],
      [-48, 55, 0.6],
      [-31, 61, 0.68],
    ];
    for (const [deg, outerR, o] of spikes) {
      const rad = (deg * Math.PI) / 180;
      for (const frac of [0.68, 0.84, 1.0]) {
        pts.push({
          dx: Math.cos(rad) * (outerR * frac),
          dy: -2 + Math.sin(rad) * (outerR * frac * 0.92),
          r: frac === 1.0 ? 1.8 : 2.3,
          o: frac === 1.0 ? o : o * 0.78,
          bright: frac === 1.0,
        });
      }
    }
    // Jagged bangs falling over forehead
    for (const [dx, dy, r, o] of [
      [-28, -36, 2.2, 0.6], [-24, -27, 1.8, 0.45],
      [-10, -40, 2.4, 0.68], [-8, -30, 2.0, 0.52], [-6, -21, 1.6, 0.36],
      [7, -40, 2.4, 0.7], [9, -30, 2.0, 0.52], [11, -21, 1.6, 0.36],
      [25, -36, 2.2, 0.6], [27, -27, 1.8, 0.45],
    ] as const) {
      pts.push({ dx, dy, r, o });
    }
    // High-collar Jujutsu uniform silhouette at bottom
    for (const side of [-1, 1] as const) {
      for (const [xOff, dy, r, o] of [
        [39, 9, 1.8, 0.42],
        [33, 22, 1.9, 0.46],
        [27, 36, 2.3, 0.68],
        [18, 42, 2.1, 0.6],
        [8, 46, 1.9, 0.5],
      ] as const) {
        pts.push({ dx: side * xOff, dy, r, o });
      }
    }
    return pts;
  }, []);

  // Compute live mouth viseme dimensions synced to active TTS word + mic RMS
  const wLower = activeWord.toLowerCase();
  const mouthRx =
    state === 'speaking'
      ? /[uow]/.test(wLower)
        ? 6.5
        : /[aei]/.test(wLower)
          ? 11
          : 8.5
      : state === 'listening'
        ? 7 + rmsBoost * 5
        : 8;
  const mouthRy =
    state === 'speaking'
      ? /^[mbp]$/.test(wLower.slice(0, 1))
        ? 1.5
        : /[ao]/.test(wLower)
          ? 8.5
          : /[u]/.test(wLower)
            ? 6.5
            : 5
      : state === 'listening'
        ? Math.max(2, 2 + rmsBoost * 7.5)
        : 2;

  const blindfolded = state === 'idle';
  const gazeX = state === 'thinking' ? 2.5 : 0;
  const gazeY = state === 'thinking' ? -2 : 0;

  return (
    <div className={`retro-glass-well p-3 flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-dashed border-[#34f57e]/20">
        <span className="font-pixel text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.primary }}>
          {palette.badge}
          {latencyMs && latencyMs > 0 ? ` · ${Math.round(latencyMs)}ms` : ''}
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
          aria-label={`OnQ ${style} monochrome green avatar in ${state} state`}
          animate={{ scale: scaleOrb }}
          transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          className="w-36 h-36 sm:w-40 sm:h-40"
        >
          {/* Outer Matrix dotted waveguide reticle / 2.0s countdown ring */}
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
                    : { opacity: 0.94 }
            }
            transition={
              state === 'thinking'
                ? { repeat: Infinity, duration: 2.6, ease: 'linear' }
                : { repeat: Infinity, duration: 3.0, ease: 'easeInOut' }
            }
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />

          {style === 'muse' ? (
            <g>
              <circle cx={cx} cy={cy} r={56} fill={palette.dim} fillOpacity={0.14} />

              {/* Subtle Matrix vertical dot rain inside reticle */}
              {[-62, -52, 52, 62].map((mx, ci) => (
                <motion.g
                  key={mx}
                  animate={reduced ? undefined : { y: [-14, 18, -14], opacity: [0.25, 0.72, 0.25] }}
                  transition={{ repeat: Infinity, duration: 2.4 + ci * 0.35, delay: ci * 0.28 }}
                >
                  <circle cx={cx + mx} cy={cy - 18} r={1.8} fill={palette.bright} />
                  <circle cx={cx + mx} cy={cy - 10} r={1.3} fill={palette.primary} opacity={0.55} />
                  <circle cx={cx + mx} cy={cy - 3} r={1.0} fill={palette.secondary} opacity={0.3} />
                </motion.g>
              ))}

              {/* Spiky JJK hair crown, jagged bangs & sorcerer collar dots */}
              {jjkDots.map((d, i) => (
                <circle
                  key={i}
                  cx={cx + d.dx}
                  cy={cy + d.dy}
                  r={d.r}
                  fill={d.bright ? palette.bright : palette.primary}
                  opacity={d.o}
                />
              ))}

              {/* Blindfold when idle -> radiant Six Eyes reveal when listening / speaking / thinking */}
              {blindfolded ? (
                <g>
                  <rect
                    x={cx - 42}
                    y={cy - 17}
                    width={84}
                    height={21}
                    rx={6}
                    fill="#04150a"
                    stroke={palette.primary}
                    strokeWidth={1.8}
                    strokeOpacity={0.82}
                  />
                  <line
                    x1={cx - 38}
                    y1={cy - 12}
                    x2={cx + 38}
                    y2={cy - 12}
                    stroke={palette.secondary}
                    strokeWidth={1}
                    strokeDasharray="3 4"
                  />
                  {[-20, 20].map((ex) => (
                    <motion.circle
                      key={ex}
                      cx={cx + ex}
                      cy={cy - 6.5}
                      r={2.8}
                      fill={palette.bright}
                      animate={reduced ? undefined : { opacity: [0.35, 0.95, 0.35] }}
                      transition={{ repeat: Infinity, duration: 2.2 }}
                    />
                  ))}
                </g>
              ) : (
                [-21, 21].map((ex, ei) => {
                  const side = ei === 0 ? -1 : 1;
                  const eyeCx = cx + ex;
                  const eyeCy = cy - 5;
                  if (state === 'conflict') {
                    return (
                      <g key={ei}>
                        <line
                          x1={eyeCx - 10}
                          y1={eyeCy - 12 - side * 3}
                          x2={eyeCx + 10}
                          y2={eyeCy - 12 + side * 3}
                          stroke={palette.bright}
                          strokeWidth={2.8}
                          strokeLinecap="round"
                        />
                        <rect x={eyeCx - 9} y={eyeCy - 3} width={18} height={7} rx={3.5} fill={palette.primary} />
                        <circle cx={eyeCx} cy={eyeCy + 0.5} r={2.4} fill="#000000" />
                        <circle cx={eyeCx - 3} cy={eyeCy - 1} r={1.6} fill={palette.bright} />
                      </g>
                    );
                  }
                  return (
                    <motion.g
                      key={ei}
                      animate={
                        reduced || state !== 'listening'
                          ? { scaleY: 1 }
                          : { scaleY: [1, 1, 0.12, 1, 1] }
                      }
                      transition={{ repeat: Infinity, duration: 4.5, times: [0, 0.91, 0.94, 0.97, 1] }}
                      style={{ transformOrigin: `${eyeCx}px ${eyeCy}px` }}
                    >
                      {/* Sharp JJK slanted upper lash */}
                      <path
                        d={`M ${eyeCx - 11} ${eyeCy - 6} Q ${eyeCx} ${eyeCy - 14} ${eyeCx + 11} ${eyeCy - 6}`}
                        fill="none"
                        stroke={palette.bright}
                        strokeWidth={3.1}
                        strokeLinecap="round"
                      />
                      <circle cx={eyeCx + side * 12.5} cy={eyeCy - 8} r={1.6} fill={palette.primary} />
                      {/* Six-Eyes glowing concentric iris */}
                      <ellipse
                        cx={eyeCx}
                        cy={eyeCy}
                        rx={9}
                        ry={7.6}
                        fill={palette.dim}
                        stroke={palette.primary}
                        strokeWidth={2}
                      />
                      <ellipse cx={eyeCx + gazeX} cy={eyeCy + gazeY} rx={4} ry={4.4} fill="#000000" />
                      <circle cx={eyeCx - 3.2 + gazeX} cy={eyeCy - 2.6 + gazeY} r={2.5} fill={palette.bright} />
                      <circle cx={eyeCx + 3.2 + gazeX} cy={eyeCy + 2.6 + gazeY} r={1.3} fill={palette.bright} />
                    </motion.g>
                  );
                })
              )}

              {/* Live Syllable Viseme Lip-Sync Mouth */}
              {state === 'conflict' ? (
                <path
                  d={`M ${cx - 16} ${cy + 26} L ${cx} ${cy + 16} L ${cx + 16} ${cy + 26}`}
                  fill="none"
                  stroke={palette.bright}
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : state === 'listening' || state === 'speaking' ? (
                <motion.g
                  animate={
                    reduced
                      ? undefined
                      : state === 'speaking'
                        ? { scaleY: [0.85, 1.18, 0.92, 1.12, 0.85] }
                        : undefined
                  }
                  transition={{ repeat: Infinity, duration: 0.34 }}
                  style={{ transformOrigin: `${cx}px ${cy + 22}px` }}
                >
                  <ellipse
                    cx={cx}
                    cy={cy + 22}
                    rx={mouthRx}
                    ry={mouthRy}
                    fill={palette.dim}
                    fillOpacity={0.7}
                    stroke={palette.bright}
                    strokeWidth={2.3}
                  />
                  <line
                    x1={cx - mouthRx * 0.6}
                    y1={cy + 22}
                    x2={cx + mouthRx * 0.6}
                    y2={cy + 22}
                    stroke={palette.bright}
                    strokeWidth={1.2}
                    strokeOpacity={0.55}
                  />
                </motion.g>
              ) : state === 'thinking' ? (
                [-11, 0, 11].map((dx, idx) => (
                  <motion.circle
                    key={idx}
                    cx={cx + dx}
                    cy={cy + 22}
                    r={2.4}
                    fill={palette.bright}
                    animate={reduced ? undefined : { opacity: [0.25, 1, 0.25], cy: [cy + 22, cy + 17, cy + 22] }}
                    transition={{ repeat: Infinity, duration: 0.85, delay: idx * 0.16 }}
                  />
                ))
              ) : (
                /* Calm Sorcerer smirk in crisp phosphor curve */
                <path
                  d={`M ${cx - 10} ${cy + 22} Q ${cx + 1} ${cy + 25} ${cx + 11} ${cy + 19}`}
                  fill="none"
                  stroke={palette.bright}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
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

        <div className="min-h-[18px] mt-1 font-pixel text-[10px] uppercase tracking-[0.14em] text-[var(--bright)] text-center truncate max-w-full">
          {activeWord
            ? `"${activeWord}"`
            : backchannelText
              ? backchannelText
              : aliveMood !== 'neutral'
                ? `${palette.badge} · ${aliveMood.toUpperCase()}`
                : state === 'idle'
                  ? 'SAY "ONQ, ..."'
                  : palette.badge}
        </div>

        {/* Crisp 3-Style Monochrome Green Avatar Switcher (JJK / Claude Duet / ChatGPT Dots) */}
        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#34f57e]/20 bg-black/75 p-0.5 text-[8.5px] font-pixel uppercase">
          {(
            [
              ['muse', 'JJK'],
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
