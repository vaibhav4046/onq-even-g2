import { useEffect, useId, useMemo, useState } from 'react';
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
  orchestratorLabel?: string;
  className?: string;
}

const GRID_SIZE = 13;
const CELL = 9;
const PITCH = 12;

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

type VisemeShape = 'closed' | 'small' | 'mid' | 'wide';

function resolveMouthViseme(
  state: VoiceOrbState,
  activeWord: string,
  rmsLevel: number,
  pulsePhase: number,
): VisemeShape {
  if (state === 'speaking') {
    const w = activeWord.trim().toLowerCase();
    if (w) {
      if (/[ae]/.test(w)) return pulsePhase % 3 === 2 ? 'mid' : 'wide';
      if (/[ou]/.test(w)) return 'mid';
      if (/^[mbp]$/.test(w[0] ?? '')) return 'closed';
      return pulsePhase % 2 === 0 ? 'small' : 'mid';
    }
    return (['small', 'mid', 'wide', 'mid'] as const)[pulsePhase % 4];
  }
  if (state === 'listening') {
    if (rmsLevel > 0.09) return 'wide';
    if (rmsLevel > 0.045) return 'mid';
    if (rmsLevel > 0.012) return 'small';
    return 'closed';
  }
  if (state === 'armed') return 'small';
  return 'closed';
}

/**
 * Upgraded OnQ Personal AI Partner & Master Orchestrator Avatar:
 * Exact 256x256 Monochrome Green Shonen AI Companion w/ live 4-viseme mouth shapes,
 * auto-blink eyelids, expressive brows, reactive energy aura & hold countdown reticle.
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
  orchestratorLabel,
  className = '',
}: OnQVoiceOrbProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const glowId = `g2-glow-${uid}`;
  const reduced = useReducedMotion();
  const [localStyle, setLocalStyle] = useState<PixelAvatarStyle>('muse');
  const style = avatarStyle ?? localStyle;
  const [pulseTick, setPulseTick] = useState(0);
  const [blinking, setBlinking] = useState(false);

  const setStyle = (next: PixelAvatarStyle) => {
    setLocalStyle(next);
    onChangeAvatarStyle?.(next);
  };

  // Drive organic phoneme animation frame ticks while speaking
  useEffect(() => {
    if (reduced || state !== 'speaking') return;
    const id = window.setInterval(() => setPulseTick((t) => (t + 1) % 8), 115);
    return () => window.clearInterval(id);
  }, [reduced, state]);

  // Natural eyelid blink loop when idle or listening
  useEffect(() => {
    if (reduced) return;
    let closeTimer = 0;
    const interval = window.setInterval(() => {
      setBlinking(true);
      closeTimer = window.setTimeout(() => setBlinking(false), 140);
    }, 4200);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(closeTimer);
    };
  }, [reduced]);

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
      ? { primary: '#B8FFD1', secondary: '#34F57E', bright: '#FFFFFF', dim: '#187A3F', badge: 'BLOCKED' }
      : state === 'armed'
        ? { primary: '#9BFFBE', secondary: '#34F57E', bright: '#E2FFEC', dim: '#156634', badge: 'HOLDING TO CONFIRM' }
        : state === 'speaking'
          ? { primary: '#86FFAF', secondary: '#34F57E', bright: '#E2FFEC', dim: '#156634', badge: 'PARTNER SPEAKING' }
          : state === 'thinking'
            ? { primary: '#34F57E', secondary: '#86FFAF', bright: '#D4FFE4', dim: '#0F4D28', badge: 'ORCHESTRATING' }
            : state === 'listening'
              ? { primary: '#5CFF9A', secondary: '#34F57E', bright: '#C8FFDC', dim: '#12592E', badge: 'LISTENING' }
              : { primary: '#34F57E', secondary: '#187A3F', bright: '#B8FFD1', dim: '#0A2E17', badge: 'PARTNER READY' };

  const rmsBoost = Math.min(1, Math.max(0, rmsLevel * 7));
  const viseme = resolveMouthViseme(state, activeWord, rmsLevel, pulseTick);
  const scaleOrb =
    reduced
      ? 1
      : state === 'listening'
        ? 1 + rmsBoost * 0.045
        : state === 'speaking'
          ? 1.02
          : 1;

  const browTilt = state === 'conflict' || state === 'armed' ? 3 : state === 'thinking' ? -2 : 0;
  const eyeShiftX = state === 'thinking' ? 2.2 : state === 'listening' ? (pulseTick % 2 === 0 ? -0.6 : 0.6) : 0;
  const eyeShiftY = state === 'thinking' ? -1.4 : 0;
  const ringCircumference = 2 * Math.PI * 121;
  const ringOffset =
    state === 'armed'
      ? ringCircumference * (1 - Math.max(0.06, Math.min(1, armProgress01)))
      : ringCircumference * 0.18;

  const sizePx = GRID_SIZE * PITCH + 20;

  return (
    <div className={`retro-glass-well p-3 flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-dashed border-[#34f57e]/20">
        <span className="font-pixel text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.primary }}>
          {palette.badge}
          {latencyMs && latencyMs > 0 ? ` · ${Math.round(latencyMs)}ms` : ''}
        </span>
        <span className="font-plex text-[10px] text-[var(--lightgray)] truncate max-w-[140px]">
          {orchestratorLabel ?? engineLabel}
        </span>
      </div>

      <div className="py-1.5 flex flex-col items-center justify-center relative">
        {style === 'muse' ? (
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            width={256}
            height={256}
            fill="none"
            role="img"
            aria-label={`OnQ Personal AI Partner Avatar in ${state} state`}
            animate={{ scale: scaleOrb }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="w-40 h-40 sm:w-44 sm:h-44 drop-shadow-[0_0_16px_rgba(52,245,126,0.18)]"
          >
            <defs>
              <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Optional 2.0s safety confirmation ring framing the companion avatar */}
            {(state === 'armed' || state === 'thinking' || state === 'conflict') && (
              <circle
                cx="128"
                cy="128"
                r="121"
                fill="none"
                stroke={palette.primary}
                strokeWidth={state === 'armed' ? 3 : 1.5}
                strokeLinecap="round"
                strokeDasharray={state === 'armed' ? ringCircumference : '4 8'}
                strokeDashoffset={state === 'armed' ? ringOffset : 0}
                opacity={state === 'armed' ? 0.92 : 0.45}
              />
            )}

            {/* Dynamic Shonen Monochrome Aura */}
            <motion.g
              id="avatar-aura"
              filter={`url(#${glowId})`}
              animate={
                reduced
                  ? { opacity: 0.8 }
                  : state === 'speaking' || state === 'listening'
                    ? { opacity: [0.65, 1, 0.72], scale: [1, 1.025, 1] }
                    : state === 'thinking'
                      ? { opacity: [0.5, 0.95, 0.5] }
                      : { opacity: [0.62, 0.85, 0.62] }
              }
              transition={{ repeat: Infinity, duration: state === 'thinking' ? 1.3 : 2.6 }}
              style={{ transformOrigin: '128px 128px' }}
            >
              <path d="M 38 196 L 26 146 L 44 158 L 34 108 L 56 132" fill="none" stroke="#34F57E" strokeWidth="2" strokeLinejoin="miter" opacity="0.7" />
              <path d="M 218 196 L 230 146 L 212 158 L 222 108 L 200 132" fill="none" stroke="#34F57E" strokeWidth="2" strokeLinejoin="miter" opacity="0.7" />
              <path d="M 88 30 L 96 14 L 106 32" fill="none" stroke="#34F57E" strokeWidth="1.5" opacity="0.55" />
              <path d="M 168 30 L 160 14 L 150 32" fill="none" stroke="#34F57E" strokeWidth="1.5" opacity="0.55" />
            </motion.g>

            {/* Layered High-Collar Coat & Pin */}
            <g id="avatar-body">
              <path d="M 36 256 L 46 210 Q 54 192 86 184 L 112 178 L 144 178 L 170 184 Q 202 192 210 210 L 220 256 Z" fill="#061F10" fillOpacity="0.88" stroke="#34F57E" strokeWidth="2.4" strokeLinejoin="round" />
              <path d="M 82 174 L 90 216 L 128 228 L 166 216 L 174 174 L 154 186 L 128 192 L 102 186 Z" fill="#0A2E17" fillOpacity="0.92" stroke="#34F57E" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M 94 184 L 102 208 L 128 216 L 154 208 L 162 184 Z" fill="#031209" fillOpacity="0.9" stroke="#187A3F" strokeWidth="1.4" />
              <path d="M 128 228 L 128 256" stroke="#187A3F" strokeWidth="1.8" />
              <path d="M 166 216 L 150 256" stroke="#34F57E" strokeWidth="2" />
              <circle cx="154" cy="222" r="4.2" fill="#031209" stroke="#34F57E" strokeWidth="2" />
              <circle cx="154" cy="222" r="1.4" fill="#B8FFD1" />
              <path d="M 60 214 L 78 232" stroke="#187A3F" strokeWidth="1.6" />
              <path d="M 196 214 L 178 232" stroke="#187A3F" strokeWidth="1.6" />
            </g>

            {/* Head, Spiky Hair, Shaded Face, Brows, Eyes, Blink & 4-State Viseme Mouth */}
            <motion.g
              id="avatar-head"
              animate={
                reduced
                  ? undefined
                  : state === 'thinking'
                    ? { y: [0, -2.5, 0], rotate: [0, 1.2, 0] }
                    : state === 'speaking'
                      ? { y: [0, -1.5, 0] }
                      : { y: [0, -1.2, 0] }
              }
              transition={{ repeat: Infinity, duration: state === 'speaking' ? 0.55 : 3.2, ease: 'easeInOut' }}
              style={{ transformOrigin: '128px 150px' }}
            >
              <g id="avatar-hair-back">
                <path
                  d="M 80 128 L 52 114 L 72 98 L 46 78 L 76 74 L 62 46 L 94 56 L 98 26 L 120 46 L 132 22 L 144 48 L 166 28 L 166 56 L 198 46 L 182 74 L 210 78 L 184 98 L 204 114 L 176 128 Z"
                  fill="#061F10"
                  fillOpacity="0.92"
                  stroke="#34F57E"
                  strokeWidth="2.4"
                  strokeLinejoin="miter"
                />
              </g>

              <path d="M 111 164 L 111 196 L 128 202 L 145 196 L 145 164 Z" fill="#0A2E17" stroke="#34F57E" strokeWidth="2" />
              <path d="M 112 170 Q 128 184 144 170 L 144 182 Q 128 192 112 182 Z" fill="#031209" opacity="0.7" />

              <path d="M 86 116 Q 78 122 81 136 Q 84 144 90 142" fill="#0A2E17" stroke="#34F57E" strokeWidth="2" />
              <path d="M 170 116 Q 178 122 175 136 Q 172 144 166 142" fill="#0A2E17" stroke="#34F57E" strokeWidth="2" />

              <path
                d="M 86 92 L 86 124 L 94 150 L 114 168 Q 128 176 142 168 L 162 150 L 170 124 L 170 92 Q 128 74 86 92 Z"
                fill="#0D3B1E"
                fillOpacity="0.94"
                stroke="#34F57E"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />

              <path d="M 88 124 L 96 148 L 106 158 L 98 134 Z" fill="#061F10" opacity="0.65" />
              <path d="M 168 124 L 160 148 L 150 158 L 158 134 Z" fill="#061F10" opacity="0.65" />

              <path d="M 127 124 L 124 139 L 130 141" fill="none" stroke="#34F57E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

              <g id="avatar-eyes">
                <path d="M 94 116 L 118 119 L 115 127 L 98 126 Z" fill="#031209" stroke="#34F57E" strokeWidth="2" strokeLinejoin="miter" />
                <path d="M 92 115 L 120 118" stroke="#B8FFD1" strokeWidth="2.6" strokeLinecap="square" />
                <circle cx={107 + eyeShiftX} cy={122 + eyeShiftY} r="3.6" fill="#34F57E" filter={`url(#${glowId})`} />
                <circle cx={107 + eyeShiftX} cy={122 + eyeShiftY} r="1.4" fill="#031209" />
                <rect x={108.5 + eyeShiftX} y={119.5 + eyeShiftY} width="1.8" height="1.8" fill="#B8FFD1" />

                <path d="M 162 116 L 138 119 L 141 127 L 158 126 Z" fill="#031209" stroke="#34F57E" strokeWidth="2" strokeLinejoin="miter" />
                <path d="M 164 115 L 136 118" stroke="#B8FFD1" strokeWidth="2.6" strokeLinecap="square" />
                <circle cx={149 + eyeShiftX} cy={122 + eyeShiftY} r="3.6" fill="#34F57E" filter={`url(#${glowId})`} />
                <circle cx={149 + eyeShiftX} cy={122 + eyeShiftY} r="1.4" fill="#031209" />
                <rect x={150.5 + eyeShiftX} y={119.5 + eyeShiftY} width="1.8" height="1.8" fill="#B8FFD1" />

                <path d="M 101 131 L 113 131" stroke="#187A3F" strokeWidth="1.3" />
                <path d="M 143 131 L 155 131" stroke="#187A3F" strokeWidth="1.3" />
              </g>

              {/* Blink eyelids */}
              <g id="avatar-eyelids" opacity={blinking ? 1 : 0}>
                <path d="M 92 115 L 120 118 L 116 128 L 96 127 Z" fill="#0D3B1E" />
                <path d="M 93 122 Q 106 125 119 121" fill="none" stroke="#34F57E" strokeWidth="2.6" strokeLinecap="round" />
                <path d="M 164 115 L 136 118 L 140 128 L 160 127 Z" fill="#0D3B1E" />
                <path d="M 163 122 Q 150 125 137 121" fill="none" stroke="#34F57E" strokeWidth="2.6" strokeLinecap="round" />
              </g>

              <g id="avatar-brows">
                <path d={`M 92 ${106 - browTilt * 0.5} L 119 ${112 + browTilt}`} stroke="#34F57E" strokeWidth="2.8" strokeLinecap="square" />
                <path d={`M 164 ${106 - browTilt * 0.5} L 137 ${112 + browTilt}`} stroke="#34F57E" strokeWidth="2.8" strokeLinecap="square" />
              </g>

              {/* 4-Viseme Real-Time Speaking & Listening Mouth */}
              <g id="avatar-mouth">
                <g id="mouth-closed" opacity={viseme === 'closed' ? 1 : 0}>
                  <path d="M 117 154 Q 128 156 139 153" fill="none" stroke="#34F57E" strokeWidth="2.4" strokeLinecap="round" />
                  <path d="M 124 159 L 132 159" stroke="#187A3F" strokeWidth="1.2" />
                </g>
                <g id="mouth-small" opacity={viseme === 'small' ? 1 : 0}>
                  <path d="M 118 153 Q 128 151 138 153 Q 128 160 118 153 Z" fill="#031209" stroke="#34F57E" strokeWidth="2.2" strokeLinejoin="round" />
                </g>
                <g id="mouth-mid" opacity={viseme === 'mid' ? 1 : 0}>
                  <path d="M 115 151 Q 128 149 141 151 Q 138 162 128 163 Q 118 162 115 151 Z" fill="#031209" stroke="#34F57E" strokeWidth="2.2" strokeLinejoin="round" />
                  <path d="M 120 152 L 136 152" stroke="#B8FFD1" strokeWidth="2" />
                </g>
                <g id="mouth-wide" opacity={viseme === 'wide' ? 1 : 0}>
                  <path d="M 113 150 Q 128 147 143 150 Q 140 166 128 168 Q 116 166 113 150 Z" fill="#031209" stroke="#34F57E" strokeWidth="2.4" strokeLinejoin="round" />
                  <path d="M 118 151 L 138 151" stroke="#B8FFD1" strokeWidth="2.4" />
                  <path d="M 122 164 Q 128 161 134 164" fill="none" stroke="#187A3F" strokeWidth="1.8" />
                </g>
              </g>

              <g id="avatar-hair-front">
                <path
                  d="M 80 110 L 88 86 L 94 108 L 106 82 L 112 110 L 124 80 L 130 114 L 142 82 L 148 108 L 160 84 L 166 108 L 176 110 L 174 74 Q 128 54 82 74 Z"
                  fill="#061F10"
                  fillOpacity="0.94"
                  stroke="#34F57E"
                  strokeWidth="2.2"
                  strokeLinejoin="miter"
                />
                <path d="M 96 76 L 104 94 M 126 70 L 128 96 M 156 76 L 148 94" stroke="#187A3F" strokeWidth="1.5" />
              </g>
            </motion.g>
          </motion.svg>
        ) : (
          <motion.svg
            width={sizePx}
            height={sizePx}
            viewBox={`0 0 ${sizePx} ${sizePx}`}
            aria-label={`OnQ ${style} monochrome green avatar in ${state} state`}
            animate={{ scale: scaleOrb }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="w-40 h-40 sm:w-44 sm:h-44"
          >
            {pixels.map((p, idx) => {
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
            })}
          </motion.svg>
        )}

        <div className="min-h-[18px] mt-1 font-plex text-[11px] font-medium text-[var(--bright)] text-center truncate max-w-full">
          {activeWord
            ? `"${activeWord}"`
            : backchannelText
              ? backchannelText
              : aliveMood !== 'neutral'
                ? `${palette.badge} · ${aliveMood.toLowerCase()}`
                : state === 'idle'
                  ? 'Ask or say anything to OnQ'
                  : palette.badge}
        </div>

        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#34f57e]/20 bg-black/75 p-0.5 text-[9px] font-plex uppercase">
          {(
            [
              ['muse', 'Agent'],
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
                  ? 'bg-[#34f57e] text-[#05120a] font-semibold'
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
