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

    // 1. Sleek dotted waveguide halo around the Anime Companion (high optical black >= 83%)
    const ringR = size * 0.445;
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

    // 2. Twinkling 4-point anime sparkles framing the companion
    const sparkA = tick % 2 === 0 ? 15 : 8;
    const sparkB = tick % 2 === 0 ? 8 : 15;
    drawSparkle(cx - 25, cy - 18, state === 'conflict' ? 12 : sparkA);
    drawSparkle(cx + 25, cy - 14, state === 'conflict' ? 12 : sparkB);

    // 3. Swept dot-matrix anime hair crown, parted bangs, side locks & chin whisper dots
    for (let deg = -156; deg <= -24; deg += 11) {
      const rad = (deg * Math.PI) / 180;
      const hx = cx + Math.cos(rad) * 24;
      const hy = cy + 1 + Math.sin(rad) * 22;
      plotDot2(hx, hy, 7);
    }
    // Airy second hair dot shimmer along bangs root
    for (let deg = -140; deg <= -40; deg += 20) {
      const rad = (deg * Math.PI) / 180;
      setPixel(cx + Math.cos(rad) * 20, cy + 1 + Math.sin(rad) * 18, 5);
    }
    // Signature cyber hairpin dot accent on upper right
    plotDot2(cx + 13, cy - 20, 12);
    setPixel(cx + 16, cy - 19, 10);

    // Three tapered swept anime bang strands dipping above forehead
    const bangStrands: Array<Array<[number, number, number]>> = [
      [
        [-12, -18, 7],
        [-10, -15, 6],
        [-8, -12, 4],
      ],
      [
        [-2, -19, 8],
        [-1, -16, 7],
        [0, -13, 6],
        [1, -10, 4],
      ],
      [
        [9, -18, 7],
        [10, -15, 6],
        [11, -12, 4],
      ],
    ];
    for (const strand of bangStrands) {
      for (const [ox, oy, v] of strand) {
        setPixel(cx + ox, cy + oy, v);
        setPixel(cx + ox + 1, cy + oy, Math.round(v * 0.7));
      }
    }

    // Framing cheek hair side-locks & subtle chin dot contour
    for (const side of [-1, 1]) {
      for (const [dy, dxOff, v] of [
        [-8, 21, 7],
        [-3, 21, 6],
        [2, 20, 6],
        [7, 19, 5],
        [12, 18, 4],
      ] as const) {
        setPixel(cx + side * dxOff, cy + dy, v);
        setPixel(cx + side * (dxOff - 1), cy + dy + 1, Math.round(v * 0.65));
      }
    }
    for (const [jx, jy, v] of [
      [-12, 18, 4],
      [-6, 21, 4],
      [0, 22, 5],
      [6, 21, 4],
      [12, 18, 4],
    ] as const) {
      setPixel(cx + jx, cy + jy, v);
    }

    // 4. Sculpted expressive anime dot-matrix eyes + dual catchlights
    const eyeY = cy - 2;
    const blink = state === 'idle' && tick % 12 === 11;
    const gazeX = state === 'thinking' ? (tick % 4 < 2 ? 1 : -1) : 0;
    const gazeY = state === 'thinking' ? -1 : 0;

    for (const side of [-1, 1]) {
      const ex = cx + side * 10;
      if (blink) {
        for (let dx = -4; dx <= 4; dx++) {
          const arcY = eyeY + (Math.abs(dx) >= 3 ? -1 : 1);
          setPixel(ex + dx, arcY, 15);
          setPixel(ex + dx, arcY + 1, 9);
        }
        setPixel(ex + side * 5, eyeY - 2, 11);
      } else if (state === 'conflict') {
        // Sharp angled anime brow + focused eyes
        for (let i = -4; i <= 4; i++) {
          const browY = eyeY - 7 + Math.round((i * -side) / 2.2);
          setPixel(ex + i, browY, 15);
          setPixel(ex + i, browY + 1, 10);
        }
        for (let dx = -4; dx <= 4; dx++) {
          setPixel(ex + dx, eyeY - 2, 14);
          setPixel(ex + dx, eyeY + 2, 9);
        }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            setPixel(ex + dx, eyeY + dy, Math.abs(dx) <= 1 ? 0 : 12);
          }
        }
        setPixel(ex - 1, eyeY - 1, 15);
      } else {
        // Upper glowing eyelash curve + outer anime wing flick
        for (let dx = -5; dx <= 5; dx++) {
          const arch = Math.abs(dx) >= 4 ? 2 : Math.abs(dx) >= 3 ? 1 : 0;
          setPixel(ex + dx, eyeY - 5 + arch, 15);
          if (Math.abs(dx) <= 4) {
            setPixel(ex + dx, eyeY - 4 + arch, 11);
          }
        }
        setPixel(ex + side * 6, eyeY - 4, 13);
        // Dot-shaded oval iris with pure-black central pupil void
        for (let dy = -3; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const nr = Math.hypot(dx / 4.2, (dy - 0.5) / 4.2);
            if (nr > 1.02) continue;
            const pupilD = Math.hypot(dx - gazeX, dy - 0.5 - gazeY);
            if (pupilD <= 1.6) continue; // keep pupil deep obsidian 0x0
            const v = dy >= 2 ? 12 : dy <= -2 ? 11 : nr > 0.78 ? 9 : 6;
            setPixel(ex + dx, eyeY + dy, v);
          }
        }
        // Lower eyelid whisper dot
        setPixel(ex - 1, eyeY + 5, 6);
        setPixel(ex + 1, eyeY + 5, 6);
        // Gleaming anime catchlight sparkles
        plotDot2(ex - 2 + gazeX, eyeY - 2 + gazeY, 15);
        setPixel(ex + 2 + gazeX, eyeY + 2 + gazeY, 14);
      }

      // Delicate cheek blush micro-dots
      setPixel(cx + side * 14, cy + 5, 6);
      setPixel(cx + side * 16, cy + 4, 5);
      setPixel(cx + side * 17, cy + 5, 4);
    }

    // 5. Expressive anime dot-matrix mouth / audio wave
    const mouthY = cy + 12;
    if (state === 'conflict') {
      for (let i = -7; i <= 7; i++) {
        setPixel(cx + i, mouthY + Math.abs(Math.round(i / 2)) - 2, 15);
        setPixel(cx + i, mouthY + Math.abs(Math.round(i / 2)) - 1, 10);
      }
    } else if (state === 'listening' || state === 'speaking') {
      const amp = Math.max(2, Math.round((state === 'speaking' ? 0.52 + 0.4 * Math.sin(tick * 1.4) : rms * 5) * 5));
      for (let b = -2; b <= 2; b++) {
        const bx = cx + b * 4;
        const bh = Math.max(1, Math.min(5, amp - Math.abs(b)));
        for (let dy = -bh; dy <= bh; dy += 2) {
          const v = dy === 0 ? 15 : 10;
          plotDot2(bx - 0.5, mouthY + dy - 0.5, v);
        }
      }
    } else if (state === 'thinking') {
      for (const b of [-1, 0, 1]) {
        const bob = (tick + b + 1) % 3 === 0 ? -1 : 0;
        plotDot2(cx + b * 4 - 0.5, mouthY + bob, b === 0 ? 15 : 10);
      }
    } else {
      // Sleek anime 'w' cat smile in phosphor dots
      for (const [mx, my, v] of [
        [-4, -1, 10],
        [-3, 0, 13],
        [-2, 1, 14],
        [-1, 0, 12],
        [0, -1, 14],
        [1, 0, 12],
        [2, 1, 14],
        [3, 0, 13],
        [4, -1, 10],
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
    size?: number;
  } = {},
): Uint8Array {
  return renderPixelAvatar(state, opts).pngBytes;
}
