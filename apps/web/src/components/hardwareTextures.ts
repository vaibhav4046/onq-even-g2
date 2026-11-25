import * as THREE from 'three';
import type { HudPhase, VoiceOrbState } from '@onq/core';

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export interface ProceduralSurfaceMaps {
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeSeededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * Generates procedural micro-bead matte acetate surface maps (zero external texture URLs).
 */
export function createMatteAcetateMaps(): ProceduralSurfaceMaps {
  const size = 256;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const rand = makeSeededRand(42071);

  for (let i = 0; i < size * size; i++) {
    const grain = (rand() - 0.5) * 28;
    const bv = Math.max(0, Math.min(255, Math.round(128 + grain)));
    const rv = Math.max(0, Math.min(255, Math.round(112 + grain * 0.7)));
    const idx = i * 4;
    bImg.data[idx] = bv;
    bImg.data[idx + 1] = bv;
    bImg.data[idx + 2] = bv;
    bImg.data[idx + 3] = 255;

    rImg.data[idx] = rv;
    rImg.data[idx + 1] = rv;
    rImg.data[idx + 2] = rv;
    rImg.data[idx + 3] = 255;
  }

  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 3);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 3);

  return {
    bumpMap,
    roughnessMap,
    dispose: () => {
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Generates directional brushed-titanium hairline textures for hinges and R1 ring.
 */
export function createBrushedTitaniumMaps(): ProceduralSurfaceMaps {
  const size = 256;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#5c5c5c';
  rCtx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(99103);
  for (let y = 0; y < size; y++) {
    const shade = Math.round(116 + (rand() - 0.5) * 44);
    bCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    bCtx.fillRect(0, y, size, 1);

    const rShade = Math.round(78 + (rand() - 0.5) * 32);
    rCtx.fillStyle = `rgb(${rShade},${rShade},${rShade})`;
    rCtx.fillRect(0, y, size, 1);
  }

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(2, 2);

  return {
    bumpMap,
    roughnessMap,
    dispose: () => {
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Subtle etched waveguide optical diffraction grating texture visible inside the glass.
 */
export function createWaveguideGratingTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(52, 245, 126, 0.08)';
  ctx.lineWidth = 1;
  for (let x = -h; x < w + h; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h * 0.65, h);
    ctx.stroke();
  }

  // Subtle corner optical alignment ticks (no solid box)
  ctx.strokeStyle = 'rgba(218, 255, 82, 0.22)';
  ctx.lineWidth = 1.5;
  const pad = 16;
  const arm = 12;
  const corners = [
    [pad, pad, 1, 1],
    [w - pad, pad, -1, 1],
    [pad, h - pad, 1, -1],
    [w - pad, h - pad, -1, -1],
  ] as const;
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * arm);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getPhosphorPalette(phase: HudPhase) {
  if (phase === 'conflict' || phase === 'error') {
    return { primary: '#ffb020', secondary: '#ff7a45', glow: 'rgba(255, 176, 32, 0.75)' };
  }
  if (phase === 'armed' || phase === 'wrap_up') {
    return { primary: '#daff52', secondary: '#34F57E', glow: 'rgba(218, 255, 82, 0.8)' };
  }
  if (phase === 'stale') {
    return { primary: '#a7f3d0', secondary: '#6ee7b7', glow: 'rgba(110, 231, 183, 0.55)' };
  }
  return { primary: '#34F57E', secondary: '#daff52', glow: 'rgba(52, 245, 126, 0.8)' };
}

function drawScanlines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 1);
  }
}

/**
 * Renders live animated 525nm monochrome phosphor dossier/action HUD for the Left G2 Waveguide Lens.
 * Runs a seamless 12-second waveguide showcase reel while idle (live FSM phases override immediately).
 */
export function drawLeftLensHudCanvas(
  canvas: HTMLCanvasElement,
  opts: {
    phase: HudPhase;
    headerLine: string;
    primaryLine: string;
    timeSec?: number;
  },
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const t = opts.timeSec ?? 0;
  const reelStage = opts.phase === 'idle' && t > 0 ? Math.floor((t % 12) / 3) : -1;
  const pal = getPhosphorPalette(reelStage === 2 ? 'armed' : opts.phase);

  // Feather-light waveguide shimmer keeping optical glass crystal clear see-through
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, w * 0.46);
  grad.addColorStop(0, opts.phase === 'conflict' ? 'rgba(65, 36, 4, 0.16)' : 'rgba(10, 62, 30, 0.14)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = 12;

  const headerText =
    reelStage === 0
      ? 'LIVE · CORRIDOR (12M)'
      : reelStage === 1
        ? 'STT-3.7 · 16KHZ STREAM'
        : reelStage === 2
          ? 'DEFAULT-NO · ARMED 2.0S'
          : reelStage === 3
            ? 'RECEIPT · 409 SHIELD OK'
            : opts.headerLine.slice(0, 24).toUpperCase();

  ctx.fillStyle = pal.secondary;
  ctx.font = '700 22px "JetBrains Mono", Consolas, monospace';
  ctx.fillText(headerText, 38, 68);

  // Dotted waveguide divider rule
  ctx.fillStyle = pal.primary;
  for (let x = 38; x < w - 38; x += 12) {
    ctx.fillRect(x, 86, 6, 2);
  }

  const headline =
    opts.phase === 'conflict'
      ? '!! LOCKED (409) BUSY'
      : opts.phase === 'meeting_live'
        ? 'MEETING_LIVE // RAM'
        : opts.phase === 'wrap_up'
          ? 'WRAP-UP DEFAULT: NO'
          : opts.phase === 'done'
            ? 'COMMITTED · RECEIPT OK'
            : reelStage === 1
              ? '"Shift +15m & reply"'
              : reelStage === 2
                ? '> [YES] SWEEPING 2.0S'
                : reelStage === 3
                  ? 'GCAL +15M · TG+MAIL OK'
                  : opts.primaryLine;

  ctx.fillStyle = pal.primary;
  ctx.font = '700 28px "JetBrains Mono", Consolas, monospace';
  ctx.fillText(headline.slice(0, 23), 38, 138);

  const sub =
    opts.phase === 'armed'
      ? 'TAP R1 -> ABORT WRITES'
      : opts.phase === 'listening'
        ? 'STT-3.7 16KHZ STREAMING'
        : opts.phase === 'meeting_live'
          ? '2 SPEAKERS · ASK "ONQ"'
          : opts.phase === 'conflict'
            ? '0 EDITS · FREE 15:45'
            : opts.phase === 'stale'
              ? 'STALE CACHE · OFFLINE'
              : reelStage === 0
                ? 'CAL · MAIL · TG VERIFIED'
                : reelStage === 1
                  ? 'NO HALLUCINATIONS · GUARD'
                  : reelStage === 2
                    ? 'ANY TAP = 0 WRITES SENT'
                    : reelStage === 3
                      ? '24/7 HARNESS WATCHING'
                      : '42-COL · <=999B · G2';

  ctx.fillStyle = pal.secondary;
  ctx.font = '700 20px "JetBrains Mono", Consolas, monospace';
  ctx.fillText(sub, 38, 186);

  // Subtle animated signal / audio bars along bottom of lens
  const bars = 12;
  for (let i = 0; i < bars; i++) {
    const wave = 0.28 + 0.72 * Math.abs(Math.sin(t * (reelStage === 1 ? 7.5 : 2.6) + i * 0.55));
    const bh = Math.round((reelStage === 1 ? 22 : 10) * wave);
    ctx.fillStyle = i % 3 === 0 ? pal.secondary : pal.primary;
    ctx.globalAlpha = 0.55 + 0.35 * wave;
    ctx.fillRect(38 + i * 16, 224 - bh, 10, bh);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawScanlines(ctx, w, h);
}

/**
 * Renders the retro-pixel Bayer 4x4 Voice Orb & 2.0s Optical Countdown Ring
 * INSIDE the right G2 waveguide lens, synced live to STT-3.7, TTS-1, and FSM state.
 */
export function drawRightLensHudCanvas(
  canvas: HTMLCanvasElement,
  opts: {
    phase: HudPhase;
    orbState?: VoiceOrbState;
    activeWord?: string;
    ringProgress: number;
    rmsLevel: number;
    timeSec: number;
  },
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const pal = getPhosphorPalette(opts.phase);
  const cx = w * 0.5;
  const cy = h * 0.43;

  const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, w * 0.44);
  grad.addColorStop(0, opts.phase === 'conflict' ? 'rgba(65, 36, 4, 0.16)' : 'rgba(10, 62, 30, 0.14)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = 12;

  const idleReelStage = opts.phase === 'idle' && opts.timeSec > 0 ? Math.floor((opts.timeSec % 12) / 3) : -1;
  const orbMode: VoiceOrbState =
    opts.orbState && opts.orbState !== 'idle'
      ? opts.orbState
      : idleReelStage === 1
        ? 'listening'
        : idleReelStage === 2
          ? 'armed'
          : (opts.orbState ??
            (opts.phase === 'conflict' || opts.phase === 'error'
              ? 'conflict'
              : opts.phase === 'armed'
                ? 'armed'
                : opts.phase === 'listening' || opts.phase === 'meeting_live'
                  ? 'listening'
                  : 'idle'));

  // 1. Hybrid Muse Pixel Face + Stepped Bayer Dot Matrix inside right G2 lens
  const amp = Math.max(idleReelStage === 1 ? 0.62 : 0, Math.min(1, Math.max(0, opts.rmsLevel * 6.5)));
  const breathe = 0.5 + 0.5 * Math.sin(opts.timeSec * (orbMode === 'speaking' ? 7 : 2.1));
  const showMuseFace = orbMode === 'idle' || orbMode === 'listening' || orbMode === 'speaking' || orbMode === 'conflict';

  if (showMuseFace) {
    // Muse pixel eyes (soft periodic blink during idle)
    const blink = orbMode === 'idle' && opts.timeSec % 4.2 > 3.95;
    const eyeH = blink ? 3 : orbMode === 'listening' ? 20 : 15;
    ctx.fillStyle = pal.primary;
    ctx.fillRect(Math.round(cx - 26), Math.round(cy - 18 - eyeH / 2), 11, eyeH);
    ctx.fillRect(Math.round(cx + 15), Math.round(cy - 18 - eyeH / 2), 11, eyeH);

    // Muse reactive pixel mouth / voice bars
    if (orbMode === 'conflict') {
      ctx.fillRect(Math.round(cx - 22), Math.round(cy + 14), 44, 6);
    } else if (orbMode === 'listening' || orbMode === 'speaking') {
      for (let b = -2; b <= 2; b++) {
        const wave = Math.abs(Math.sin(opts.timeSec * 8 + b * 0.9));
        const mh = Math.max(5, Math.round(6 + (amp * 14 + breathe * 8) * wave));
        ctx.fillStyle = b === 0 ? pal.secondary : pal.primary;
        ctx.fillRect(Math.round(cx + b * 11 - 4), Math.round(cy + 14 - mh / 2), 8, mh);
      }
    } else {
      ctx.fillStyle = pal.secondary;
      ctx.fillRect(Math.round(cx - 20), Math.round(cy + 12), 6, 6);
      ctx.fillRect(Math.round(cx - 14), Math.round(cy + 18), 28, 6);
      ctx.fillRect(Math.round(cx + 14), Math.round(cy + 12), 6, 6);
    }
  } else {
    // Stepped Bayer 4x4 circular pixel constellation for thinking / armed
    const grid = 11;
    const pitch = 9;
    const cell = 7;
    const half = (grid - 1) / 2;

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const dx = gx - half;
        const dy = gy - half;
        const dist = Math.hypot(dx, dy);
        if (dist > half + 0.25) continue;

        const bayer = BAYER_4X4[gy % 4][gx % 4] / 16;
        const normDist = dist / half;
        const ang = Math.atan2(dy, dx);
        let alpha = 0.25;

        if (orbMode === 'thinking') {
          const scan = Math.cos(ang - opts.timeSec * 4.5);
          alpha = scan > 0.35 ? 0.98 : 0.22 + (1 - normDist) * 0.35;
        } else {
          alpha = 0.78 - normDist * 0.28;
        }

        ctx.globalAlpha = Math.max(0.12, Math.min(1, alpha));
        ctx.fillStyle = (gx + gy) % 3 === 0 ? pal.secondary : pal.primary;
        ctx.fillRect(
          Math.round(cx + dx * pitch - cell / 2),
          Math.round(cy + dy * pitch - cell / 2),
          cell,
          cell,
        );
      }
    }
    ctx.globalAlpha = 1;
  }

  // 2. Concentric 24-segment phosphor reticle / 2.0s Undo Countdown Ring around orb
  const segments = 24;
  const radius = 64;
  const reelRingProg = idleReelStage === 2 ? ((opts.timeSec % 3) / 3) : 0;
  const activeProg =
    opts.phase === 'armed'
      ? Math.max(0.08, Math.min(1, opts.ringProgress))
      : idleReelStage === 2
        ? Math.max(0.1, reelRingProg)
        : opts.phase === 'done' || idleReelStage === 3
          ? 1
          : orbMode === 'thinking'
            ? 0.5
            : 0.78;
  const litCount = Math.round(segments * activeProg);
  const spinOffset = orbMode === 'thinking' ? Math.floor(opts.timeSec * 8) : 0;

  for (let i = 0; i < segments; i++) {
    const idx = (i + spinOffset) % segments;
    const ang = -Math.PI / 2 + (idx / segments) * Math.PI * 2;
    const px = cx + Math.cos(ang) * radius - 3;
    const py = cy + Math.sin(ang) * radius - 3;
    ctx.fillStyle = i < litCount ? pal.primary : 'rgba(52, 245, 126, 0.18)';
    ctx.fillRect(Math.round(px), Math.round(py), 6, 6);
  }

  // 3. Crisp centered caption inside lens margins (zero clipping)
  ctx.fillStyle = pal.secondary;
  ctx.font = '700 18px "JetBrains Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  const caption =
    orbMode === 'speaking' && opts.activeWord
      ? `TTS: "${opts.activeWord.toUpperCase()}"`
      : orbMode === 'speaking'
        ? 'TTS-1 · EARBUDS'
        : opts.phase === 'armed'
          ? `ARMED ${((1 - activeProg) * 2).toFixed(1)}S · CANCEL`
          : idleReelStage === 2
            ? `ARMED ${((1 - activeProg) * 2).toFixed(1)}S · RING`
            : orbMode === 'listening'
              ? opts.phase === 'meeting_live'
                ? 'STT-3.7 DIARIZING'
                : 'STT-3.7 · 16KHZ'
              : orbMode === 'thinking'
                ? 'ONQ THINKING...'
                : orbMode === 'conflict'
                  ? 'HTTP 409 · LOCKED'
                  : idleReelStage === 3
                    ? 'COMMITTED · OK'
                    : 'SAY "ONQ, ..."';
  ctx.fillText(caption.slice(0, 20), cx, 224);

  ctx.restore();
  drawScanlines(ctx, w, h);
}

/**
 * Soft glowing circular dot sprite for dot-matrix photorealism lattice (zero hard edges).
 */
export function createDotSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 1, half, half, half);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.32, 'rgba(218, 255, 178, 0.82)');
  grad.addColorStop(0.68, 'rgba(52, 245, 126, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Seamless radial aura shadow texture for pure-black void grounding (zero circular edge seam).
 */
export function createRadialFloorGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 8, half, half, half - 4);
  grad.addColorStop(0, 'rgba(18, 56, 36, 0.42)');
  grad.addColorStop(0.45, 'rgba(8, 26, 17, 0.2)');
  grad.addColorStop(0.78, 'rgba(0, 0, 0, 0.04)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
