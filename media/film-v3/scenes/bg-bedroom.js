// Bedroom in emerald cyber-dawn. Normal home anime room graded into atmospheric green light.
import { W, H, svg, lg, rg, skyline, bokeh, cloud } from './bg-common.js';

export function bedroom({ g2 = true } = {}) {
  const back = svg(`
  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <!-- window -->
  <rect x="1330" y="150" width="700" height="680" rx="10" fill="#173827" />
  <clipPath id="win"><rect x="1352" y="172" width="656" height="636" rx="4"/></clipPath>
  <g clip-path="url(#win)">
    <rect x="1352" y="172" width="656" height="640" fill="url(#sky)"/>
    <circle cx="1700" cy="690" r="260" fill="url(#sun)"/>
    <circle cx="1700" cy="690" r="46" fill="#c8ffe0"/>
    ${cloud(1560, 380, 220, '#369968', 0.72)}${cloud(1900, 300, 180, '#277a52', 0.68)}${cloud(1700, 520, 260, '#5ad694', 0.65)}
    ${skyline({ seed: 7, y: 760, h: 150, color: '#113022', win: '#6cf5a4', winP: 0.14, x0: 1340, x1: 2020, minW: 40, maxW: 90 })}
    ${skyline({ seed: 21, y: 800, h: 120, color: '#0a2117', win: '#86ffaf', winP: 0.22, x0: 1340, x1: 2020, minW: 50, maxW: 110 })}
    <rect x="1352" y="780" width="656" height="40" fill="#071911"/>
  </g>
  <!-- window frame -->
  <g fill="none" stroke="#1f4732" stroke-width="16"><rect x="1344" y="164" width="672" height="652" rx="8"/><path d="M1680 164V816M1344 490H2016"/></g>
  <g fill="none" stroke="#34f57e" stroke-width="2" opacity=".35"><rect x="1352" y="172" width="656" height="636"/><path d="M1680 172V808M1352 490H2008"/></g>
  <rect x="1310" y="816" width="740" height="30" rx="8" fill="#1b3c2b"/><rect x="1310" y="842" width="740" height="10" fill="#0b1f15" opacity=".7"/>
  <!-- curtains -->
  <path d="M1330 100 C1350 180 1340 560 1300 900 L1180 900 C1220 560 1200 200 1180 100Z" fill="url(#curt)" />
  <path d="M1330 100 C1345 200 1335 560 1300 900 L1270 900 C1310 560 1310 220 1290 100Z" fill="#0d2a1d" opacity=".45"/>
  <path d="M2130 100 C2060 190 2070 560 2150 900 L2310 900 L2310 100Z" fill="url(#curt)"/>
  <path d="M2130 100 C2080 200 2090 560 2160 900 L2200 900 C2150 560 2150 220 2190 100Z" fill="#0d2a1d" opacity=".45"/>
  <rect x="1120" y="84" width="1220" height="22" rx="11" fill="#234736"/>
  <!-- left wall: poster + fairy lights + shelf -->
  <g transform="translate(250 250)">
    <rect width="260" height="350" fill="#081711" stroke="#2c5942" stroke-width="10"/>
    <circle cx="150" cy="110" r="52" fill="#46cf82"/>
    <path d="M0 350 L70 210 L130 290 L190 190 L260 350Z" fill="#16422d"/><path d="M0 350 L90 250 L150 320 L220 240 L260 350Z" fill="#0d2b1d"/>
    <circle cx="60" cy="60" r="3" fill="#86ffaf"/><circle cx="210" cy="40" r="2.4" fill="#86ffaf"/><circle cx="40" cy="150" r="2" fill="#86ffaf"/>
  </g>
  <path d="M60 60 Q400 150 760 60 T1000 70" fill="none" stroke="#183828" stroke-width="3"/>
  ${bokeh(3, 18, 80, 60, 980, 150, 8, 14, ['#86ffaf', '#34f57e', '#b8ffd1'], 0.85)}
  <rect x="180" y="720" width="360" height="16" rx="4" fill="#1e4231"/><rect x="190" y="736" width="340" height="10" fill="#0f261b" opacity=".55"/>
  <rect x="210" y="640" width="70" height="80" fill="#285c42"/><rect x="288" y="660" width="54" height="60" fill="#1d4a35"/><rect x="350" y="630" width="86" height="90" fill="#3a7a58"/>
  <path d="M470 720 C440 640 520 620 500 560 C560 620 540 680 560 720Z" fill="#2a8055"/><path d="M470 720 C470 660 500 640 520 610" fill="none" stroke="#164d33" stroke-width="3"/>
  <!-- floor -->
  <rect y="1130" width="${W}" height="170" fill="#0c2117"/>
  `, `${lg('wall', [[0, '#132e21'], [0.55, '#0e241a'], [1, '#081811']])}${lg('sky', [[0, '#071c14'], [0.35, '#12402b'], [0.65, '#257a4f'], [0.9, '#62eb9d']])}${rg('sun', [[0, '#c8ffe0', 0.92], [0.45, '#34f57e', 0.45], [1, '#1d7548', 0]])}${lg('curt', [[0, '#1c4230'], [1, '#10291d']])}`);

  const mid = svg(`
  <!-- bed headboard -->
  <rect x="520" y="520" width="1500" height="650" rx="40" fill="#163024"/>
  <rect x="520" y="520" width="1500" height="46" rx="23" fill="#234a37"/>
  <rect x="560" y="566" width="1420" height="600" fill="#0e2219" opacity=".6"/>
  <!-- pillow(s) -->
  <g>
    <path d="M700 800 C690 640 800 590 1000 580 C1260 570 1470 600 1500 760 C1520 880 1380 920 1100 930 C860 940 710 910 700 800Z" fill="#b4d9c0"/>
    <path d="M700 800 C690 700 760 640 860 612 C780 680 770 800 820 900 C740 880 704 850 700 800Z" fill="#76a687"/>
    <path d="M1100 930 C1380 920 1520 880 1500 760 C1470 700 1440 680 1420 668 C1470 760 1380 880 1100 900Z" fill="#5e8c70" opacity=".9"/>
    <path d="M900 600 C1100 588 1300 594 1440 640" fill="none" stroke="#e4ffec" stroke-width="5" opacity=".5" stroke-linecap="round"/>
    <path d="M1560 760 C1560 640 1700 600 1840 640 C1900 720 1860 820 1740 850 C1630 860 1560 830 1560 760Z" fill="#9bc7aa"/>
    <path d="M1560 760 C1560 700 1620 640 1700 626 C1650 700 1650 790 1700 848 C1620 840 1560 810 1560 760Z" fill="#689477"/>
  </g>
  <!-- nightstand -->
  <g>
    <rect x="130" y="840" width="470" height="470" rx="14" fill="#173325"/>
    <rect x="130" y="840" width="470" height="34" rx="12" fill="#26523d"/>
    <rect x="130" y="874" width="470" height="14" fill="#0d2117" opacity=".6"/>
    <rect x="170" y="920" width="390" height="150" rx="10" fill="#132b1f"/><circle cx="365" cy="995" r="14" fill="#68d994"/>
    <rect x="170" y="1090" width="390" height="170" rx="10" fill="#132b1f"/><circle cx="365" cy="1175" r="14" fill="#68d994"/>
    <!-- lamp -->
    <rect x="230" y="780" width="12" height="60" fill="#203d2e"/><ellipse cx="236" cy="842" rx="44" ry="10" fill="#203d2e"/>
    <path d="M170 780 L300 780 L276 690 L194 690Z" fill="#6ef5a4"/><path d="M170 780 L300 780 L292 756 L178 756Z" fill="#34b86a"/>
    <!-- alarm clock -->
    <g><rect x="440" y="772" width="110" height="68" rx="14" fill="#183024"/><rect x="452" y="782" width="86" height="40" rx="8" fill="#06140d"/>
    <text x="495" y="814" font-family="Consolas, monospace" font-size="32" fill="#34f57e" text-anchor="middle" font-weight="700">07:30</text></g>
    <!-- G2 glasses on a stand -->
    <g transform="translate(330 770)" opacity="${g2 ? 1 : 0}">
      <rect x="-26" y="52" width="52" height="10" rx="5" fill="#2c4f3d"/>
      <g fill="none" stroke="#18221e" stroke-width="4"><rect x="-44" y="14" width="40" height="34" rx="14"/><rect x="4" y="14" width="40" height="34" rx="14"/><path d="M-4 26 Q0 22 4 26"/></g>
      <path d="M44 24 L66 12 M-44 24 L-66 12" stroke="#18221e" stroke-width="6" stroke-linecap="round"/>
      <circle cx="54" cy="19" r="2.6" fill="#34f57e"/>
      <circle cx="54" cy="19" r="14" fill="#34f57e" opacity=".32"/>
      <g fill="#86ffaf" opacity=".22"><rect x="-42" y="16" width="36" height="30" rx="12"/><rect x="6" y="16" width="36" height="30" rx="12"/></g>
    </g>
  </g>
  `, '');

  const front = svg(`
  <path d="M0 1010 C260 940 520 996 760 960 C1000 920 1250 990 1500 950 C1760 906 2020 990 2304 940 L2304 1296 L0 1296Z" fill="url(#bl)"/>
  <path d="M0 1010 C260 940 520 996 760 960 C1000 920 1250 990 1500 950 C1760 906 2020 990 2304 940" fill="none" stroke="#86ffaf" stroke-width="6" opacity=".5" stroke-linecap="round"/>
  <path d="M0 1050 C260 986 520 1036 760 1000 C1000 962 1250 1030 1500 992 C1760 950 2020 1030 2304 984 L2304 1000 C2020 1040 1760 962 1500 1006 C1250 1044 1000 976 760 1014 C520 1050 260 1000 0 1064Z" fill="#184730" opacity=".6"/>
  <g fill="none" stroke="#133826" stroke-width="7" stroke-linecap="round" opacity=".55">
    <path d="M300 1010 C330 1100 310 1190 360 1296"/><path d="M880 1000 C860 1100 900 1200 880 1296"/><path d="M1420 980 C1450 1090 1420 1190 1480 1296"/><path d="M1960 990 C1930 1100 1980 1200 1950 1296"/>
  </g>
  <path d="M700 1140 C1000 1100 1300 1150 1600 1110" fill="none" stroke="#86ffaf" stroke-width="4" opacity=".2" stroke-linecap="round"/>
  <rect y="1200" width="${W}" height="96" fill="url(#vig)"/>
  `, `${lg('bl', [[0, '#3e7356'], [0.4, '#244d39'], [1, '#12291e']])}${lg('vig', [[0, '#040d08', 0], [1, '#040d08', 0.68]])}`);

  const fx = svg(`
  <polygon points="1360,170 2000,170 1180,1296 300,1296" fill="url(#ray1)" opacity=".46" filter="url(#b30)"/>
  <polygon points="1500,170 1820,170 1500,1296 880,1296" fill="url(#ray1)" opacity=".32" filter="url(#b30)"/>
  <ellipse cx="1700" cy="700" rx="500" ry="360" fill="url(#bloom)" opacity=".75"/>
  <ellipse cx="900" cy="1000" rx="800" ry="260" fill="#34f57e" opacity=".16" filter="url(#b70)"/>
  `, `${lg('ray1', [[0, '#86ffaf', 0.72], [1, '#34f57e', 0]])}${rg('bloom', [[0, '#b8ffd1', 0.65], [1, '#34f57e', 0]])}`);
  return { back, mid, front, fx };
}

