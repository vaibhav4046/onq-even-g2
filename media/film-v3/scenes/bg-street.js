// Street walk in emerald cyber-dawn atmosphere. Normal cityscape graded green.
import { W, H, svg, lg, rg, skyline, cloud, rng } from './bg-common.js';

const PASTEL = ['#244a38', '#1d3d2f', '#2a5440', '#214534', '#183629', '#274f3b'];
const SHADE = ['#163024', '#11261d', '#193629', '#132b20', '#0e2118', '#173326'];

export function street() {
  const far = svg(`
  <rect width="${W}" height="${H}" fill="url(#sk)"/>
  <circle cx="520" cy="560" r="420" fill="url(#sun)"/><circle cx="520" cy="560" r="64" fill="#c8ffe0"/>
  ${cloud(900, 260, 340, '#44ab76', 0.65)}${cloud(1700, 200, 280, '#2b7d54', 0.6)}${cloud(1300, 440, 400, '#58c98c', 0.55)}${cloud(300, 330, 220, '#3da16d', 0.6)}
  ${skyline({ seed: 5, y: 860, h: 300, color: '#173b2b', winP: 0.08, win: '#52e894', minW: 60, maxW: 130 })}
  ${skyline({ seed: 9, y: 900, h: 230, color: '#102b1f', winP: 0.14, win: '#86ffaf', minW: 70, maxW: 150 })}
  <rect y="880" width="${W}" height="420" fill="#102b1f"/>
  `, `${lg('sk', [[0, '#092117'], [0.48, '#164732'], [0.78, '#2b7852'], [1, '#4eb57c']])}${rg('sun', [[0, '#b8ffd1', 0.92], [0.5, '#34f57e', 0.42], [1, '#1a6640', 0]])}`);

  // mid buildings (wide)
  const r = rng(33); let x = -40, mid = '';
  const MW = 3600;
  while (x < MW) {
    const w = 260 + r() * 220, h = 520 + r() * 320, k = Math.floor(r() * PASTEL.length), top = 960 - h;
    mid += `<rect x="${x}" y="${top}" width="${w}" height="${h + 420}" fill="${PASTEL[k]}"/>`;
    mid += `<rect x="${x + w - 46}" y="${top}" width="46" height="${h + 420}" fill="${SHADE[k]}" opacity=".8"/>`;
    mid += `<rect x="${x}" y="${top}" width="${w}" height="14" fill="#68d994" opacity=".28"/>`;
    const cols = Math.floor((w - 70) / 76), rows = Math.floor((h - 160) / 110);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const wx = x + 26 + i * 76, wy = top + 56 + j * 110, lit = r() > 0.68;
      mid += `<rect x="${wx}" y="${wy}" width="46" height="70" rx="3" fill="${lit ? '#5ef298' : '#133023'}"/><rect x="${wx}" y="${wy}" width="46" height="28" fill="#86ffaf" opacity="${lit ? 0.25 : 0.12}"/><rect x="${wx - 5}" y="${wy + 70}" width="56" height="8" fill="#2f664b" opacity=".6"/>`;
    }
    if (r() > 0.55) mid += `<path d="M${x + 16} ${960 - 150} h${w - 40} l-14 60 h-${w - 68}z" fill="${['#225e43', '#2e825a', '#194732'][Math.floor(r() * 3)]}"/><rect x="${x + 16}" y="${960 - 150}" width="${w - 40}" height="10" fill="#86ffaf" opacity=".25"/>`;
    x += w + 6 + r() * 16;
  }
  mid += `<rect y="960" width="${MW}" height="340" fill="url(#gr)"/>`;
  mid += `<path d="M0 372 Q900 460 1800 360 T3600 380" fill="none" stroke="#183b2b" stroke-width="3" opacity=".8"/><path d="M0 410 Q900 500 1800 400 T3600 420" fill="none" stroke="#183b2b" stroke-width="2" opacity=".6"/>`;
  const midSvg = svg(mid, lg('gr', [[0, '#183829'], [1, '#0d2118']]), MW);

  // near plates: ground + lamp posts + trees
  const NW = 5400, rr = rng(77); let near = '';
  near += `<rect y="1090" width="${NW}" height="210" fill="url(#pave)"/><rect y="1090" width="${NW}" height="14" fill="#86ffaf" opacity=".25"/>`;
  for (let i = 0; i < NW; i += 150) near += `<path d="M${i} 1104 L${i - 30} 1296" stroke="#183b2b" stroke-width="3" opacity=".6"/>`;
  const lamps = [620, 1900, 3300, 4700];
  for (const lx of lamps) near += `<g><rect x="${lx - 9}" y="260" width="18" height="840" fill="#12291e"/><rect x="${lx - 9}" y="260" width="6" height="840" fill="#2c6348" opacity=".75"/><path d="M${lx} 270 q70 -40 130 10" stroke="#12291e" stroke-width="12" fill="none"/><ellipse cx="${lx + 132}" cy="288" rx="40" ry="16" fill="#12291e"/><ellipse cx="${lx + 132}" cy="300" rx="30" ry="9" fill="#86ffaf"/><ellipse cx="${lx + 132}" cy="304" rx="70" ry="40" fill="#34f57e" opacity=".28" filter="url(#b12)"/></g>`;
  const trees = [1250, 2650, 4000, 5100];
  for (const tx of trees) {
    near += `<rect x="${tx - 18}" y="560" width="36" height="540" fill="#1b3025"/><rect x="${tx - 18}" y="560" width="12" height="540" fill="#2c4d3c"/>`;
    for (let k = 0; k < 9; k++) { const cx = tx + (rr() - 0.5) * 280, cy = 400 + rr() * 220, rad = 90 + rr() * 80; near += `<circle cx="${cx + 12}" cy="${cy + 16}" r="${rad}" fill="#123d2a"/><circle cx="${cx}" cy="${cy}" r="${rad}" fill="${['#226b48', '#1b593c', '#2b7d55'][k % 3]}"/><circle cx="${cx - rad * 0.25}" cy="${cy - rad * 0.3}" r="${rad * 0.5}" fill="#52c987" opacity=".45"/>`; }
    near += `<circle cx="${tx - 40}" cy="360" r="70" fill="#5ee89b" opacity=".45"/>`;
    for (let k = 0; k < 7; k++) near += `<circle cx="${tx + (rr() - 0.5) * 260}" cy="${380 + rr() * 200}" r="${18 + rr() * 18}" fill="#86ffaf" opacity=".32"/>`;
  }
  const nearSvg = svg(near, lg('pave', [[0, '#1e3d2e'], [1, '#10241b']]), NW);
  const fg = svg(`<g filter="url(#b12)">${Array.from({ length: 10 }, (_, i) => `<ellipse cx="${200 + i * 540 + (rr() * 90)}" cy="${rr() > 0.5 ? 60 : 1240}" rx="${120 + rr() * 120}" ry="${70 + rr() * 60}" fill="#1d593c" opacity=".8"/>`).join('')}</g>`, '', 5400);
  return { far, mid: midSvg, near: nearSvg, fg, sizes: { far: W, mid: MW, near: NW, fg: 5400 } };
}

