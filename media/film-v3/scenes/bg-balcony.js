// Evening balcony in deep emerald night skyline lighting.
import { W, H, svg, lg, rg, skyline, bokeh, cloud, rng } from './bg-common.js';

export function balcony() {
  const r = rng(11);
  const stars = Array.from({ length: 70 }, () => `<circle cx="${r() * W}" cy="${r() * 520}" r="${0.8 + r() * 1.8}" fill="#b8ffd1" opacity="${0.4 + r() * 0.6}"/>`).join('');
  const back = svg(`
  <rect width="${W}" height="${H}" fill="url(#sk)"/>
  ${stars}
  <circle cx="1750" cy="260" r="62" fill="#d4ffe6"/><circle cx="1776" cy="248" r="56" fill="#092117"/>
  <circle cx="1750" cy="260" r="180" fill="url(#moon)"/>
  ${cloud(500, 560, 360, '#1f5e41', 0.55)}${cloud(1300, 640, 420, '#2a7852', 0.55)}${cloud(1900, 520, 300, '#184a34', 0.55)}
  ${skyline({ seed: 41, y: 860, h: 380, color: '#113324', winP: 0.14, win: '#52e894', minW: 70, maxW: 160 })}
  ${skyline({ seed: 52, y: 930, h: 300, color: '#0c2419', winP: 0.24, win: '#86ffaf', minW: 80, maxW: 170 })}
  ${skyline({ seed: 63, y: 1010, h: 250, color: '#071710', winP: 0.3, win: '#34f57e', minW: 90, maxW: 190 })}
  <rect y="1000" width="${W}" height="300" fill="#071710"/>
  ${bokeh(8, 30, 0, 760, W, 1000, 6, 16, ['#34f57e', '#86ffaf', '#b8ffd1'], 0.72)}
  `, `${lg('sk', [[0, '#040d09'], [0.35, '#092418'], [0.64, '#164d33'], [0.85, '#2b7852'], [1, '#44ab76']])}${rg('moon', [[0, '#b8ffd1', 0.55], [1, '#34f57e', 0]])}`);

  const mid = svg(`
  <path d="M0 150 Q576 260 1152 170 T2304 160" fill="none" stroke="#0c2117" stroke-width="4"/>
  ${Array.from({ length: 16 }, (_, i) => { const x = 70 + i * 145, y = 150 + Math.sin(i / 2.2) * 54 + 30; return `<circle cx="${x}" cy="${y + 22}" r="52" fill="#34f57e" opacity=".26" filter="url(#b12)"/><circle cx="${x}" cy="${y + 22}" r="11" fill="#c8ffe0"/><path d="M${x} ${y} v14" stroke="#0c2117" stroke-width="3"/>`; }).join('')}
  <!-- plants -->
  <g transform="translate(200 1010)"><path d="M0 0 C-60 -120 -20 -260 -90 -330 C20 -280 40 -140 20 0Z" fill="#174d35"/><path d="M0 0 C40 -160 110 -210 130 -300 C140 -170 70 -60 40 0Z" fill="#236b49"/><path d="M0 0 C-30 -200 20 -280 10 -370 C60 -260 50 -120 30 0Z" fill="#143d2b"/><path d="M-70 0 L70 0 L52 120 L-52 120Z" fill="#1e4231"/><path d="M-70 0 L-40 0 L-30 120 L-52 120Z" fill="#11291d" opacity=".8"/></g>
  <g transform="translate(2080 1010)"><path d="M0 0 C-80 -150 -10 -240 -50 -330 C60 -260 70 -120 30 0Z" fill="#1f5e41"/><path d="M0 0 C70 -140 150 -190 190 -260 C170 -130 90 -50 40 0Z" fill="#164731"/><path d="M-60 0 L60 0 L46 110 L-46 110Z" fill="#1e4231"/></g>
  `, '');

  const front = svg(`
  <rect y="1060" width="${W}" height="${H - 1060}" fill="url(#fl)"/>
  <rect y="1040" width="${W}" height="30" fill="#06120c"/><rect y="1040" width="${W}" height="8" fill="#2a7852" opacity=".8"/>
  ${Array.from({ length: 31 }, (_, i) => `<rect x="${i * 78 + 16}" y="1070" width="14" height="230" fill="#06120c"/><rect x="${i * 78 + 16}" y="1070" width="4" height="230" fill="#2a7852" opacity=".55"/>`).join('')}
  `, lg('fl', [[0, '#0a1f15'], [1, '#040d09']]));
  const fx = svg(`
  <ellipse cx="1152" cy="900" rx="1100" ry="360" fill="#34f57e" opacity=".16" filter="url(#b70)"/>
  <ellipse cx="1900" cy="300" rx="400" ry="260" fill="#86ffaf" opacity=".12" filter="url(#b70)"/>
  `);
  return { back, mid, front, fx };
}
