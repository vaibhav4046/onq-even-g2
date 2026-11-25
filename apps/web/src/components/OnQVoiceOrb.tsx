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
 * Retro-pixel Motion SVG Voice Avatar (Muse Face / Claude Duet / ChatGPT Dots) synced live to
 * AssemblyAI STT-3.7 RMS, AI thinking scan, TTS-1 WordBoundaries, 2.0s Countdown Ring & 409 Lock.
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

  const palette =
    state === 'conflict'
      ? { primary: '#ffb020', secondary: '#ff5a4f', badge: '409 CONFLICT LOCK' }
      : state === 'armed'
        ? { primary: '#daff52', secondary: '#34F57E', badge: 'ARMED · TAP TO CANCEL' }
        : state === 'speaking'
          ? { primary: '#daff52', secondary: '#34F57E', badge: 'SPEAKING · TTS-1' }
          : state === 'thinking'
            ? { primary: '#2dd4bf', secondary: '#34F57E', badge: 'ROUTER THINKING' }
            : state === 'listening'
              ? { primary: '#daff52', secondary: '#34F57E', badge: 'LISTENING · 16KHZ' }
              : { primary: '#34F57E', secondary: '#1ea352', badge: 'IDLE · READY' };

  const rmsBoost = Math.min(1, Math.max(0, rmsLevel * 7));
  const scaleOrb =
    reduced
      ? 1
      : state === 'listening'
        ? 1 + rmsBoost * 0.08
        : state === 'speaking'
          ? activeWord
            ? 1.06
            : 1.02
          : 1;

  const sizePx = GRID_SIZE * PITCH + 20;
  const cx = sizePx / 2;
  const cy = sizePx / 2;
  const ringCircumference = 2 * Math.PI * 82;
  const ringOffset =
    state === 'armed'
      ? ringCircumference * (1 - Math.max(0.06, Math.min(1, armProgress01)))
      : ringCircumference * 0.28;

  const mouthHeights = [
    2 + Math.round(rmsBoost * 7),
    4 + Math.round(rmsBoost * 10 + (activeWord ? 6 : 0)),
    6 + Math.round(rmsBoost * 12 + (state === 'speaking' ? 8 : 0)),
    4 + Math.round(rmsBoost * 10 + (activeWord ? 5 : 0)),
    2 + Math.round(rmsBoost * 7),
  ];

  return (
    <div className={`retro-glass-well p-3 flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-dashed border-white/10">
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
          shapeRendering="crispEdges"
          aria-label={`OnQ ${style} pixel avatar in ${state} state`}
          animate={{ scale: scaleOrb }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="w-36 h-36 sm:w-40 sm:h-40"
        >
          {/* Outer pixel reticle / 2.0s countdown ring */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={82}
            fill="none"
            stroke={palette.primary}
            strokeWidth={state === 'armed' ? 4 : 2}
            strokeDasharray={state === 'armed' ? ringCircumference : '6 6'}
            strokeDashoffset={state === 'armed' ? ringOffset : 0}
            animate={
              reduced
                ? undefined
                : state === 'thinking'
                  ? { rotate: 360 }
                  : state === 'idle'
                    ? { opacity: [0.35, 0.72, 0.35] }
                    : { opacity: 0.9 }
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
              {/* Muse-style pixel frame eyes */}
              {[-24, 14].map((ex, ei) => (
                <motion.rect
                  key={ei}
                  x={cx + ex}
                  y={cy - 24}
                  width={10}
                  height={state === 'listening' ? 18 : 14}
                  fill={palette.primary}
                  animate={
                    reduced || state !== 'idle'
                      ? { scaleY: 1 }
                      : { scaleY: [1, 1, 0.15, 1, 1] }
                  }
                  transition={{ repeat: Infinity, duration: 4.2, times: [0, 0.88, 0.92, 0.96, 1] }}
                  style={{ transformOrigin: `${cx + ex + 5}px ${cy - 17}px` }}
                />
              ))}

              {/* Muse reactive pixel mouth / voice waveform */}
              {state === 'conflict' ? (
                <path
                  d={`M ${cx - 24} ${cy + 20} L ${cx} ${cy + 8} L ${cx + 24} ${cy + 20}`}
                  fill="none"
                  stroke={palette.primary}
                  strokeWidth={6}
                />
              ) : state === 'listening' || state === 'speaking' ? (
                mouthHeights.map((mh, idx) => (
                  <motion.rect
                    key={idx}
                    x={cx - 26 + idx * 12}
                    y={cy + 18 - mh / 2}
                    width={8}
                    height={mh}
                    fill={idx === 2 ? palette.secondary : palette.primary}
                    animate={
                      reduced
                        ? undefined
                        : { height: [mh, Math.max(4, mh + 6), Math.max(4, mh - 4), mh] }
                    }
                    transition={{ repeat: Infinity, duration: 0.38, delay: idx * 0.06 }}
                  />
                ))
              ) : state === 'thinking' ? (
                [-18, 0, 18].map((dx, idx) => (
                  <motion.rect
                    key={idx}
                    x={cx + dx - 4}
                    y={cy + 14}
                    width={8}
                    height={8}
                    fill={palette.primary}
                    animate={reduced ? undefined : { opacity: [0.25, 1, 0.25], y: [cy + 14, cy + 8, cy + 14] }}
                    transition={{ repeat: Infinity, duration: 0.9, delay: idx * 0.18 }}
                  />
                ))
              ) : (
                <path
                  d={`M ${cx - 22} ${cy + 14} h6 v6 h32 v-6 h6`}
                  fill="none"
                  stroke={palette.secondary}
                  strokeWidth={6}
                />
              )}
            </g>
          ) : (
            /* Stepped Bayer Duet / ChatGPT Dot Matrix */
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
                p.dist < 2.2
                  ? palette.primary
                  : p.bayer < 0.45
                    ? palette.secondary
                    : palette.primary;
              return (
                <motion.rect
                  key={idx}
                  x={p.x}
                  y={p.y}
                  width={style === 'dots' ? 7 : CELL}
                  height={style === 'dots' ? 7 : CELL}
                  rx={style === 'dots' ? 3.5 : 0}
                  fill={fill}
                  animate={
                    reduced
                      ? { opacity: 0.85 }
                      : state === 'speaking'
                        ? { opacity: activeWord ? [0.45, 1, 0.55] : [0.3, 0.8, 0.3] }
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

        {/* Crisp 3-Style Pixel Avatar Switcher (Muse / Claude Duet / ChatGPT Dots) */}
        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/70 p-0.5 text-[8.5px] font-pixel uppercase">
          {(
            [
              ['muse', 'Muse'],
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
                  ? 'bg-[var(--lime)] text-[#0a0a0a]'
                  : 'text-[var(--lightgray)] hover:text-[var(--bright)]'
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
