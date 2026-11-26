// Desk with laptop graded in atmospheric emerald-green anime lighting.
import { W, H, svg, lg, rg, skyline, bokeh, cloud } from './bg-common.js';

export function desk() {
  const back = svg(`
  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <!-- window -->
  <rect x="1100" y="110" width="920" height="760" rx="10" fill="#183d2a"/>
  <clipPath id="w"><rect x="1124" y="134" width="872" height="712"/></clipPath>
  <g clip-path="url(#w)"><rect x="1124" y="134" width="872" height="712" fill="url(#sky)"/>
    <circle cx="1560" cy="640" r="340" fill="url(#sun)"/><circle cx="1560" cy="640" r="58" fill="#c8ffe0"/>
    ${cloud(1400, 340, 260, '#2e875c', 0.75)}${cloud(1800, 260, 220, '#216945', 0.68)}${cloud(1600, 500, 300, '#4ed18b', 0.65)}
    ${skyline({ seed: 12, y: 780, h: 220, color: '#112e21', winP: 0.14, win: '#86ffaf', x0: 1100, x1: 2020, minW: 50, maxW: 110 })}
    ${skyline({ seed: 18, y: 830, h: 170, color: '#0a1f16', winP: 0.24, win: '#34f57e', x0: 1100, x1: 2020, minW: 60, maxW: 120 })}
  </g>
  <g fill="none" stroke="#224f38" stroke-width="16"><rect x="1116" y="126" width="888" height="728"/><path d="M1560 126V854M1116 490H2004"/></g>
  <path d="M1000 90 C1050 200 1040 600 980 880 L850 880 C900 600 880 220 860 90Z" fill="#1c4532"/>
  <path d="M1000 90 C1040 210 1030 600 980 880 L940 880 C990 600 990 230 960 90Z" fill="#112b1f" opacity=".55"/>
  <path d="M2130 90 C2090 200 2100 600 2150 880 L2300 880 L2300 90Z" fill="#1c4532"/>
  <!-- shelf wall left -->
  <rect x="120" y="260" width="620" height="16" rx="4" fill="#1b3b2c"/><rect x="120" y="520" width="620" height="16" rx="4" fill="#1b3b2c"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<rect x="${140 + i * 36}" y="${268 - 150 + (i % 3) * 10}" width="28" height="${140 - (i % 3) * 10}" fill="${['#22523a', '#317351', '#48a875', '#1d4532', '#2b6147'][i % 5]}"/>`).join('')}
  ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${150 + i * 40}" y="${528 - 140 + (i % 2) * 14}" width="32" height="${132 - (i % 2) * 14}" fill="${['#357a58', '#1e4a35', '#2a6648', '#449e6f'][i % 4]}"/>`).join('')}
  <path d="M520 260 C500 190 570 170 556 110 C610 170 596 230 612 260Z" fill="#2d8759"/><rect x="530" y="236" width="70" height="24" rx="6" fill="#25543c"/>
  <circle cx="660" cy="470" r="46" fill="#214d38"/><circle cx="660" cy="470" r="38" fill="#081711"/><path d="M660 470 L660 440 M660 470 L682 478" stroke="#34f57e" stroke-width="4" stroke-linecap="round"/>
  ${bokeh(4, 14, 100, 120, 1000, 240, 8, 14, ['#86ffaf', '#34f57e'], 0.7)}
  <rect y="820" width="${W}" height="480" fill="#0d2117"/>
  `, `${lg('wall', [[0, '#143224'], [0.6, '#0e241a'], [1, '#081811']])}${lg('sky', [[0, '#071b13'], [0.35, '#123e2a'], [0.65, '#25784f'], [0.9, '#6ef5a4']])}${rg('sun', [[0, '#c8ffe0', 0.92], [0.45, '#34f57e', 0.45], [1, '#1a6b40', 0]])}`);

  const front = svg(`
  <!-- desk -->
  <path d="M0 900 L${W} 900 L${W} ${H} L0 ${H}Z" fill="url(#wood)"/>
  <path d="M0 900 L${W} 900" stroke="#86ffaf" stroke-width="6" opacity=".4"/>
  <path d="M0 1000 Q600 980 1200 1000 T2304 990" stroke="#0c2117" stroke-width="3" fill="none" opacity=".55"/><path d="M0 1120 Q600 1100 1200 1120 T2304 1110" stroke="#0c2117" stroke-width="3" fill="none" opacity=".45"/>
  <!-- laptop (back of lid facing camera) -->
  <g>
    <path d="M700 480 L1640 480 L1680 920 L660 920Z" fill="url(#lid)" stroke="#0f261b" stroke-width="5" stroke-linejoin="round"/>
    <path d="M700 480 L1640 480 L1648 560 L690 560Z" fill="#86ffaf" opacity=".1"/>
    <path d="M1640 480 L1680 920 L1640 920 L1612 480Z" fill="#0b1c14" opacity=".5"/>
    <circle cx="1170" cy="700" r="34" fill="#34f57e" opacity=".24"/><path d="M1146 706 q24 -34 48 0" stroke="#86ffaf" stroke-width="5" fill="none" opacity=".45"/>
    <rect x="640" y="916" width="1060" height="34" rx="12" fill="#213d2e"/><rect x="640" y="916" width="1060" height="10" rx="5" fill="#4f8567" opacity=".6"/>
  </g>
  <!-- mug with steam -->
  <g transform="translate(1900 800)"><rect x="-56" y="0" width="112" height="118" rx="14" fill="#b4d9c0"/><rect x="-56" y="0" width="30" height="118" rx="12" fill="#6b9c7e" opacity=".7"/><path d="M56 30 q50 0 46 40 q-4 30 -46 28" stroke="#b4d9c0" stroke-width="14" fill="none"/><ellipse cx="0" cy="6" rx="52" ry="12" fill="#173325"/>
    <path d="M-16 -20 q-20 -50 4 -90 M18 -26 q24 -50 -6 -96" stroke="#86ffaf" stroke-width="7" fill="none" stroke-linecap="round" opacity=".4" filter="url(#b4)"/></g>
  <!-- notebook + pen -->
  <g transform="translate(250 1010) rotate(-6)"><rect width="360" height="220" rx="10" fill="#1d4d35"/><rect x="12" y="12" width="336" height="196" rx="6" fill="#cde6d5"/><path d="M30 60 H320 M30 100 H300 M30 140 H280" stroke="#6d9c7e" stroke-width="4"/></g>
  <path d="M120 1180 L420 1130" stroke="#34f57e" stroke-width="12" stroke-linecap="round"/>
  <rect y="1200" width="${W}" height="96" fill="url(#vig)"/>
  `, `${lg('wood', [[0, '#1e4231'], [1, '#10261c']])}${lg('lid', [[0, '#2a4d3c'], [1, '#172e23']], 0, 0, 1, 1)}${lg('vig', [[0, '#040d08', 0], [1, '#040d08', 0.65]])}`);

  const fx = svg(`
  <ellipse cx="1560" cy="640" rx="760" ry="520" fill="url(#bloom)" opacity=".68"/>
  <polygon points="1130,134 1990,134 1500,1296 120,1296" fill="url(#ray)" opacity=".42" filter="url(#b30)"/>
  <ellipse cx="1170" cy="470" rx="440" ry="190" fill="#34f57e" opacity=".36" filter="url(#b70)"/>
  `, `${rg('bloom', [[0, '#b8ffd1', 0.68], [1, '#34f57e', 0]])}${lg('ray', [[0, '#86ffaf', 0.72], [1, '#34f57e', 0]])}`);
  return { back, front, fx };
}
