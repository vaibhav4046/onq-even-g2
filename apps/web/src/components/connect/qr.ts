/**
 * Minimal QR encoder for pairing URLs: byte mode, error correction L, versions 1 to 5 (up to 106 bytes), one block.
 * Longer text throws and the caller shows the plain URL. Tested against reference vectors (apps/web/tests/qr.test.ts).
 */
const DATA_CW = [0, 19, 34, 55, 80, 108]; // data codewords per version at level L
const EC_CW = [0, 7, 10, 15, 20, 26]; // error-correction codewords per version at level L
const MAX_BYTES = [0, 17, 32, 53, 78, 106];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++, x = x & 128 ? (x << 1) ^ 0x11d : x << 1) {
  EXP[i] = x;
  LOG[x] = i;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** Reed-Solomon remainder over GF(256), polynomial 0x11d. */
export function rsRemainder(data: number[], ecLen: number): number[] {
  let gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((c, j) => {
      next[j] ^= c;
      next[j + 1] ^= mul(c, EXP[i]);
    });
    gen = next;
  }
  const rem = new Array<number>(ecLen).fill(0);
  for (const d of data) {
    const f = d ^ (rem.shift() as number);
    rem.push(0);
    for (let j = 0; j < ecLen; j++) rem[j] ^= mul(gen[j + 1], f);
  }
  return rem;
}

/** 15 format bits for error-correction level L and a mask 0..7. */
export function formatBits(mask: number): number {
  const d = (1 << 3) | mask;
  let r = d;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >> 9) * 0x537);
  return ((d << 10) | r) ^ 0x5412;
}

function dataCodewords(bytes: number[], version: number): number[] {
  const bits: number[] = [];
  const push = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };
  push(4, 4);
  push(bytes.length, 8);
  bytes.forEach((b) => push(b, 8));
  push(0, Math.min(4, DATA_CW[version] * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; out.length < DATA_CW[version]; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

const MASKS: Array<(r: number, c: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (_r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(m: boolean[][]): number {
  const n = m.length;
  let p = 0;
  let dark = 0;
  for (let i = 0; i < n; i++) {
    for (const line of [m[i], m.map((row) => row[i])]) {
      for (let j = 1, run = 1; j <= n; j++) {
        if (j < n && line[j] === line[j - 1]) run++;
        else {
          if (run >= 5) p += run - 2;
          run = 1;
        }
      }
      p += 40 * (line.map((x) => (x ? '1' : '0')).join('').match(/(?=00001011101|10111010000)/g)?.length ?? 0);
    }
    for (let j = 0; j < n; j++) {
      if (m[i][j]) dark++;
      if (i + 1 < n && j + 1 < n && m[i][j] === m[i][j + 1] && m[i][j] === m[i + 1][j] && m[i][j] === m[i + 1][j + 1]) p += 3;
    }
  }
  return p + 10 * Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n));
}

export interface QrCode {
  size: number;
  version: number;
  mask: number;
  modules: boolean[][];
}

/** Encodes text as a QR code. `forceMask` pins the mask (tests); otherwise the lowest-penalty mask is used. */
export function encodeQr(text: string, forceMask?: number): QrCode {
  const bytes = [...new TextEncoder().encode(text)];
  const version = [1, 2, 3, 4, 5].find((v) => bytes.length <= MAX_BYTES[v]);
  if (!version) throw new Error('QR: text is longer than 106 bytes');
  const size = 17 + 4 * version;
  const data = dataCodewords(bytes, version);
  const stream = [...data, ...rsRemainder(data, EC_CW[version])].flatMap((b) => Array.from({ length: 8 }, (_, i) => (b >> (7 - i)) & 1));
  const grid = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const base = grid();
  const fn = grid(); // function-pattern cells: never masked, never hold data
  const set = (m: boolean[][], r: number, c: number, v: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    m[r][c] = v;
    fn[r][c] = true;
  };
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) set(base, r0 + dr, c0 + dc, ![2, 4].includes(Math.max(Math.abs(dr - 3), Math.abs(dc - 3))));
  }
  for (let i = 8; i < size - 8; i++) {
    set(base, 6, i, i % 2 === 0);
    set(base, i, 6, i % 2 === 0);
  }
  if (version >= 2) {
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(base, size - 7 + dr, size - 7 + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  const drawFormat = (m: boolean[][], mask: number) => {
    const b = (i: number) => ((formatBits(mask) >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(m, i, 8, b(i));
    set(m, 7, 8, b(6));
    set(m, 8, 8, b(7));
    set(m, 8, 7, b(8));
    for (let i = 9; i < 15; i++) set(m, 8, 14 - i, b(i));
    for (let i = 0; i < 8; i++) set(m, 8, size - 1 - i, b(i));
    for (let i = 8; i < 15; i++) set(m, size - 15 + i, 8, b(i));
    set(m, size - 8, 8, true); // the always-dark module
  };
  drawFormat(base, 0); // reserve the format cells before placing data
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) {
      for (let j = 0; j < 2; j++) {
        const r = ((right + 1) & 2) === 0 ? size - 1 - v : v;
        if (!fn[r][right - j]) base[r][right - j] = stream[k++] === 1;
      }
    }
  }
  const build = (mask: number) => {
    const m = base.map((row, r) => row.map((v, c) => (fn[r][c] ? v : v !== MASKS[mask](r, c))));
    drawFormat(m, mask);
    return { mask, modules: m, score: 0 };
  };
  const tried = (forceMask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [forceMask]).map(build);
  tried.forEach((t) => (t.score = penalty(t.modules)));
  const best = tried.sort((a, b) => a.score - b.score)[0];
  return { size, version, mask: best.mask, modules: best.modules };
}

/** One SVG path (1 unit per module) covering every dark module, as horizontal runs. */
export function qrPath(modules: boolean[][]): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      parts.push(`M${x} ${y}h${w}v1h-${w}z`);
      x += w;
    }
  });
  return parts.join('');
}
