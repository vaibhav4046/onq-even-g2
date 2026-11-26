// shared helpers for background plates (2304x1296 canvas, 1.2x the 1920x1080 frame so the camera can move)
export const W = 2304, H = 1296;
export const svg = (inner, defs = '', w = W) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}"><defs>${defs}
  <filter id="b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="b12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
  <filter id="b30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
  <filter id="b70" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="70"/></filter>
  </defs>${inner}</svg>`;
export const lg = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1, units = 'objectBoundingBox') =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="${units}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
export const rg = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;

// seeded rng
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// skyline of buildings with lit windows
export function skyline({ seed, y, h, color, win = '#6ef5a4', winP = 0.25, x0 = -50, x1 = W + 50, minW = 60, maxW = 160, hMin = 0.4 }) {
  const r = rng(seed); let x = x0, out = '';
  while (x < x1) {
    const w = minW + r() * (maxW - minW), bh = h * (hMin + r() * (1 - hMin));
    out += `<rect x="${x}" y="${y - bh}" width="${w + 1}" height="${bh + 400}" fill="${color}"/>`;
    if (r() > 0.6) out += `<rect x="${x + w * 0.4}" y="${y - bh - 24}" width="${w * 0.1}" height="24" fill="${color}"/>`;
    const cols = Math.floor(w / 22), rows = Math.floor(bh / 30);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (r() < winP) out += `<rect x="${x + 8 + i * 22}" y="${y - bh + 12 + j * 30}" width="9" height="13" fill="${win}" opacity="${0.5 + r() * 0.5}"/>`;
    x += w;
  }
  return out;
}
export const bokeh = (seed, n, x0, y0, x1, y1, rmin, rmax, colors, a = 0.5) => {
  const r = rng(seed); let o = '';
  for (let i = 0; i < n; i++) o += `<circle cx="${x0 + r() * (x1 - x0)}" cy="${y0 + r() * (y1 - y0)}" r="${rmin + r() * (rmax - rmin)}" fill="${colors[Math.floor(r() * colors.length)]}" opacity="${a * (0.4 + r() * 0.6)}"/>`;
  return o;
};
export const cloud = (cx, cy, w, color, op = 0.7) =>
  `<g fill="${color}" opacity="${op}" filter="url(#b12)"><ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${w * 0.14}"/><ellipse cx="${cx - w * 0.3}" cy="${cy - w * 0.06}" rx="${w * 0.5}" ry="${w * 0.12}"/><ellipse cx="${cx + w * 0.35}" cy="${cy + w * 0.02}" rx="${w * 0.45}" ry="${w * 0.1}"/></g>`;

