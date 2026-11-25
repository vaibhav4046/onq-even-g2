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
  ctx.strokeStyle = 'rgba(52, 245, 126, 0.24)';
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
    return { primary: '#D4FFE4', secondary: '#34F57E', bright: '#FFFFFF', dim: '#1A7A3F', glow: 'rgba(134, 255, 175, 0.78)' };
  }
  if (phase === 'armed' || phase === 'wrap_up') {
    return { primary: '#86FFAF', secondary: '#34F57E', bright: '#E2FFEC', dim: '#156634', glow: 'rgba(134, 255, 175, 0.85)' };
  }
  if (phase === 'stale') {
    return { primary: '#6EE7B7', secondary: '#1EA352', bright: '#A7F3D0', dim: '#0D4A26', glow: 'rgba(52, 245, 126, 0.52)' };
  }
  return { primary: '#34F57E', secondary: '#86FFAF', bright: '#D4FFE4', dim: '#0F4D28', glow: 'rgba(52, 245, 126, 0.82)' };
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

  // 1. Sleek Monochrome 525nm Green Anime Dots Companion inside right G2 waveguide lens
  const amp = Math.max(idleReelStage === 1 ? 0.62 : 0, Math.min(1, Math.max(0, opts.rmsLevel * 6.5)));
  const breathe = 0.5 + 0.5 * Math.sin(opts.timeSec * (orbMode === 'speaking' ? 7 : 2.1));
  const showAnimeFace = orbMode === 'idle' || orbMode === 'listening' || orbMode === 'speaking' || orbMode === 'conflict';

  const drawDot = (dx: number, dy: number, r: number, color: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill();
  };

  if (showAnimeFace) {
    // Twinkling 4-point dot sparkles
    const sPulse = 0.45 + 0.55 * Math.sin(opts.timeSec * 3.1);
    for (const [sx, sy, a] of [
      [cx - 48, cy - 30, 0.35 + sPulse * 0.6],
      [cx + 48, cy - 22, 0.95 - sPulse * 0.55],
    ] as const) {
      drawDot(sx, sy, 2.3, pal.bright, a);
      drawDot(sx - 4, sy, 1.1, pal.primary, a * 0.8);
      drawDot(sx + 4, sy, 1.1, pal.primary, a * 0.8);
      drawDot(sx, sy - 4, 1.1, pal.primary, a * 0.8);
      drawDot(sx, sy + 4, 1.1, pal.primary, a * 0.8);
    }

    // Swept anime crown, parted bangs, cheek side-locks & chin whisper dots
    for (let deg = -156; deg <= -24; deg += 12) {
      const rad = (deg * Math.PI) / 180;
      drawDot(cx + Math.cos(rad) * 44, cy + 2 + Math.sin(rad) * 40, 2.1, pal.primary, 0.58);
    }
    for (const [bx, by, br, ba] of [
      [-21, -30, 1.9, 0.55], [-18, -24, 1.6, 0.42],
      [-4, -33, 2.1, 0.62], [-2, -26, 1.8, 0.48], [0, -20, 1.5, 0.34],
      [17, -30, 1.9, 0.55], [19, -24, 1.6, 0.42],
    ] as const) {
      drawDot(cx + bx, cy + by, br, pal.primary, ba);
    }
    for (const side of [-1, 1] as const) {
      for (const [dy, xOff, ba] of [
        [-12, 39, 0.52],
        [-2, 40, 0.46],
        [8, 38, 0.4],
        [18, 35, 0.32],
      ] as const) {
        drawDot(cx + side * xOff, cy + dy, 1.8, pal.primary, ba);
      }
    }
    drawDot(cx + 22, cy - 34, 2.2, pal.bright, 0.92);

    // Sculpted anime dot-matrix eyes + upper lash wings + gleaming catchlights
    const blink = orbMode === 'idle' && opts.timeSec % 4.2 > 3.95;
    for (const side of [-1, 1] as const) {
      const eyeCx = cx + side * 19;
      const eyeCy = cy - 4;
      if (blink) {
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = pal.bright;
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(eyeCx - 9, eyeCy - 1);
        ctx.quadraticCurveTo(eyeCx, eyeCy + 4, eyeCx + 9, eyeCy - 1);
        ctx.stroke();
      } else if (orbMode === 'conflict') {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = pal.bright;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(eyeCx - 9, eyeCy - 11 - side * 3);
        ctx.lineTo(eyeCx + 9, eyeCy - 11 + side * 3);
        ctx.stroke();
        drawDot(eyeCx, eyeCy, 6.5, pal.primary, 0.92);
        drawDot(eyeCx, eyeCy, 2.5, '#000000', 1);
        drawDot(eyeCx - 2, eyeCy - 2, 1.8, pal.bright, 1);
      } else {
        ctx.globalAlpha = 0.96;
        ctx.strokeStyle = pal.bright;
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(eyeCx - 9, eyeCy - 5);
        ctx.quadraticCurveTo(eyeCx, eyeCy - 12, eyeCx + 9, eyeCy - 5);
        ctx.stroke();
        drawDot(eyeCx + side * 10.5, eyeCy - 7, 1.5, pal.primary, 0.9);
        // Iris halo + deep pupil void + dual catchlights
        ctx.strokeStyle = pal.primary;
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.ellipse(eyeCx, eyeCy + 1, 7.6, 8.6, 0, 0, Math.PI * 2);
        ctx.stroke();
        drawDot(eyeCx, eyeCy + 1, 3.6, '#000000', 1);
        drawDot(eyeCx - 3, eyeCy - 2.5, 2.4, pal.bright, 1);
        drawDot(eyeCx + 3, eyeCy + 3.5, 1.2, pal.bright, 0.95);
      }
      // Subtle cheek blush micro-dots
      drawDot(cx + side * 26, cy + 10, 1.3, pal.primary, 0.45);
      drawDot(cx + side * 30, cy + 9, 1.2, pal.primary, 0.42);
    }

    // Expressive anime mouth: lock chevron, reactive dot equalizer, or 'w' smile
    if (orbMode === 'conflict') {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pal.bright;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy + 23);
      ctx.lineTo(cx, cy + 15);
      ctx.lineTo(cx + 15, cy + 23);
      ctx.stroke();
    } else if (orbMode === 'listening' || orbMode === 'speaking') {
      for (let b = -2; b <= 2; b++) {
        const wave = Math.abs(Math.sin(opts.timeSec * 8 + b * 0.9));
        const dotRows = Math.max(1, Math.min(3, Math.round(1 + (amp * 1.4 + breathe * 1.1) * wave)));
        for (let r = 0; r < dotRows; r++) {
          const offset = (r - (dotRows - 1) / 2) * 4.8;
          drawDot(cx + b * 7.5, cy + 20 + offset, 2.1, b === 0 ? pal.bright : pal.primary, 0.95);
        }
      }
    } else {
      for (const [mx, my, mr] of [
        [-8, 18, 1.5],
        [-5, 21, 1.8],
        [-2, 21.5, 1.8],
        [0, 19, 1.9],
        [2, 21.5, 1.8],
        [5, 21, 1.8],
        [8, 18, 1.5],
      ] as const) {
        drawDot(cx + mx, cy + my, mr, pal.bright, 0.92);
      }
    }
    ctx.globalAlpha = 1;
  } else {
    // Stepped Bayer 4x4 circular phosphor dot constellation for thinking / armed
    const grid = 11;
    const pitch = 9;
    const dotR = 3.2;
    const half = (grid - 1) / 2;

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const dx = gx - half;
        const dy = gy - half;
        const dist = Math.hypot(dx, dy);
        if (dist > half + 0.25) continue;

        const normDist = dist / half;
        const ang = Math.atan2(dy, dx);
        let alpha = 0.25;

        if (orbMode === 'thinking') {
          const scan = Math.cos(ang - opts.timeSec * 4.5);
          alpha = scan > 0.35 ? 0.98 : 0.22 + (1 - normDist) * 0.35;
        } else {
          alpha = 0.78 - normDist * 0.28;
        }

        drawDot(
          cx + dx * pitch,
          cy + dy * pitch,
          dotR,
          (gx + gy) % 3 === 0 ? pal.secondary : pal.primary,
          Math.max(0.12, Math.min(1, alpha)),
        );
      }
    }
    ctx.globalAlpha = 1;
  }

  // 2. Concentric 24-dot phosphor reticle / 2.0s Undo Countdown Ring around orb
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
    const px = cx + Math.cos(ang) * radius;
    const py = cy + Math.sin(ang) * radius;
    drawDot(px, py, i < litCount ? 3 : 2, i < litCount ? pal.primary : 'rgba(52, 245, 126, 0.22)', 1);
  }
  ctx.globalAlpha = 1;

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
  grad.addColorStop(0.32, 'rgba(139, 255, 181, 0.85)');
  grad.addColorStop(0.68, 'rgba(52, 245, 126, 0.28)');
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
