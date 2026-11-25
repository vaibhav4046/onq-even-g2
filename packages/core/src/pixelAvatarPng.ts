import { encodeGray4Png, renderCountdownRing } from './pngRing.js';
import type { RingRenderStats } from './pngRing.js';
import type { VoiceOrbState } from './types.js';

export type PixelAvatarStyle = 'muse' | 'duet' | 'dots';

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
    size?: number;
  } = {},
): RingRenderStats {
  const size = opts.size ?? 76;
  if (state === 'armed') {
    return renderCountdownRing(opts.armProgress01 ?? 0.5, size);
  }

  const style: PixelAvatarStyle = opts.style ?? 'muse';
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

  if (style === 'muse') {
    // Minimal outer crisp corners / ring pip (high black ratio >= 85%)
    const ringR = size * 0.39;
    const segs = 24;
    const phaseShift = state === 'thinking' ? tick % segs : 0;
    for (let i = 0; i < segs; i++) {
      const idx = (i + phaseShift) % segs;
      const a = (idx / segs) * Math.PI * 2;
      const lit =
        state === 'conflict'
          ? i % 2 === 0
          : state === 'thinking'
            ? i < 10
            : i % 3 !== 2;
      if (!lit) continue;
      const rx = cx + Math.cos(a) * ringR;
      const ry = cy + Math.sin(a) * ringR;
      const v = state === 'speaking' || state === 'listening' ? 14 : 9;
      setPixel(rx, ry, v);
      setPixel(rx + 1, ry, v);
      setPixel(rx, ry + 1, v);
    }

    // Muse retro pixel eyes
    const eyeY = cy - 7;
    const blink = state === 'idle' && tick % 12 === 11;
    const eyeH = blink ? 1 : state === 'listening' ? 9 : 7;
    for (const side of [-1, 1]) {
      const ex = cx + side * 10;
      for (let dy = -Math.floor(eyeH / 2); dy <= Math.floor(eyeH / 2); dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const val = dy === 0 && !blink && state === 'thinking' ? 10 : 15;
          setPixel(ex + dx, eyeY + dy, val);
        }
      }
    }

    // Dynamic Muse pixel mouth / audio bar expression
    const mouthY = cy + 9;
    if (state === 'conflict') {
      // Warning chevron
      for (let i = -8; i <= 8; i++) {
        setPixel(cx + i, mouthY + Math.abs(Math.round(i / 2)) - 2, 15);
        setPixel(cx + i, mouthY + Math.abs(Math.round(i / 2)) - 1, 12);
      }
    } else if (state === 'listening' || state === 'speaking') {
      const amp = Math.max(2, Math.round((state === 'speaking' ? 0.55 + 0.4 * Math.sin(tick * 1.4) : rms * 5) * 6));
      for (let b = -3; b <= 3; b++) {
        const bx = cx + b * 4;
        const bh = Math.max(1, Math.min(7, amp - Math.abs(b)));
        for (let dy = -bh; dy <= bh; dy++) {
          setPixel(bx, mouthY + dy, 15);
          setPixel(bx + 1, mouthY + dy, 12);
        }
      }
    } else {
      // Calm pixel smile
      for (let i = -7; i <= 7; i++) {
        const yOff = Math.abs(i) >= 5 ? -2 : 0;
        setPixel(cx + i, mouthY + yOff, 13);
        setPixel(cx + i, mouthY + yOff + 1, 9);
      }
    }
  } else {
    // Claude Duet / ChatGPT stepped dot matrix constellation
    const grid = 9;
    const pitch = 6;
    const half = (grid - 1) / 2;
    const amp = Math.min(1, rms * 5.5);
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const dx = gx - half;
        const dy = gy - half;
        const dist = Math.hypot(dx, dy);
        if (dist > half + 0.25) continue;
        const bayer = BAYER_4[gy % 4][gx % 4] / 16;
        const wave = Math.sin(dist * 0.9 - tick * 0.7);
        let intensity = 0;
        if (style === 'dots') {
          const rRatio = dist / half;
          intensity = rRatio < 0.65 + amp * 0.35 + wave * 0.12 ? 15 - bayer * 6 : 0;
        } else {
          intensity = bayer + wave * 0.2 + amp * 0.4 > 0.58 ? 14 : 0;
        }
        if (intensity > 2) {
          const px = cx + dx * pitch;
          const py = cy + dy * pitch;
          setPixel(px, py, intensity);
          setPixel(px + 1, py, intensity);
          setPixel(px, py + 1, intensity);
          setPixel(px + 1, py + 1, intensity);
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
    size?: number;
  } = {},
): Uint8Array {
  return renderPixelAvatar(state, opts).pngBytes;
}
