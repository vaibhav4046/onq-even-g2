import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import { bitAt, clamp01, makeClosedPath, mulberry32, samplePoints } from '../lib/binaryMath';
import type { PathLut, Pt } from '../lib/binaryMath';

/**
 * Monochrome 525nm binary field on a plain 2D canvas.
 *  - rain:   columns of 0/1 drifting down, brighter and faster near the pointer
 *  - form:   bits converge to spell a target (glasses outline or text), then fly outward as the section scrolls away
 *  - stream: bits flow around a closed loop with a bright comet at progressRef (0..1 along the loop)
 * One rAF loop drives every instance. Instances draw only while on screen, the tab is visible,
 * reduced motion is off and the user has not paused motion. Otherwise they draw one static frame.
 */

const LEVELS = 8; // alpha steps; sprite index LEVELS is the bright "head" colour
const ALPHAS = [0.1, 0.18, 0.28, 0.4, 0.54, 0.7, 0.85, 1];
const MAX_DPR = 2;
const MAX_BACKING_PIXELS = 4_000_000;
const POINTER_RADIUS = 150;

/* ---------- glyph atlas: 0 and 1 pre-rendered at every alpha level, drawn with drawImage ---------- */

const atlasCache = new Map<number, HTMLCanvasElement>();

function getAtlas(cell: number): HTMLCanvasElement {
  const cached = atlasCache.get(cell);
  if (cached) return cached;
  const img = document.createElement('canvas');
  img.width = cell * 2 * (LEVELS + 1);
  img.height = cell;
  const g = img.getContext('2d');
  if (g) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${Math.round(cell * 0.8)}px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`;
    for (let glyph = 0; glyph < 2; glyph++) {
      for (let level = 0; level <= LEVELS; level++) {
        g.globalAlpha = level === LEVELS ? 1 : ALPHAS[level];
        g.fillStyle = level === LEVELS ? '#d6ffe6' : '#34f57e';
        g.fillText(String(glyph), (glyph * (LEVELS + 1) + level) * cell + cell / 2, cell / 2 + cell * 0.04);
      }
    }
  }
  atlasCache.set(cell, img);
  return img;
}

/**
 * Rain columns are drawn as one pre-baked strip per column (random bits, alpha already fading from
 * the bright head up to the tail), so a frame costs one drawImage per column instead of one per glyph.
 */
const STRIP_VARIANTS = 24;
const STRIP_ROWS = 18;
const stripCache = new Map<number, HTMLCanvasElement>();

function getStrips(cell: number): HTMLCanvasElement {
  const cached = stripCache.get(cell);
  if (cached) return cached;
  const atlas = getAtlas(cell);
  const strips = document.createElement('canvas');
  strips.width = cell * STRIP_VARIANTS;
  strips.height = cell * STRIP_ROWS;
  const g = strips.getContext('2d');
  if (g) {
    const rand = mulberry32(99);
    for (let v = 0; v < STRIP_VARIANTS; v++) {
      for (let r = 0; r < STRIP_ROWS; r++) {
        const k = STRIP_ROWS - 1 - r; // distance from the head, which sits at the bottom
        const fade = (1 - k / STRIP_ROWS) ** 1.4;
        if (fade < 0.07) continue;
        const level = k === 0 ? LEVELS : levelOf(fade);
        const bit = rand() < 0.5 ? 0 : 1;
        g.drawImage(atlas, (bit * (LEVELS + 1) + level) * cell, 0, cell, cell, v * cell, r * cell, cell, cell);
      }
    }
  }
  stripCache.set(cell, strips);
  return strips;
}

if (typeof document !== 'undefined' && document.fonts?.ready) {
  void document.fonts.ready.then(() => {
    atlasCache.clear();
    stripCache.clear();
  });
}

const levelOf = (alpha: number): number => Math.min(LEVELS - 1, Math.max(0, Math.floor(alpha * LEVELS)));

/* ---------- shared state: user pause, pointer, single rAF scheduler ---------- */

let userPaused = false;
try {
  userPaused = window.localStorage.getItem('onq.motion.paused') === '1';
} catch {
  userPaused = false;
}
const pauseSubs = new Set<() => void>();

export function setBinaryPaused(next: boolean): void {
  userPaused = next;
  try {
    window.localStorage.setItem('onq.motion.paused', next ? '1' : '0');
  } catch {
    // storage blocked: the choice still applies for this page view
  }
  pauseSubs.forEach((cb) => cb());
  wake();
}

function subscribePaused(cb: () => void): () => void {
  pauseSubs.add(cb);
  return () => pauseSubs.delete(cb);
}

export function useBinaryPaused(): boolean {
  return useSyncExternalStore(subscribePaused, () => userPaused, () => false);
}

const pointer = { x: -9999, y: -9999, active: false };
let pointerUsers = 0;
const onPointerMove = (e: PointerEvent) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
};
const onPointerLeave = () => {
  pointer.active = false;
};

interface Runner {
  active: () => boolean;
  frame: (now: number, dt: number) => void;
}
const runners = new Set<Runner>();
let rafId = 0;
let lastTs = 0;

declare global {
  interface Window {
    /** Smoothed cost of one BinaryField frame in ms, for perf checks in devtools. */
    __onqBinary?: { ms: number; active: number };
  }
}

function loop(ts: number): void {
  rafId = 0;
  if (document.hidden) {
    lastTs = 0;
    return;
  }
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 1 / 60;
  lastTs = ts;
  const t0 = performance.now();
  let active = 0;
  runners.forEach((r) => {
    if (r.active()) {
      active++;
      r.frame(ts / 1000, dt);
    }
  });
  if (active > 0) {
    const cost = performance.now() - t0;
    const prev = window.__onqBinary?.ms ?? cost;
    window.__onqBinary = { ms: prev * 0.9 + cost * 0.1, active };
    rafId = requestAnimationFrame(loop);
  } else {
    lastTs = 0;
  }
}

function wake(): void {
  if (!rafId && typeof document !== 'undefined' && !document.hidden) rafId = requestAnimationFrame(loop);
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wake);

/* ---------- field ---------- */

export interface BinaryFieldProps {
  mode: 'rain' | 'form' | 'stream';
  /** form: glasses outline or text. */
  shape?: 'glasses' | 'text';
  text?: string;
  /** form: centre (0..1 of the canvas) and width (0..1 of the canvas width) of the target. */
  cx?: number;
  cy?: number;
  boxWidth?: number;
  /** form: hero converges on a timer and flies outward as it scrolls away; enter converges as it scrolls into view. */
  behavior?: 'hero' | 'enter';
  /** stream: closed loop, normalised 0..1. */
  path?: readonly Pt[];
  /** stream: bright comet position along the loop (0..1). Without it the comet circles on its own. */
  progressRef?: RefObject<number>;
  /** form: strength (0..1) of the rain behind the shape. 0 = none. */
  ambient?: number;
  maxGlyphs?: number;
  /** form: brightest alpha a particle reaches (0..1). Keep low behind text. */
  maxAlpha?: number;
  className?: string;
}

const GLASSES_PATH =
  'M28,34 C58,20 120,20 148,34 C162,40 198,40 212,34 C240,20 302,20 332,34 C338,54 334,94 310,104 C268,114 226,102 214,68 C202,48 158,48 146,68 C134,102 92,114 50,104 C26,94 22,54 28,34 Z';

function drawMask(kind: 'glasses' | 'text', text: string): { data: Uint8ClampedArray; w: number; h: number } | null {
  const w = 520;
  const h = kind === 'glasses' ? Math.round((w * 130) / 360) : 220;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.fillStyle = '#fff';
  if (kind === 'glasses') {
    g.scale(w / 360, h / 130);
    g.fill(new Path2D(GLASSES_PATH));
    g.globalCompositeOperation = 'destination-out';
    for (const x of [44, 220]) {
      g.beginPath();
      if (g.roundRect) g.roundRect(x, 34, 96, 62, 18);
      else g.rect(x, 34, 96, 62);
      g.fill();
    }
  } else {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = h * 0.95;
    g.font = `800 ${size}px "Inter Tight", system-ui, sans-serif`;
    const width = g.measureText(text).width;
    if (width > w * 0.96) size *= (w * 0.96) / width;
    g.font = `800 ${size}px "Inter Tight", system-ui, sans-serif`;
    g.fillText(text, w / 2, h / 2 + size * 0.04);
  }
  return { data: g.getImageData(0, 0, w, h).data, w, h };
}

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

function createField(canvas: HTMLCanvasElement, props: BinaryFieldProps, reducedMotion: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { mode, behavior = 'hero', progressRef } = props;
  const ambient = props.ambient ?? 0;
  const maxAlpha = props.maxAlpha ?? 1;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let visible = typeof IntersectionObserver === 'undefined';
  let reduced = reducedMotion;
  let formAmt = 0;
  let expandAmt = 0;
  let hover = 0;
  let t0 = -1;
  let skipFrame = false;

  // rain
  let cellCss = 14;
  let cellDev = 14;
  let cols = 0;
  let rows = 0;
  let colHead = new Float32Array(0);
  let colSpeed = new Float32Array(0);
  let colTrail = new Uint8Array(0);
  let colDelay = new Float32Array(0);
  let maxTrail = 12;

  // form
  let n = 0;
  let hx = new Float32Array(0);
  let hy = new Float32Array(0);
  let sx = new Float32Array(0);
  let sy = new Float32Array(0);
  let ex = new Float32Array(0);
  let ey = new Float32Array(0);
  let ph = new Float32Array(0);
  let dl = new Float32Array(0);
  let glyphCss = 10;

  // stream
  let lut: PathLut | null = null;
  const lanes = [-7, 0, 7];
  let perLane = 0;

  const isActive = () => visible && !reduced && !userPaused;

  function buildRain(): void {
    const rand = mulberry32(7);
    // Whole device pixels per cell, so a sprite is drawn 1:1 and stays crisp at fractional DPR.
    cellDev = Math.round(Math.max(12, Math.min(17, Math.round(W / 84))) * dpr);
    cellCss = cellDev / dpr;
    cols = Math.min(120, Math.ceil(W / cellCss));
    rows = Math.ceil(H / cellCss);
    maxTrail = STRIP_ROWS;
    colHead = new Float32Array(cols);
    colSpeed = new Float32Array(cols);
    colTrail = new Uint8Array(cols);
    colDelay = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      colHead[c] = rand() * rows * 1.3 - rows * 0.3;
      colSpeed[c] = 3.5 + rand() * 7;
      colTrail[c] = 10 + Math.floor(rand() * (maxTrail - 9));
      colDelay[c] = rand() < 0.4 ? rand() * 3 : 0;
    }
  }

  function buildForm(): void {
    const rand = mulberry32(11);
    const mask = drawMask(props.shape ?? 'glasses', props.text ?? 'OnQ');
    n = 0;
    if (!mask) return;
    const { points, step } = samplePoints(mask.data, mask.w, mask.h, props.maxGlyphs ?? 760, rand);
    n = points.length;
    // Never smaller than ~320px, so the shape stays readable on a phone.
    const boxW = Math.min(980, Math.max(W * (props.boxWidth ?? 0.6), Math.min(W * 0.8, 320)));
    const boxH = (boxW * mask.h) / mask.w;
    const cx = (props.cx ?? 0.5) * W;
    const cy = (props.cy ?? 0.5) * H;
    glyphCss = Math.min(16, Math.max(8, Math.round(((step * boxW) / mask.w) * 1.15)));
    hx = new Float32Array(n);
    hy = new Float32Array(n);
    sx = new Float32Array(n);
    sy = new Float32Array(n);
    ex = new Float32Array(n);
    ey = new Float32Array(n);
    ph = new Float32Array(n);
    dl = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const px = cx - boxW / 2 + points[i].x * boxW;
      const py = cy - boxH / 2 + points[i].y * boxH;
      hx[i] = px;
      hy[i] = py;
      sx[i] = px + (rand() - 0.5) * W * 0.9;
      sy[i] = py + (rand() - 0.5) * H * 0.9;
      const dx = px - cx + (rand() - 0.5) * 60;
      const dy = py - cy + (rand() - 0.5) * 60;
      const len = Math.hypot(dx, dy) || 1;
      const mag = (0.5 + rand()) * Math.max(W, H) * 0.45;
      ex[i] = (dx / len) * mag;
      ey[i] = (dy / len) * mag * 0.8;
      ph[i] = rand();
      dl[i] = rand();
    }
  }

  function buildStream(): void {
    lut = props.path && props.path.length > 2 ? makeClosedPath([...props.path], W, H) : null;
    perLane = lut ? Math.min(80, Math.floor(lut.length / 24)) : 0;
  }

  function build(): void {
    if (mode === 'rain') buildRain();
    else if (mode === 'form') {
      buildForm();
      if (ambient > 0) buildRain();
    } else buildStream();
  }

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    W = w;
    H = h;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (W * H * dpr * dpr > MAX_BACKING_PIXELS) dpr = Math.max(1, Math.sqrt(MAX_BACKING_PIXELS / (W * H)));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (reduced || userPaused) render(0, 0, true);
  }

  /** Rain columns. `scale` dims the whole layer; `still` draws a frozen dense texture. */
  function drawRain(now: number, dt: number, scale: number, still: boolean, px: number, localHover: number): void {
    if (still) {
      const atlas = getAtlas(cellDev);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (bitAt(r, c, 9) + bitAt(c, r + 1, 5) + bitAt(r + 2, c, 1) < 2) continue;
          const fade = 0.25 + 0.75 * Math.sin(((r / rows) * Math.PI) % Math.PI);
          const lvl = levelOf(0.12 + 0.3 * fade * scale + 0.1 * bitAt(c + r, r, 2));
          ctx!.drawImage(atlas, (bitAt(c, r, 3) * (LEVELS + 1) + lvl) * cellDev, 0, cellDev, cellDev, c * cellCss, r * cellCss, cellCss, cellCss);
        }
      }
      return;
    }
    const strips = getStrips(cellDev);
    for (let c = 0; c < cols; c++) {
      const x = c * cellCss;
      const boost = localHover > 0.01 ? localHover * Math.max(0, 1 - Math.abs(x + cellCss / 2 - px) / POINTER_RADIUS) : 0;
      if (colDelay[c] > 0) {
        colDelay[c] -= dt * (1 + boost * 6);
        continue;
      }
      colHead[c] += colSpeed[c] * dt * (1 + boost * 1.8);
      const trail = colTrail[c];
      if (colHead[c] - trail > rows) {
        colDelay[c] = (0.4 + Math.random() * 3.2) * (1 - boost * 0.85);
        colHead[c] = -Math.random() * 6;
        colTrail[c] = 10 + Math.floor(Math.random() * (maxTrail - 9));
        continue;
      }
      const head = Math.floor(colHead[c]);
      ctx!.globalAlpha = Math.min(1, scale + boost * 0.5);
      const variant = (c * 5 + Math.floor(now * 1.1 + c * 0.29)) % STRIP_VARIANTS;
      ctx!.drawImage(
        strips,
        variant * cellDev,
        (STRIP_ROWS - trail) * cellDev,
        cellDev,
        trail * cellDev,
        x,
        (head - trail + 1) * cellCss,
        cellCss,
        trail * cellCss,
      );
    }
    ctx!.globalAlpha = 1;
  }

  function drawForm(now: number, fa: number, ea: number, still: boolean, px: number, py: number, localHover: number): void {
    const atlasCell = Math.max(6, Math.round(glyphCss * dpr));
    const atlas = getAtlas(atlasCell);
    const drawSize = atlasCell / dpr;
    const R2 = POINTER_RADIUS * POINTER_RADIUS;
    for (let i = 0; i < n; i++) {
      const f = easeOutCubic(clamp01(fa * 1.4 - dl[i] * 0.4));
      let x = sx[i] + (hx[i] - sx[i]) * f;
      let y = sy[i] + (hy[i] - sy[i]) * f;
      if (!still && f > 0.99) {
        x += Math.sin(now * 0.9 + ph[i] * 6.28) * 1.4;
        y += Math.cos(now * 0.8 + ph[i] * 5) * 1.4;
      }
      let near = 0;
      if (localHover > 0.01) {
        const ddx = x - px;
        const ddy = y - py;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) + 0.001;
          near = 1 - d / POINTER_RADIUS;
          const push = near * near * 16 * localHover;
          x += (ddx / d) * push;
          y += (ddy / d) * push;
        }
      }
      if (ea > 0) {
        const ee = ea * ea * (1 + ea);
        x += ex[i] * ee;
        y += ey[i] * ee;
      }
      const a = (0.25 + 0.75 * f) * maxAlpha * (1 - ea * ea) + near * localHover * 0.4;
      if (a < 0.06) continue;
      const tick = Math.floor(now * (0.7 + 5 * (1 - f)) + ph[i] * 17);
      const lvl = near * localHover > 0.55 ? LEVELS : levelOf(Math.min(1, a));
      ctx!.drawImage(
        atlas,
        (bitAt(i, 1, tick) * (LEVELS + 1) + lvl) * atlasCell,
        0,
        atlasCell,
        atlasCell,
        x - drawSize / 2,
        y - drawSize / 2,
        drawSize,
        drawSize,
      );
    }
  }

  function drawStream(now: number, still: boolean): void {
    if (!lut || perLane < 1) return;
    const atlasCell = Math.round(11 * dpr);
    const atlas = getAtlas(atlasCell);
    const size = atlasCell / dpr;
    const hl = progressRef ? clamp01(progressRef.current ?? 0) : still ? 0.5 : (now * 0.07) % 1;
    const shift = still ? 0 : (now * 34) / lut.length;
    for (let k = 0; k < lanes.length; k++) {
      for (let i = 0; i < perLane; i++) {
        const u = (i / perLane + shift + k * 0.17) % 1;
        const p = lut.at(u);
        const behind = (hl - u + 1) % 1;
        let a = 0.2;
        let head = false;
        if (behind < 0.2) {
          a = 0.3 + 0.7 * (1 - behind / 0.2);
          head = behind < 0.012;
        }
        const tick = still ? 0 : Math.floor(now * 1.2 + i * 0.31);
        ctx!.drawImage(
          atlas,
          (bitAt(i, k, tick) * (LEVELS + 1) + (head ? LEVELS : levelOf(a))) * atlasCell,
          0,
          atlasCell,
          atlasCell,
          p.x + p.nx * lanes[k] - size / 2,
          p.y + p.ny * lanes[k] - size / 2,
          size,
          size,
        );
      }
    }
  }

  function render(now: number, dt: number, still: boolean): void {
    if (W < 2) return;
    let px = -9999;
    let py = -9999;
    let rect: DOMRect | null = null;
    if (!still) {
      rect = canvas.getBoundingClientRect();
      px = pointer.x - rect.left;
      py = pointer.y - rect.top;
      const inside = pointer.active && px > -POINTER_RADIUS && px < W + POINTER_RADIUS && py > -POINTER_RADIUS && py < H + POINTER_RADIUS;
      hover += ((inside ? 1 : 0) - hover) * Math.min(1, dt * 5);
    }
    const localHover = still ? 0 : hover;

    if (mode === 'rain') {
      ctx!.clearRect(0, 0, W, H);
      drawRain(now, dt, 1, still, px, localHover);
    } else if (mode === 'stream') {
      ctx!.clearRect(0, 0, W, H);
      drawStream(now, still);
    } else {
      let fa = 1;
      let ea = 0;
      if (!still && rect) {
        if (behavior === 'hero') {
          if (t0 < 0) t0 = now;
          fa = clamp01((now - t0 - 0.15) / 2.6);
          const target = clamp01(-rect.top / (rect.height * 0.6));
          expandAmt += (target - expandAmt) * Math.min(1, dt * 6);
          ea = expandAmt;
        } else {
          const vh = window.innerHeight;
          const target = clamp01((vh * 0.95 - rect.top) / (vh * 0.55));
          formAmt += (target - formAmt) * Math.min(1, dt * 4);
          fa = formAmt;
        }
      }
      // Fully formed, untouched and not scrolling away: redraw every other frame (30 fps is plenty for slow drift).
      const steady = !still && fa >= 1 && ea < 0.01 && localHover < 0.02;
      if (steady) {
        skipFrame = !skipFrame;
        if (skipFrame) return;
      }
      ctx!.clearRect(0, 0, W, H);
      if (ambient > 0) drawRain(now, dt * (steady ? 2 : 1), ambient, still, px, localHover);
      drawForm(now, fa, ea, still, px, py, localHover);
    }
  }

  const runner: Runner = { active: isActive, frame: (now, dt) => render(now, dt, false) };
  runners.add(runner);

  const syncMotion = () => {
    if (reduced || userPaused) render(0, 0, true);
    else if (visible) wake();
  };

  const io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          ([entry]) => {
            visible = entry.isIntersecting;
            if (visible) wake();
          },
          { rootMargin: '80px' },
        );
  io?.observe(canvas);

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  const unsubPause = subscribePaused(syncMotion);
  if (pointerUsers++ === 0) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onPointerLeave);
  }
  resize();

  return {
    setReduced(next: boolean) {
      reduced = next;
      syncMotion();
    },
    destroy() {
      runners.delete(runner);
      io?.disconnect();
      ro.disconnect();
      unsubPause();
      if (--pointerUsers === 0) {
        window.removeEventListener('pointermove', onPointerMove);
        document.documentElement.removeEventListener('mouseleave', onPointerLeave);
      }
    },
  };
}

export function BinaryField(props: BinaryFieldProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const reduced = Boolean(useReducedMotion());
  const reducedRef = useRef(reduced);
  const fieldRef = useRef<ReturnType<typeof createField>>(null);

  const { mode, shape, text, cx, cy, boxWidth, behavior, path, progressRef, ambient, maxGlyphs, maxAlpha } = props;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const field = createField(
      canvas,
      { mode, shape, text, cx, cy, boxWidth, behavior, path, progressRef, ambient, maxGlyphs, maxAlpha },
      reducedRef.current,
    );
    fieldRef.current = field;
    return () => {
      field?.destroy();
      fieldRef.current = null;
    };
  }, [mode, shape, text, cx, cy, boxWidth, behavior, path, progressRef, ambient, maxGlyphs, maxAlpha]);

  useEffect(() => {
    reducedRef.current = reduced;
    fieldRef.current?.setReduced(reduced);
  }, [reduced]);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none ${props.className ?? ''}`} />;
}

/** Visible pause control for the background motion (WCAG 2.2.2). Hidden when the OS already asks for reduced motion. */
export function BinaryMotionToggle() {
  const paused = useBinaryPaused();
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <button
      type="button"
      onClick={() => setBinaryPaused(!paused)}
      className="retro-btn-glass fixed bottom-4 left-4 z-40 px-3 py-1.5 font-pixel text-[10px] uppercase tracking-[0.14em] text-[var(--lightgray)] hover:text-[var(--lime)] cursor-pointer"
    >
      {paused ? 'Play background motion' : 'Pause background motion'}
    </button>
  );
}
