// Morning street. Wide plates for horizontal parallax scroll: far 2304, mid 3600, near 5400.
import { W, H, svg, lg, rg, skyline, cloud, rng } from './bg-common.js';

const PASTEL = ['#f6e2d0', '#f4cfc4', '#d9e6e0', '#f1e6b8', '#cfdcec', '#f2d2dc'];
const SHADE = ['#d9b9a2', '#d9a6a0', '#a9c0bb', '#d6c68e', '#a3b6d2', '#d6a6b6'];

export function street() {
  const far = svg(`
  <rect width="${W}" height="${H}" fill="url(#sk)"/>
  <circle cx="520" cy="560" r="420" fill="url(#sun)"/><circle cx="520" cy="560" r="64" fill="#fffbe8"/>
  ${cloud(900, 260, 340, '#ffffff', 0.85)}${cloud(1700, 200, 280, '#fff1e0', 0.8)}${cloud(1300, 440, 400, '#ffe6d6', 0.65)}${cloud(300, 330, 220, '#ffffff', 0.7)}
  ${skyline({ seed: 5, y: 860, h: 300, color: '#b5c3e4', winP: 0, minW: 60, maxW: 130 })}
  ${skyline({ seed: 9, y: 900, h: 230, color: '#a1afd6', winP: 0.04, win: '#fff0d0', minW: 70, maxW: 150 })}
  <rect y="880" width="${W}" height="420" fill="#a1afd6"/>
  `, `${lg('sk', [[0, '#7fb4ec'], [0.5, '#cfe2f4'], [0.78, '#fde6cf'], [1, '#fbd4b8']])}${rg('sun', [[0, '#fff3c8', 0.95], [0.5, '#ffe0b4', 0.4], [1, '#ffd0a8', 0]])}`);

  // mid buildings (wide)
  const r = rng(33); let x = -40, mid = '';
  const MW = 3600;
  while (x < MW) {
    const w = 260 + r() * 220, h = 520 + r() * 320, k = Math.floor(r() * PASTEL.length), top = 960 - h;
    mid += `<rect x="${x}" y="${top}" width="${w}" height="${h + 420}" fill="${PASTEL[k]}"/>`;
    mid += `<rect x="${x + w - 46}" y="${top}" width="46" height="${h + 420}" fill="${SHADE[k]}" opacity=".7"/>`;
    mid += `<rect x="${x}" y="${top}" width="${w}" height="16" fill="#fff" opacity=".6"/>`;
    const cols = Math.floor((w - 70) / 76), rows = Math.floor((h - 160) / 110);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const wx = x + 26 + i * 76, wy = top + 56 + j * 110, lit = r() > 0.72;
      mid += `<rect x="${wx}" y="${wy}" width="46" height="70" rx="3" fill="${lit ? '#ffe7a8' : '#7e9cc4'}"/><rect x="${wx}" y="${wy}" width="46" height="28" fill="#fff" opacity="${lit ? 0.25 : 0.35}"/><rect x="${wx - 5}" y="${wy + 70}" width="56" height="8" fill="#fff" opacity=".7"/>`;
    }
    if (r() > 0.55) mid += `<path d="M${x + 16} ${960 - 150} h${w - 40} l-14 60 h-${w - 68}z" fill="${['#e46a78', '#4aa59a', '#f0b14f'][Math.floor(r() * 3)]}"/><rect x="${x + 16}" y="${960 - 150}" width="${w - 40}" height="10" fill="#fff" opacity=".35"/>`;
    x += w + 6 + r() * 16;
  }
  mid += `<rect y="960" width="${MW}" height="340" fill="url(#gr)"/>`;
  mid += `<path d="M0 372 Q900 460 1800 360 T3600 380" fill="none" stroke="#5b5f86" stroke-width="3" opacity=".7"/><path d="M0 410 Q900 500 1800 400 T3600 420" fill="none" stroke="#5b5f86" stroke-width="2" opacity=".5"/>`;
  const midSvg = svg(mid, lg('gr', [[0, '#e8d6cc'], [1, '#c8b3b0']]), MW);

  // near plates: ground + lamp posts + trees + railing
  const NW = 5400, rr = rng(77); let near = '';
  near += `<rect y="1090" width="${NW}" height="210" fill="url(#pave)"/><rect y="1090" width="${NW}" height="14" fill="#fff" opacity=".5"/>`;
  for (let i = 0; i < NW; i += 150) near += `<path d="M${i} 1104 L${i - 30} 1296" stroke="#b79ea0" stroke-width="3" opacity=".5"/>`;
  const lamps = [620, 1900, 3300, 4700];
  for (const lx of lamps) near += `<g><rect x="${lx - 9}" y="260" width="18" height="840" fill="#3d3f63"/><rect x="${lx - 9}" y="260" width="6" height="840" fill="#6b6e9a" opacity=".7"/><path d="M${lx} 270 q70 -40 130 10" stroke="#3d3f63" stroke-width="12" fill="none"/><ellipse cx="${lx + 132}" cy="288" rx="40" ry="16" fill="#3d3f63"/><ellipse cx="${lx + 132}" cy="300" rx="30" ry="9" fill="#fff3c0"/><ellipse cx="${lx + 132}" cy="304" rx="70" ry="40" fill="#fff3c0" opacity=".25" filter="url(#b12)"/></g>`;
  const trees = [1250, 2650, 4000, 5100];
  for (const tx of trees) {
    near += `<rect x="${tx - 18}" y="560" width="36" height="540" fill="#6e5266"/><rect x="${tx - 18}" y="560" width="12" height="540" fill="#8a6c80"/>`;
    for (let k = 0; k < 9; k++) { const cx = tx + (rr() - 0.5) * 280, cy = 400 + rr() * 220, rad = 90 + rr() * 80; near += `<circle cx="${cx + 12}" cy="${cy + 16}" r="${rad}" fill="#3f8a6c"/><circle cx="${cx}" cy="${cy}" r="${rad}" fill="${['#76b88c', '#68ad82', '#82c294'][k % 3]}"/><circle cx="${cx - rad * 0.25}" cy="${cy - rad * 0.3}" r="${rad * 0.5}" fill="#a9dea8" opacity=".55"/>`; }
    near += `<circle cx="${tx - 40}" cy="360" r="70" fill="#b4e3b0" opacity=".7"/>`;
    for (let k = 0; k < 7; k++) near += `<circle cx="${tx + (rr() - 0.5) * 260}" cy="${380 + rr() * 200}" r="${22 + rr() * 22}" fill="#f4c0cc" opacity=".8"/>`;
  }
  near += `<rect y="940" width="${NW}" height="14" fill="#7f6a8e" opacity="0"/>`;
  const nearSvg = svg(near, lg('pave', [[0, '#d9c8c8'], [1, '#b8a2ae']]), NW);
  // very near foreground blur passes (leaf bokeh)
  const fg = svg(`<g filter="url(#b12)">${Array.from({ length: 10 }, (_, i) => `<ellipse cx="${200 + i * 540 + (rr() * 90)}" cy="${rr() > 0.5 ? 60 : 1240}" rx="${120 + rr() * 120}" ry="${70 + rr() * 60}" fill="#5aa078" opacity=".75"/>`).join('')}</g>`, '', 5400);
  return { far, mid: midSvg, near: nearSvg, fg, sizes: { far: W, mid: MW, near: NW, fg: 5400 } };
}

