/** Pure helpers for BinaryField and the lens text decode. No DOM, so they run under vitest in node. */

export interface Pt {
  x: number;
  y: number;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Small seeded PRNG so a field rebuilds to the same layout on every resize. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 0 or 1 for a cell and a time tick. */
export function bitAt(a: number, b: number, tick: number): 0 | 1 {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(tick | 0, 83492791);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h & 1) as 0 | 1;
}

/**
 * Left-to-right binary reveal: characters past `decode` (0..1) show as 0/1, the rest are real.
 * Length never changes, spaces are kept.
 */
export function decodeText(text: string, decode: number, tick: number): string {
  if (decode >= 1) return text;
  const reveal = Math.floor(clamp01(decode) * text.length);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += ch === ' ' || i < reveal ? ch : String(bitAt(i, text.length, tick));
  }
  return out;
}

/**
 * Evenly strided points (normalised 0..1) from the opaque pixels of an RGBA mask.
 * Returns at most `max` points, shuffled so partial reveals look organic.
 */
export function samplePoints(
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  max: number,
  rand: () => number,
): { points: Pt[]; step: number } {
  let on = 0;
  for (let i = 3; i < w * h * 4; i += 4) if (rgba[i] > 128) on++;
  if (on === 0 || max <= 0) return { points: [], step: 1 };
  const step = Math.max(1, Math.sqrt(on / max));
  const points: Pt[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const px = Math.floor(x);
      const py = Math.floor(y);
      if (rgba[(py * w + px) * 4 + 3] > 128) points.push({ x: (px + 0.5) / w, y: (py + 0.5) / h });
    }
  }
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [points[i], points[j]] = [points[j], points[i]];
  }
  return { points: points.slice(0, max), step };
}

export interface PathLut {
  /** Approximate total length in pixels (for bit counts and speed). */
  length: number;
  /** Position and unit normal at u in [0,1), wrapping. u is the polyline fraction, so it does not depend on w/h. */
  at: (u: number) => { x: number; y: number; nx: number; ny: number };
}

/**
 * Closed polyline scaled to w x h pixels. u is parametrised by point index, never by pixel length,
 * so a DOM label placed at at(u) on a 1x1 path lines up with bits drawn on the real canvas.
 */
export function makeClosedPath(points: Pt[], w: number, h: number): PathLut {
  const n = points.length;
  let length = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    length += Math.hypot((b.x - a.x) * w, (b.y - a.y) * h);
  }
  const at = (u: number) => {
    const t = (((u % 1) + 1) % 1) * n;
    const i = Math.floor(t);
    const f = t - i;
    const a = points[i % n];
    const b = points[(i + 1) % n];
    const dx = (b.x - a.x) * w;
    const dy = (b.y - a.y) * h;
    const len = Math.hypot(dx, dy) || 1;
    return { x: (a.x + (b.x - a.x) * f) * w, y: (a.y + (b.y - a.y) * f) * h, nx: -dy / len, ny: dx / len };
  };
  return { length, at };
}

/**
 * Rounded-square loop (normalised 0..1), top first, clockwise on screen, resampled so points are
 * evenly spaced for a 16:9 stage (bits then look evenly spread without per-frame arc-length work).
 */
export function loopPoints(count: number, cx = 0.5, cy = 0.5, rx = 0.4, ry = 0.36, squareness = 2.7): Pt[] {
  const dense = 720;
  const e = 2 / squareness;
  const raw: Pt[] = [];
  for (let i = 0; i < dense; i++) {
    const t = -Math.PI / 2 + (i / dense) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    raw.push({ x: cx + rx * Math.sign(c) * Math.abs(c) ** e, y: cy + ry * Math.sign(s) * Math.abs(s) ** e });
  }
  const cum = [0];
  for (let i = 1; i <= dense; i++) {
    const a = raw[i - 1];
    const b = raw[i % dense];
    cum.push(cum[i - 1] + Math.hypot((b.x - a.x) * 16, (b.y - a.y) * 9));
  }
  const total = cum[dense];
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (j < dense - 1 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    const a = raw[j];
    const b = raw[(j + 1) % dense];
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}
