import { encodeGray4Png, renderCountdownRing } from './pngRing.js';
import type { RingRenderStats } from './pngRing.js';
import type { AliveMood } from './liveUi.js';
import type { VoiceOrbState } from './types.js';

export type PixelAvatarStyle = 'orb' | 'muse' | 'duet' | 'dots';

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * Renders a 76x76 4-bit grayscale PNG avatar (Muse / Claude Duet / ChatGPT Dots) for Even G2.
 * Preserves >= 75% pure-black (0x0) pixels for crystal waveguide legibility.
 */
export function renderPixelAvatar(
  state: VoiceOrbState,
  opts: {
    tick?: number;
    rmsLevel?: number;
    armProgress01?: number;
    style?: PixelAvatarStyle;
    mood?: AliveMood;
    size?: number;
  } = {},
): RingRenderStats {
  const size = opts.size ?? 76;
  if (state === 'armed') {
    return renderCountdownRing(opts.armProgress01 ?? 0.5, size);
  }

  const style: PixelAvatarStyle = opts.style ?? 'orb';
  const mood: AliveMood = opts.mood ?? 'neutral';
  const tick = opts.tick ?? 0;
  const rms = Math.max(0, Math.min(1, Number.isFinite(opts.rmsLevel) ? (opts.rmsLevel as number) : 0));
  const rowBytes = 1 + Math.ceil(size / 2);
  const raw = new Uint8Array(rowBytes * size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  let blackPixels = 0;

  const setPixel = (px: number, py: number, val: number) => {
    const x = Math.round(px);
    const y = Math.round(py);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const rowStart = y * rowBytes;
    const byteIdx = rowStart + 1 + (x >> 1);
    const nib = Math.max(0, Math.min(15, Math.round(val)));
    if ((x & 1) === 0) {
      raw[byteIdx] = (raw[byteIdx] & 0x0f) | (nib << 4);
    } else {
      raw[byteIdx] = (raw[byteIdx] & 0xf0) | nib;
    }
  };

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0;
  }

  if (style === 'orb') {
    // Sleek Meta-style minimal monochrome Voice Orb (preserves >= 78% pure-black waveguide field)
    const breathe = Math.sin(tick * 0.45) * 1.4;
    const coreR = (state === 'speaking' ? 11.5 + rms * 5.2 : state === 'listening' ? 10.5 + rms * 4.5 : 9.5) + breathe * 0.5;
    const outerR = Math.min(size * 0.44, coreR + (state === 'listening' || state === 'speaking' ? 12 + rms * 5 : 9.5));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const bayer = BAYER_4[y & 3][x & 3] / 16;

        // 1. Soft dithered glowing inner sphere (crisp bright rim, airy translucent center)
        if (dist <= coreR) {
          const norm = dist / Math.max(1, coreR);
          const edgeGlow = Math.pow(norm, 1.55);
          const energy = (0.35 + 0.65 * edgeGlow) * (state === 'conflict' ? 0.95 : 1.0);
          if (energy > bayer * 0.85 || Math.abs(dist - coreR) < 1.2) {
            setPixel(x, y, Math.min(15, Math.round(5 + energy * 10)));
          }
          continue;
        }

        // 2. Orbiting tilted energy filament (Meta / Siri style fluid ring)
        const rot = tick * (state === 'thinking' ? 0.35 : 0.16);
        const ex = dx * Math.cos(rot) - dy * Math.sin(rot);
        const ey = (dx * Math.sin(rot) + dy * Math.cos(rot)) * 1.65;
        const ellip = Math.hypot(ex, ey);
        const ellipTarget = coreR + 6.5 + Math.sin(ang * 2 + rot) * 1.1;
        if (Math.abs(ellip - ellipTarget) < 1.15) {
          setPixel(x, y, state === 'speaking' || state === 'listening' ? 14 : 10);
          continue;
        }

        // 3. Outer voice-reactive acoustic halo ripple
        if (Math.abs(dist - outerR) < 1.0) {
          const wave = state === 'thinking'
            ? Math.cos(ang - tick * 0.55) > -0.15
            : state === 'conflict'
              ? Math.floor((ang + Math.PI) / 0.4) % 2 === 0
              : Math.sin(ang * 6 + tick * 0.4) > -0.45;
          if (wave) {
            setPixel(x, y, state === 'listening' || state === 'speaking' ? 12 : 7);
          }
        }
      }
    }

    // 4. Compact 5-bar live voice equalizer beneath the orb when listening or speaking
    if (state === 'listening' || state === 'speaking') {
      const bars = [-12, -6, 0, 6, 12];
      bars.forEach((bx, idx) => {
        const amp = Math.max(2, Math.round((0.35 + 0.65 * rms) * (5 + 4 * Math.abs(Math.sin(tick * 0.7 + idx * 1.1)))));
        for (let h = -amp; h <= amp; h++) {
          setPixel(cx + bx, cy + coreR + 14 + h * 0.45, idx === 2 ? 15 : 11);
        }
      });
    }
  } else if (style === 'muse') {
    const plotDot2 = (px: number, py: number, v: number) => {
      setPixel(px, py, v);
      setPixel(px + 1, py, Math.round(v * 0.88));
      setPixel(px, py + 1, Math.round(v * 0.88));
      setPixel(px + 1, py + 1, Math.round(v * 0.72));
    };

    const drawSparkle = (sx: number, sy: number, v: number) => {
      setPixel(sx, sy, v);
      setPixel(sx - 1, sy, Math.round(v * 0.72));
      setPixel(sx + 1, sy, Math.round(v * 0.72));
      setPixel(sx, sy - 1, Math.round(v * 0.72));
      setPixel(sx, sy + 1, Math.round(v * 0.72));
      if (v >= 12) {
        setPixel(sx - 2, sy, Math.round(v * 0.35));
        setPixel(sx + 2, sy, Math.round(v * 0.35));
        setPixel(sx, sy - 2, Math.round(v * 0.35));
        setPixel(sx, sy + 2, Math.round(v * 0.35));
      }
    };

    // 1. Sleek Matrix dotted halo around JJK Sorcerer (preserves >= 83% optical black)
    const ringR = size * 0.455;
    const segs = 28;
    const phaseShift = state === 'thinking' ? tick % segs : 0;
    for (let i = 0; i < segs; i++) {
      const idx = (i + phaseShift) % segs;
      const a = -Math.PI / 2 + (idx / segs) * Math.PI * 2;
      const lit =
        state === 'conflict'
          ? i % 2 === 0
          : state === 'thinking'
            ? i < 11
            : i % 2 === 0 || state === 'speaking' || state === 'listening';
      if (!lit) continue;
      const rx = cx + Math.cos(a) * ringR;
      const ry = cy + Math.sin(a) * ringR;
      const v =
        state === 'thinking'
          ? 15 - i
          : state === 'speaking' || state === 'listening'
            ? i % 2 === 0
              ? 14
              : 8
            : i % 4 === 0
              ? 10
              : 5;
      plotDot2(rx, ry, v);
    }

    // 2. Matrix terminal vertical dot rain + 4-point energy sparkles
    const matrixCols = [-27, -23, 23, 27] as const;
    matrixCols.forEach((mx, ci) => {
      const headY = -18 + ((tick * 4 + ci * 9) % 36);
      setPixel(cx + mx, cy + headY, 13);
      setPixel(cx + mx, cy + headY - 4, 7);
      setPixel(cx + mx, cy + headY - 8, 4);
    });
    const sparkA = tick % 2 === 0 ? 15 : 8;
    const sparkB = tick % 2 === 0 ? 8 : 15;
    drawSparkle(cx - 25, cy - 21, state === 'conflict' ? 12 : sparkA);
    drawSparkle(cx + 25, cy - 17, state === 'conflict' ? 12 : sparkB);
    if (mood === 'determined' || mood === 'excited' || mood === 'proud') {
      drawSparkle(cx + 23, cy + 16, 14);
    }

    // 3. Spiky anime hair crown, jagged bangs, side locks & high-collar coat outline
    const spikes: Array<[number, number, number]> = [
      [-150, 25, 6],
      [-132, 29, 8],
      [-115, 26, 6],
      [-98, 30, 9],
      [-82, 26, 7],
      [-66, 29, 8],
      [-48, 25, 6],
      [-32, 27, 7],
    ];
    for (const [deg, outerR, lv] of spikes) {
      const rad = (deg * Math.PI) / 180;
      const bx = cx + Math.cos(rad) * 21;
      const by = cy - 1 + Math.sin(rad) * 19;
      const tx = cx + Math.cos(rad) * outerR;
      const ty = cy - 1 + Math.sin(rad) * outerR;
      plotDot2(bx, by, Math.max(4, lv - 2));
      setPixel((bx + tx) / 2, (by + ty) / 2, lv);
      setPixel(tx, ty, Math.min(13, lv + 3));
    }

    // Jagged anime bang strands dipping above blindfold / Six Eyes
    const bangStrands: Array<Array<[number, number, number]>> = [
      [[-14, -17, 7], [-12, -14, 6], [-10, -11, 5]],
      [[-6, -18, 8], [-5, -14, 7], [-4, -10, 5]],
      [[3, -18, 9], [4, -14, 7], [5, -10, 5]],
      [[11, -17, 7], [12, -14, 6], [13, -11, 4]],
    ];
    for (const strand of bangStrands) {
      for (const [ox, oy, v] of strand) {
        setPixel(cx + ox, cy + oy, v);
      }
    }

    // Jaw contour + iconic JJK high-collar coat V-neck
    for (const side of [-1, 1]) {
      setPixel(cx + side * 18, cy + 5, 5);
      setPixel(cx + side * 15, cy + 12, 5);
      setPixel(cx + side * 10, cy + 17, 6);
      // High collar outline
      for (const [kx, ky, kv] of [
        [side * 16, 20, 8],
        [side * 12, 22, 9],
        [side * 7, 25, 7],
        [side * 3, 27, 6],
      ] as const) {
        setPixel(cx + kx, cy + ky, kv);
      }
    }
    setPixel(cx, cy + 19, 6);

    // 4. Blindfold (idle) -> Six Eyes Reveal (listening / speaking / thinking / conflict)
    const eyeY = cy - 3;
    const blink = (state === 'listening' || mood === 'amused') && tick % 14 === 13;
    const blindfolded = state === 'idle' && (mood === 'neutral' || mood === 'focused');
    const gazeX = state === 'thinking' || mood === 'curious' ? (tick % 4 < 2 ? 1 : -1) : 0;
    const gazeY = state === 'thinking' ? -1 : 0;

    if (blindfolded) {
      // Sleek Matrix-green dotted blindfold band with pulsing Six-Eyes glint behind
      for (let bx = -16; bx <= 16; bx += 2) {
        setPixel(cx + bx, eyeY - 4, 8);
        setPixel(cx + bx, eyeY, Math.abs(bx) >= 8 && Math.abs(bx) <= 11 ? 13 : 4);
        setPixel(cx + bx, eyeY + 3, 7);
      }
      // Subtle Six-Eyes pinpoints glimmering through fabric
      plotDot2(cx - 10, eyeY - 1, tick % 2 === 0 ? 14 : 9);
      plotDot2(cx + 9, eyeY - 1, tick % 2 === 0 ? 14 : 9);
    } else {
      for (const side of [-1, 1]) {
        const ex = cx + side * 10;
        if (blink) {
          for (let dx = -5; dx <= 5; dx++) {
            setPixel(ex + dx, eyeY, 14);
          }
        } else if (state === 'conflict') {
          for (let i = -4; i <= 4; i++) {
            const browY = eyeY - 6 + Math.round((i * -side) / 2);
            setPixel(ex + i, browY, 15);
          }
          for (let dx = -4; dx <= 4; dx++) {
            setPixel(ex + dx, eyeY - 2, 15);
            setPixel(ex + dx, eyeY + 2, 10);
          }
          setPixel(ex - 1, eyeY, 15);
        } else {
          // Sharp JJK Six-Eyes slanted upper lash + geometric iris ring + radiant catchlights
          for (let dx = -5; dx <= 5; dx++) {
            const slant = side === -1 ? Math.round(dx * 0.18) : -Math.round(dx * 0.18);
            const arch = Math.abs(dx) >= 4 ? 1 : 0;
            setPixel(ex + dx, eyeY - 4 + arch + slant, 15);
          }
          setPixel(ex + side * 6, eyeY - 4, 13);
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
              const nr = Math.hypot(dx / 4.2, dy / 3.4);
              if (nr > 1.0) continue;
              const pupilD = Math.hypot(dx - gazeX, dy - gazeY);
              if (pupilD <= 1.55) continue; // deep black pupil
              setPixel(ex + dx, eyeY + dy, nr > 0.72 ? 12 : 9);
            }
          }
          plotDot2(ex - 2 + gazeX, eyeY - 2 + gazeY, 15);
          setPixel(ex + 2 + gazeX, eyeY + 2 + gazeY, 14);
        }
      }
    }

    // 5. Real-time Viseme Lip-Sync Mouth (syllable cadence on speaking/listening)
    const mouthY = cy + 11;
    if (state === 'conflict') {
      for (let i = -7; i <= 7; i++) {
        setPixel(cx + i, mouthY + Math.abs(Math.round(i / 2)) - 2, 15);
      }
    } else if (state === 'speaking' || state === 'listening') {
      const visemePhase = state === 'speaking' ? tick % 4 : rms > 0.5 ? 1 : rms > 0.2 ? 2 : 0;
      if (visemePhase === 0) {
        // Closed consonant transition / quick bar
        for (let i = -5; i <= 5; i += 1) {
          setPixel(cx + i, mouthY, 14);
        }
      } else if (visemePhase === 1) {
        // Wide open vowel oval (aa/ah)
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            if (Math.hypot(dx / 5.2, dy / 2.2) <= 1 && Math.hypot(dx / 3.2, dy / 1.2) > 0.9) {
              setPixel(cx + dx, mouthY + dy, 15);
            }
          }
        }
      } else if (visemePhase === 2) {
        // Rounded 'o' vowel ring
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const d = Math.hypot(dx, dy);
            if (d >= 1.5 && d <= 3.1) setPixel(cx + dx, mouthY + dy, 15);
          }
        }
      } else {
        // Half-open horizontal lip-sync
        for (let i = -6; i <= 6; i++) {
          setPixel(cx + i, mouthY - 1, 14);
          setPixel(cx + i, mouthY + 1, 11);
        }
      }
    } else if (state === 'thinking') {
      for (const b of [-1, 0, 1]) {
        const bob = (tick + b + 1) % 3 === 0 ? -1 : 0;
        plotDot2(cx + b * 4 - 0.5, mouthY + bob, b === 0 ? 15 : 10);
      }
    } else {
      // Confident JJK smirk in crisp dots
      for (const [mx, my, v] of [
        [-4, 1, 9],
        [-2, 1, 12],
        [0, 1, 14],
        [2, 0, 14],
        [4, -1, 13],
      ] as const) {
        setPixel(cx + mx, mouthY + my, v);
      }
    }
  } else {
    // Claude Duet / ChatGPT stepped circular dot-matrix constellation
    const grid = 11;
    const pitch = 5;
    const half = (grid - 1) / 2;
    const amp = Math.min(1, rms * 5.5);
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const dx = gx - half;
        const dy = gy - half;
        const dist = Math.hypot(dx, dy);
        if (dist > half + 0.25) continue;
        const bayer = BAYER_4[gy % 4][gx % 4] / 16;
        const wave = Math.sin(dist * 0.85 - tick * 0.7);
        let intensity = 0;
        if (style === 'dots') {
          const rRatio = dist / half;
          intensity = rRatio < 0.62 + amp * 0.32 + wave * 0.12 ? 15 - bayer * 7 : 0;
        } else {
          intensity = bayer + wave * 0.2 + amp * 0.35 > 0.62 ? 14 : 0;
        }
        if (intensity > 2) {
          const px = cx + dx * pitch;
          const py = cy + dy * pitch;
          setPixel(px, py, intensity);
          setPixel(px + 1, py, Math.round(intensity * 0.8));
          setPixel(px, py + 1, Math.round(intensity * 0.8));
        }
      }
    }
  }

  // Count pure-black pixels to guarantee >= 75% transparent optical budget
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowBytes;
    for (let x = 0; x < size; x++) {
      const byte = raw[rowStart + 1 + (x >> 1)];
      const nib = (x & 1) === 0 ? (byte >> 4) & 0x0f : byte & 0x0f;
      if (nib === 0) blackPixels++;
    }
  }

  return encodeGray4Png(raw, size, size, blackPixels);
}

export function encodePixelAvatarPng(
  state: VoiceOrbState,
  opts: {
    tick?: number;
    rmsLevel?: number;
    armProgress01?: number;
    style?: PixelAvatarStyle;
    mood?: AliveMood;
    size?: number;
  } = {},
): Uint8Array {
  return renderPixelAvatar(state, opts).pngBytes;
}

/**
 * Renders a compact monochrome green JJK Six-Eyes corner marker PNG (28x28)
 * equivalent to an always-on Alive Engine presence glyph in the G2 top-right margin.
 */
export function encodeCornerMarkerPng(mood: AliveMood = 'neutral', tick = 0): Uint8Array {
  const size = 28;
  const rowBytes = 1 + Math.ceil(size / 2);
  const raw = new Uint8Array(rowBytes * size);
  let black = size * size;

  const plot = (px: number, py: number, val: number) => {
    const x = Math.round(px);
    const y = Math.round(py);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const byteIdx = y * rowBytes + 1 + (x >> 1);
    const prev = (x & 1) === 0 ? (raw[byteIdx] >> 4) & 0x0f : raw[byteIdx] & 0x0f;
    if (prev === 0 && val > 0) black--;
    const nib = Math.max(0, Math.min(15, Math.round(val)));
    if ((x & 1) === 0) {
      raw[byteIdx] = (raw[byteIdx] & 0x0f) | (nib << 4);
    } else {
      raw[byteIdx] = (raw[byteIdx] & 0xf0) | nib;
    }
  };

  // Six-Eyes twin glow points + spiky crown accents
  const cx = 13.5;
  const cy = 14;
  const pulse = tick % 2 === 0 ? 15 : 10;
  plot(cx - 5, cy - 1, pulse);
  plot(cx - 4, cy - 1, 12);
  plot(cx + 4, cy - 1, 12);
  plot(cx + 5, cy - 1, pulse);
  // Crown points
  plot(cx - 6, cy - 8, 9);
  plot(cx, cy - 10, 12);
  plot(cx + 6, cy - 8, 9);
  // Mood mouth accent
  if (mood === 'excited' || mood === 'amused' || mood === 'proud') {
    plot(cx - 2, cy + 5, 11);
    plot(cx, cy + 6, 14);
    plot(cx + 2, cy + 5, 11);
  } else {
    plot(cx - 2, cy + 5, 9);
    plot(cx + 2, cy + 5, 9);
  }
  return encodeGray4Png(raw, size, size, Math.max(0, black)).pngBytes;
}
