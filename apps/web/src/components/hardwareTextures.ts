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
    // Subtle Matrix vertical dot rain columns framing character
    for (const [colIdx, mx] of [-52, -44, 44, 52].entries()) {
      const yHead = -30 + ((opts.timeSec * 36 + colIdx * 19) % 62);
      drawDot(cx + mx, cy + yHead, 1.5, pal.bright, 0.72);
      drawDot(cx + mx, cy + yHead - 8, 1.2, pal.primary, 0.35);
      drawDot(cx + mx, cy + yHead - 16, 1.0, pal.secondary, 0.16);
    }

    // Spiky Jujutsu Kaisen dot-matrix hair spikes + jagged bangs + high-collar outline
    for (const [deg, outerR, a] of [
      [-150, 44, 0.56],
      [-132, 52, 0.72],
      [-115, 45, 0.55],
      [-98, 54, 0.78],
      [-82, 46, 0.6],
      [-66, 52, 0.72],
      [-48, 44, 0.55],
      [-32, 48, 0.62],
    ] as const) {
      const rad = (deg * Math.PI) / 180;
      const bx = cx + Math.cos(rad) * 37;
      const by = cy - 2 + Math.sin(rad) * 34;
      const tx = cx + Math.cos(rad) * outerR;
      const ty = cy - 2 + Math.sin(rad) * outerR;
      drawDot(bx, by, 2.0, pal.primary, a * 0.7);
      drawDot((bx + tx) / 2, (by + ty) / 2, 1.8, pal.primary, a * 0.85);
      drawDot(tx, ty, 1.6, pal.bright, a);
    }
    for (const [bx, by, br, ba] of [
      [-23, -29, 1.9, 0.58], [-19, -22, 1.5, 0.42],
      [-8, -32, 2.0, 0.65], [-6, -24, 1.6, 0.48],
      [6, -32, 2.0, 0.68], [8, -24, 1.6, 0.48],
      [21, -29, 1.9, 0.58], [23, -22, 1.5, 0.42],
    ] as const) {
      drawDot(cx + bx, cy + by, br, pal.primary, ba);
    }
    // JJK sorcerer high-collar uniform V-line under chin
    for (const side of [-1, 1] as const) {
      drawDot(cx + side * 32, cy + 8, 1.5, pal.primary, 0.38);
      drawDot(cx + side * 26, cy + 20, 1.7, pal.primary, 0.42);
      drawDot(cx + side * 22, cy + 32, 2.0, pal.primary, 0.65);
      drawDot(cx + side * 14, cy + 36, 1.9, pal.primary, 0.58);
      drawDot(cx + side * 6, cy + 40, 1.7, pal.primary, 0.46);
    }

    // Blindfold when idle -> radiant JJK Six Eyes reveal when listening / speaking / conflict
    const blink = orbMode === 'listening' && opts.timeSec % 4.4 > 4.22;
    const blindfolded = orbMode === 'idle';
    if (blindfolded) {
      ctx.globalAlpha = 0.86;
      ctx.fillStyle = '#031208';
      ctx.strokeStyle = pal.primary;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(cx - 33, cy - 13, 66, 17, 5);
      ctx.fill();
      ctx.stroke();
      const pulse = 0.45 + 0.55 * Math.sin(opts.timeSec * 3.4);
      drawDot(cx - 17, cy - 5, 2.3, pal.bright, pulse);
      drawDot(cx + 17, cy - 5, 2.3, pal.bright, pulse);
    } else {
      for (const side of [-1, 1] as const) {
        const eyeCx = cx + side * 18;
        const eyeCy = cy - 4;
        if (blink) {
          ctx.globalAlpha = 0.95;
          ctx.strokeStyle = pal.bright;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(eyeCx - 9, eyeCy);
          ctx.lineTo(eyeCx + 9, eyeCy);
          ctx.stroke();
        } else if (orbMode === 'conflict') {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = pal.bright;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(eyeCx - 9, eyeCy - 10 - side * 3);
          ctx.lineTo(eyeCx + 9, eyeCy - 10 + side * 3);
          ctx.stroke();
          drawDot(eyeCx, eyeCy, 6.2, pal.primary, 0.94);
          drawDot(eyeCx, eyeCy, 2.4, '#000000', 1);
          drawDot(eyeCx - 2, eyeCy - 2, 1.8, pal.bright, 1);
        } else {
          ctx.globalAlpha = 0.98;
          ctx.strokeStyle = pal.bright;
          ctx.lineWidth = 2.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(eyeCx - 9.5, eyeCy - 5);
          ctx.quadraticCurveTo(eyeCx, eyeCy - 11.5, eyeCx + 9.5, eyeCy - 5);
          ctx.stroke();
          drawDot(eyeCx + side * 11, eyeCy - 6.5, 1.5, pal.primary, 0.92);
          ctx.strokeStyle = pal.primary;
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.ellipse(eyeCx, eyeCy, 7.6, 6.4, 0, 0, Math.PI * 2);
          ctx.stroke();
          drawDot(eyeCx, eyeCy, 3.3, '#000000', 1);
          drawDot(eyeCx - 2.6, eyeCy - 2, 2.2, pal.bright, 1);
          drawDot(eyeCx + 2.6, eyeCy + 2.2, 1.2, pal.bright, 0.95);
        }
      }
    }

    // Real-time JJK lip-sync mouth driven by activeWord / speech wave / RMS
    if (orbMode === 'conflict') {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pal.bright;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy + 22);
      ctx.lineTo(cx, cy + 14);
      ctx.lineTo(cx + 14, cy + 22);
      ctx.stroke();
    } else if (orbMode === 'listening' || orbMode === 'speaking') {
      const w = (opts.activeWord ?? '').toLowerCase();
      const openH =
        orbMode === 'speaking'
          ? /[ao]/.test(w)
            ? 6.5
            : /[u]/.test(w)
              ? 5.0
              : 2.5 + 3.8 * Math.abs(Math.sin(opts.timeSec * 12))
          : 1.8 + amp * 5.2;
      const openW = /[u]/.test(w) ? 5.5 : 8.5 + breathe * 1.8;
      ctx.globalAlpha = 0.96;
      ctx.strokeStyle = pal.bright;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 18, openW, Math.max(1.5, openH), 0, 0, Math.PI * 2);
      ctx.stroke();
      drawDot(cx, cy + 18, Math.max(1, openH * 0.45), pal.primary, 0.55);
    } else {
      // Cool subtle smirk
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = pal.bright;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy + 18);
      ctx.quadraticCurveTo(cx + 1, cy + 21, cx + 9, cy + 16);
      ctx.stroke();
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
