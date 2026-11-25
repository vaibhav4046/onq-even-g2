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
 * Renders live 525nm monochrome phosphor dossier/action HUD for the Left G2 Waveguide Lens.
 */
export function drawLeftLensHudCanvas(
  canvas: HTMLCanvasElement,
  opts: {
    phase: HudPhase;
    headerLine: string;
    primaryLine: string;
  },
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const pal = getPhosphorPalette(opts.phase);

  // Subtle green optical vignette inside lens only (black stays transparent under AdditiveBlending)
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 12, w * 0.5, h * 0.5, w * 0.48);
  grad.addColorStop(0, opts.phase === 'conflict' ? 'rgba(65, 36, 4, 0.36)' : 'rgba(6, 44, 22, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = 14;

  // Header status line
  ctx.fillStyle = pal.secondary;
  ctx.font = '700 24px "JetBrains Mono", Consolas, monospace';
  ctx.fillText(opts.headerLine.slice(0, 26).toUpperCase(), 38, 72);

  // Dotted waveguide divider rule
  ctx.fillStyle = pal.primary;
  for (let x = 38; x < w - 38; x += 12) {
    ctx.fillRect(x, 89, 6, 2);
  }

  // Primary card / phase headline
  const headline =
    opts.phase === 'conflict'
      ? '!! LOCKED (409) BUSY'
      : opts.phase === 'meeting_live'
        ? 'MEETING_LIVE // RAM'
        : opts.phase === 'wrap_up'
          ? 'WRAP-UP DEFAULT: NO'
          : opts.phase === 'done'
            ? 'COMMITTED · RECEIPT OK'
            : opts.primaryLine;

  ctx.fillStyle = pal.primary;
  ctx.font = '700 30px "JetBrains Mono", Consolas, monospace';
  ctx.fillText(headline.slice(0, 22), 38, 144);

  // Contextual sub-line synced to phase
  const sub =
    opts.phase === 'armed'
      ? 'HOLD/TAP R1 -> ABORT WRITES'
      : opts.phase === 'listening'
        ? 'STT-3.7 16KHZ STREAMING'
        : opts.phase === 'meeting_live'
          ? '2 SPEAKERS · ASK "ONQ"'
          : opts.phase === 'conflict'
            ? '0 EDITS · NEXT FREE 15:45'
            : opts.phase === 'stale'
              ? 'STALE CACHE · OFFLINE SAFE'
              : '42-COL · <=999B · G2';

  ctx.fillStyle = pal.secondary;
  ctx.font = '700 22px "JetBrains Mono", Consolas, monospace';
  ctx.fillText(sub, 38, 196);
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

  const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, w * 0.46);
  grad.addColorStop(0, opts.phase === 'conflict' ? 'rgba(65, 36, 4, 0.36)' : 'rgba(6, 48, 24, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = 12;

  const orbMode: VoiceOrbState =
    opts.orbState ??
    (opts.phase === 'conflict' || opts.phase === 'error'
      ? 'conflict'
      : opts.phase === 'armed'
        ? 'armed'
        : opts.phase === 'listening' || opts.phase === 'meeting_live'
          ? 'listening'
          : 'idle');

  // 1. Stepped Bayer 4x4 circular pixel Voice Orb matrix inside the right lens
  const grid = 11;
  const pitch = 9;
  const cell = 7;
  const half = (grid - 1) / 2;
  const amp = Math.min(1, Math.max(0, opts.rmsLevel * 6.5));
  const breathe = 0.5 + 0.5 * Math.sin(opts.timeSec * (orbMode === 'speaking' ? 7 : 2.1));

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

      if (orbMode === 'listening') {
        const wave = Math.sin(normDist * 6 - opts.timeSec * 8) * 0.25;
        alpha = normDist < 0.42 + amp * 0.58 + wave ? 0.95 - normDist * 0.35 : 0.16;
      } else if (orbMode === 'thinking') {
        const scan = Math.cos(ang - opts.timeSec * 4.5);
        alpha = scan > 0.35 ? 0.98 : 0.22 + (1 - normDist) * 0.35;
      } else if (orbMode === 'speaking') {
        alpha = normDist < 0.58 + breathe * 0.38 ? 1 - bayer * 0.22 : 0.2;
      } else if (orbMode === 'conflict') {
        alpha = bayer > 0.32 ? 0.92 : 0.18;
      } else if (orbMode === 'armed') {
        alpha = 0.78 - normDist * 0.28;
      } else {
        alpha = normDist < 0.72 + breathe * 0.18 ? 0.82 - bayer * 0.35 : 0.15;
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

  // 2. Concentric 24-segment phosphor reticle / 2.0s Undo Countdown Ring around orb
  const segments = 24;
  const radius = 64;
  const activeProg =
    opts.phase === 'armed'
      ? Math.max(0.08, Math.min(1, opts.ringProgress))
      : opts.phase === 'done'
        ? 1
        : orbMode === 'thinking'
          ? 0.5
          : 0.75;
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

  // 3. Inside-lens status caption ("OnQ" wake prompt / active spoken word / countdown)
  ctx.fillStyle = pal.secondary;
  ctx.font = '700 20px "JetBrains Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  const caption =
    orbMode === 'speaking' && opts.activeWord
      ? `TTS-1: "${opts.activeWord.toUpperCase()}"`
      : orbMode === 'speaking'
        ? 'TTS-1 · EARBUDS OUT'
        : orbMode === 'armed'
          ? `ARMED ${((1 - activeProg) * 2).toFixed(1)}S · TAP CANCEL`
          : orbMode === 'listening'
            ? opts.phase === 'meeting_live'
              ? 'STT-3.7 · DIARIZING'
              : 'LISTENING · 16KHZ'
            : orbMode === 'thinking'
              ? 'ONQ THINKING...'
              : orbMode === 'conflict'
                ? 'HTTP 409 · LOCKED'
                : 'SAY "ONQ, ..." · CLICK LENS';
  ctx.fillText(caption.slice(0, 26), cx, 224);

  ctx.restore();
  drawScanlines(ctx, w, h);
}
