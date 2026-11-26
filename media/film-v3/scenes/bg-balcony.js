// Evening balcony. Layers: back (dusk sky + city), mid (string lights, plants), front (railing), fx
import { W, H, svg, lg, rg, skyline, bokeh, cloud, rng } from './bg-common.js';

export function balcony() {
  const r = rng(11);
  const stars = Array.from({ length: 70 }, () => `<circle cx="${r() * W}" cy="${r() * 520}" r="${0.8 + r() * 1.8}" fill="#fff" opacity="${0.4 + r() * 0.6}"/>`).join('');
  const back = svg(`
  <rect width="${W}" height="${H}" fill="url(#sk)"/>
  ${stars}
  <circle cx="1750" cy="260" r="62" fill="#fff0d0"/><circle cx="1776" cy="248" r="56" fill="#3a2f78"/>
  <circle cx="1750" cy="260" r="180" fill="url(#moon)"/>
  ${cloud(500, 560, 360, '#ff9a9c', 0.55)}${cloud(1300, 640, 420, '#ffb48c', 0.55)}${cloud(1900, 520, 300, '#c07ab8', 0.55)}
  ${skyline({ seed: 41, y: 860, h: 380, color: '#6a4f94', winP: 0.12, win: '#ffd9a0', minW: 70, maxW: 160 })}
  ${skyline({ seed: 52, y: 930, h: 300, color: '#4a3a7e', winP: 0.22, win: '#ffd9a0', minW: 80, maxW: 170 })}
  ${skyline({ seed: 63, y: 1010, h: 250, color: '#32296a', winP: 0.3, win: '#ffe6b8', minW: 90, maxW: 190 })}
  <rect y="1000" width="${W}" height="300" fill="#32296a"/>
  ${bokeh(8, 30, 0, 760, W, 1000, 6, 16, ['#ffd9a0', '#ff9ab0', '#ffe6b8'], 0.7)}
  `, `${lg('sk', [[0, '#25235e'], [0.35, '#6a4a9c'], [0.62, '#e0708c'], [0.82, '#ff9e7e'], [1, '#ffcc90']])}${rg('moon', [[0, '#fff0d0', 0.5], [1, '#fff0d0', 0]])}`);

  const mid = svg(`
  <path d="M0 150 Q576 260 1152 170 T2304 160" fill="none" stroke="#2c2350" stroke-width="4"/>
  ${Array.from({ length: 16 }, (_, i) => { const x = 70 + i * 145, y = 150 + Math.sin(i / 2.2) * 54 + 30; return `<circle cx="${x}" cy="${y + 22}" r="52" fill="#ffd9a0" opacity=".28" filter="url(#b12)"/><circle cx="${x}" cy="${y + 22}" r="11" fill="#fff0c8"/><path d="M${x} ${y} v14" stroke="#2c2350" stroke-width="3"/>`; }).join('')}
  <!-- plants -->
  <g transform="translate(200 1010)"><path d="M0 0 C-60 -120 -20 -260 -90 -330 C20 -280 40 -140 20 0Z" fill="#2f6a62"/><path d="M0 0 C40 -160 110 -210 130 -300 C140 -170 70 -60 40 0Z" fill="#3f8a72"/><path d="M0 0 C-30 -200 20 -280 10 -370 C60 -260 50 -120 30 0Z" fill="#2a5a58"/><path d="M-70 0 L70 0 L52 120 L-52 120Z" fill="#c4745c"/><path d="M-70 0 L-40 0 L-30 120 L-52 120Z" fill="#8f4c4c" opacity=".7"/></g>
  <g transform="translate(2080 1010)"><path d="M0 0 C-80 -150 -10 -240 -50 -330 C60 -260 70 -120 30 0Z" fill="#3a7a68"/><path d="M0 0 C70 -140 150 -190 190 -260 C170 -130 90 -50 40 0Z" fill="#2c6a60"/><path d="M-60 0 L60 0 L46 110 L-46 110Z" fill="#b8686c"/></g>
  `, '');

  const front = svg(`
  <rect y="1060" width="${W}" height="${H - 1060}" fill="url(#fl)"/>
  <rect y="1040" width="${W}" height="30" fill="#1d1844"/><rect y="1040" width="${W}" height="8" fill="#6f62b0" opacity=".8"/>
  ${Array.from({ length: 31 }, (_, i) => `<rect x="${i * 78 + 16}" y="1070" width="14" height="230" fill="#1d1844"/><rect x="${i * 78 + 16}" y="1070" width="4" height="230" fill="#6f62b0" opacity=".55"/>`).join('')}
  `, lg('fl', [[0, '#2a2358'], [1, '#17123a']]));
  const fx = svg(`
  <ellipse cx="1152" cy="900" rx="1100" ry="360" fill="#ff9a7e" opacity=".22" filter="url(#b70)"/>
  <ellipse cx="1900" cy="300" rx="400" ry="260" fill="#ffd9a0" opacity=".1" filter="url(#b70)"/>
  `);
  return { back, mid, front, fx };
}
