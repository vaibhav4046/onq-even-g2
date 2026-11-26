// Desk with laptop at golden hour. Layers: back, front (desk + laptop back + props), fx (warm light + screen glow)
import { W, H, svg, lg, rg, skyline, bokeh, cloud } from './bg-common.js';

export function desk() {
  const back = svg(`
  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <!-- window -->
  <rect x="1100" y="110" width="920" height="760" rx="10" fill="#fff0dd"/>
  <clipPath id="w"><rect x="1124" y="134" width="872" height="712"/></clipPath>
  <g clip-path="url(#w)"><rect x="1124" y="134" width="872" height="712" fill="url(#sky)"/>
    <circle cx="1560" cy="640" r="340" fill="url(#sun)"/><circle cx="1560" cy="640" r="58" fill="#fff4cc"/>
    ${cloud(1400, 340, 260, '#ffb98a', 0.8)}${cloud(1800, 260, 220, '#ff9a8c', 0.7)}${cloud(1600, 500, 300, '#ffd9a0', 0.7)}
    ${skyline({ seed: 12, y: 780, h: 220, color: '#a8647a', winP: 0.1, win: '#ffe0a8', x0: 1100, x1: 2020, minW: 50, maxW: 110 })}
    ${skyline({ seed: 18, y: 830, h: 170, color: '#7d4a6c', winP: 0.2, win: '#ffe0a8', x0: 1100, x1: 2020, minW: 60, maxW: 120 })}
  </g>
  <g fill="none" stroke="#fff0dd" stroke-width="16"><rect x="1116" y="126" width="888" height="728"/><path d="M1560 126V854M1116 490H2004"/></g>
  <path d="M1000 90 C1050 200 1040 600 980 880 L850 880 C900 600 880 220 860 90Z" fill="#e8a79a"/>
  <path d="M1000 90 C1040 210 1030 600 980 880 L940 880 C990 600 990 230 960 90Z" fill="#b8687a" opacity=".5"/>
  <path d="M2130 90 C2090 200 2100 600 2150 880 L2300 880 L2300 90Z" fill="#e8a79a"/>
  <!-- shelf wall left -->
  <rect x="120" y="260" width="620" height="16" rx="4" fill="#9c6a60"/><rect x="120" y="520" width="620" height="16" rx="4" fill="#9c6a60"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<rect x="${140 + i * 36}" y="${268 - 150 + (i % 3) * 10}" width="28" height="${140 - (i % 3) * 10}" fill="${['#5d7fb0', '#d86a78', '#f0c25a', '#6fb09c', '#9a78c0'][i % 5]}"/>`).join('')}
  ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${150 + i * 40}" y="${528 - 140 + (i % 2) * 14}" width="32" height="${132 - (i % 2) * 14}" fill="${['#e49a6c', '#7ab0d0', '#c88ab8', '#8cc090'][i % 4]}"/>`).join('')}
  <path d="M520 260 C500 190 570 170 556 110 C610 170 596 230 612 260Z" fill="#6bb08c"/><rect x="530" y="236" width="70" height="24" rx="6" fill="#d8896c"/>
  <circle cx="660" cy="470" r="46" fill="#fff0dd"/><circle cx="660" cy="470" r="38" fill="#2b2f5a"/><path d="M660 470 L660 440 M660 470 L682 478" stroke="#ffe0a0" stroke-width="4" stroke-linecap="round"/>
  ${bokeh(4, 14, 100, 120, 1000, 240, 8, 14, ['#ffe0a8', '#ffc0b0'], 0.8)}
  <rect y="820" width="${W}" height="480" fill="#b9786c"/>
  `, `${lg('wall', [[0, '#f6c9a8'], [0.6, '#eaa592'], [1, '#c98080']])}${lg('sky', [[0, '#5a4f9a'], [0.35, '#d4607c'], [0.65, '#ff9a6c'], [0.9, '#ffd48a']])}${rg('sun', [[0, '#fff0b8', 0.95], [0.45, '#ffc080', 0.5], [1, '#ff9a70', 0]])}`);

  const front = svg(`
  <!-- desk -->
  <path d="M0 900 L${W} 900 L${W} ${H} L0 ${H}Z" fill="url(#wood)"/>
  <path d="M0 900 L${W} 900" stroke="#ffe4c0" stroke-width="10" opacity=".8"/>
  <path d="M0 1000 Q600 980 1200 1000 T2304 990" stroke="#a8604a" stroke-width="3" fill="none" opacity=".5"/><path d="M0 1120 Q600 1100 1200 1120 T2304 1110" stroke="#a8604a" stroke-width="3" fill="none" opacity=".4"/>
  <!-- laptop (back of lid facing camera) -->
  <g>
    <path d="M700 480 L1640 480 L1680 920 L660 920Z" fill="url(#lid)" stroke="#6b5870" stroke-width="5" stroke-linejoin="round"/>
    <path d="M700 480 L1640 480 L1648 560 L690 560Z" fill="#fff" opacity=".12"/>
    <path d="M1640 480 L1680 920 L1640 920 L1612 480Z" fill="#6a5a78" opacity=".4"/>
    <circle cx="1170" cy="700" r="34" fill="#fff" opacity=".18"/><path d="M1146 706 q24 -34 48 0" stroke="#fff" stroke-width="5" fill="none" opacity=".35"/>
    <rect x="640" y="916" width="1060" height="34" rx="12" fill="#8c7a98"/><rect x="640" y="916" width="1060" height="10" rx="5" fill="#cbb8d6" opacity=".7"/>
  </g>
  <!-- mug with steam -->
  <g transform="translate(1900 800)"><rect x="-56" y="0" width="112" height="118" rx="14" fill="#f4e6dc"/><rect x="-56" y="0" width="30" height="118" rx="12" fill="#d8bcb0" opacity=".7"/><path d="M56 30 q50 0 46 40 q-4 30 -46 28" stroke="#f4e6dc" stroke-width="14" fill="none"/><ellipse cx="0" cy="6" rx="52" ry="12" fill="#6b3f36"/>
    <path d="M-16 -20 q-20 -50 4 -90 M18 -26 q24 -50 -6 -96" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".5" filter="url(#b4)"/></g>
  <!-- notebook + pen -->
  <g transform="translate(250 1010) rotate(-6)"><rect width="360" height="220" rx="10" fill="#7fa6d0"/><rect x="12" y="12" width="336" height="196" rx="6" fill="#f6efe4"/><path d="M30 60 H320 M30 100 H300 M30 140 H280" stroke="#c4b0a0" stroke-width="4"/></g>
  <path d="M120 1180 L420 1130" stroke="#d86a78" stroke-width="12" stroke-linecap="round"/>
  <rect y="1200" width="${W}" height="96" fill="url(#vig)"/>
  `, `${lg('wood', [[0, '#d99878'], [1, '#a8604a']])}${lg('lid', [[0, '#cdc0d8'], [1, '#9a8aac']], 0, 0, 1, 1)}${lg('vig', [[0, '#3a1a30', 0], [1, '#3a1a30', 0.5]])}`);

  const fx = svg(`
  <ellipse cx="1560" cy="640" rx="760" ry="520" fill="url(#bloom)" opacity=".7"/>
  <polygon points="1130,134 1990,134 1500,1296 120,1296" fill="url(#ray)" opacity=".45" filter="url(#b30)"/>
  <ellipse cx="1170" cy="470" rx="440" ry="190" fill="#9fe3ff" opacity=".42" filter="url(#b70)"/>
  `, `${rg('bloom', [[0, '#ffe8b8', 0.75], [1, '#ffc090', 0]])}${lg('ray', [[0, '#ffe0a0', 0.8], [1, '#ffc890', 0]])}`);
  return { back, front, fx };
}
