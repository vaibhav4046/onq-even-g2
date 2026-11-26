// OnQ film v3 - the recurring character (hand-authored SVG, cel-shaded).
// head(): 520x640 sprite, chin anchor at (262,516). Bodies live in body.js.
export const C = {
  ink: '#1c1727', inkSoft: '#3a2b3c',
  skin: '#f8d8c6', skinSh: '#ebae9f', skinSh2: '#d98d86', blush: '#ff8f95',
  hair: '#1b1e33', hairMid: '#2a3050', hairHi: '#7385c9', hairHi2: '#a5b3ee',
  jacket: '#869b90', jacketSh: '#5f766b', jacketSh2: '#465b54', jacketHi: '#b7c9be',
  tee: '#f1ece3', teeSh: '#cfc8d6',
  frame: '#2b2c36', green: '#39ff88',
};

const defs = (id) => `
<defs>
  <linearGradient id="iris${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#17203a"/><stop offset=".38" stop-color="#2f5d80"/>
    <stop offset=".78" stop-color="#58b3b8"/><stop offset="1" stop-color="#a8f0d8"/>
  </linearGradient>
  <linearGradient id="hairg${id}" gradientUnits="userSpaceOnUse" x1="140" y1="60" x2="430" y2="430">
    <stop offset="0" stop-color="${C.hairMid}"/><stop offset="1" stop-color="${C.hair}"/>
  </linearGradient>
  <radialGradient id="glow${id}" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="${C.green}" stop-opacity=".95"/><stop offset="1" stop-color="${C.green}" stop-opacity="0"/>
  </radialGradient>
  <filter id="soft${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="soft2${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>`;

// ---- eye -------------------------------------------------------------------
function eye(id, cx, cy, w, h, s, st) {
  const { o = 1, lw = 0, ir = 1, lx = 0, ly = 0, closed = false, pup = 1 } = st;
  const I = [-s * w * 0.5, 5], O = [s * w * 0.5, -3];
  if (closed) {
    const sag = st.happy ? -h * 0.34 : h * 0.30;
    const arc = `M${I[0]} ${I[1]} Q0 ${sag * 2 - 2} ${O[0]} ${O[1]}`;
    const fl = `M${O[0]} ${O[1]} q${s * 11} ${st.happy ? 4 : -8} ${s * 15} ${st.happy ? 10 : -5}`;
    return `<g transform="translate(${cx} ${cy})">
      <path d="${arc}" fill="none" stroke="${C.ink}" stroke-width="7.5" stroke-linecap="round"/>
      <path d="${fl}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/>
      <path d="M${I[0] + s * 8} ${I[1] + 8} Q0 ${sag * 2 + 12} ${O[0] - s * 8} ${O[1] + 9}" fill="none" stroke="${C.skinSh2}" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>
    </g>`;
  }
  const top1 = `C${-s * w * 0.52} ${-h * 0.28 * o} ${-s * w * 0.30} ${-h * 0.55 * o} ${-s * w * 0.02} ${-h * 0.56 * o}`;
  const top2 = `C${s * w * 0.30} ${-h * 0.57 * o} ${s * w * 0.50} ${-h * 0.30 * o} ${O[0]} ${O[1]}`;
  const lowY = h * 0.47 * (1 - lw * 0.55);
  const low = `C${s * w * 0.32} ${lowY} ${-s * w * 0.30} ${lowY * 1.05} ${I[0]} ${I[1]}`;
  const lid = `M${I[0]} ${I[1]} ${top1} ${top2}`;
  const white = `${lid} ${low} Z`;
  const irx = w * 0.345 * ir, iry = h * 0.52 * ir;
  const icx = lx * w * 0.16 + s * -2, icy = h * 0.06 + ly;
  // lash crescent (thick outer, thin inner) + flick
  const lash = `M${I[0]} ${I[1]} ${top1} ${top2} L${O[0] + s * 13} ${O[1] - 7 - (1 - o) * 0} C${s * w * 0.42} ${-h * 0.40 * o - 6} ${s * w * 0.10} ${-h * 0.64 * o - 5} ${-s * w * 0.04} ${-h * 0.62 * o - 5} C${-s * w * 0.32} ${-h * 0.62 * o - 3} ${-s * w * 0.50} ${-h * 0.30 * o - 1} ${I[0]} ${I[1] - 1} Z`;
  return `<g transform="translate(${cx} ${cy})">
    <clipPath id="ec${id}${cx}"><path d="${white}"/></clipPath>
    <path d="${white}" fill="#fdf8f6"/>
    <g clip-path="url(#ec${id}${cx})">
      <path d="${white}" fill="#d8d3ee" opacity=".0"/>
      <ellipse cx="${icx}" cy="${icy}" rx="${irx}" ry="${iry}" fill="url(#iris${id})"/>
      <ellipse cx="${icx}" cy="${icy + iry * 0.05}" rx="${irx * 0.42 * pup}" ry="${iry * 0.46 * pup}" fill="#0b1021"/>
      <ellipse cx="${icx}" cy="${icy - iry * 0.58}" rx="${irx * 1.05}" ry="${iry * 0.42}" fill="#0c1226" opacity=".55"/>
      <path d="M${icx - irx * 0.8} ${icy + iry * 0.55} Q${icx} ${icy + iry * 1.0} ${icx + irx * 0.8} ${icy + iry * 0.55}" fill="none" stroke="#d8fff0" stroke-width="2.4" opacity=".55"/>
      <ellipse cx="${icx - irx * 0.30}" cy="${icy - iry * 0.30}" rx="${irx * 0.30}" ry="${irx * 0.30}" fill="#fff"/>
      <circle cx="${icx + irx * 0.38}" cy="${icy + iry * 0.38}" r="${irx * 0.13}" fill="#fff" opacity=".92"/>
      <ellipse cx="${icx + irx * 0.5}" cy="${icy - iry * 0.2}" rx="2.6" ry="4" fill="#fff" opacity=".7"/>
      <path d="${white}" fill="none"/>
      <path d="M${I[0]} ${I[1]} ${top1} ${top2} L${O[0]} ${O[1] - 60} L${I[0]} ${I[1] - 60}Z" fill="#d7cbe6" opacity=".0"/>
    </g>
    <path d="${lash}" fill="${C.ink}"/>
    <path d="M${O[0]} ${O[1]} C${s * w * 0.32} ${lowY} ${-s * w * 0.30} ${lowY * 1.05} ${I[0]} ${I[1]}" fill="none" stroke="${C.inkSoft}" stroke-width="2.2" opacity=".7"/>
    <path d="M${O[0] - s * 4} ${O[1] + 4} q${s * 9} 2 ${s * 13} 9" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>
  </g>`;
}

function brow(cx, cy, w, s, ang, lift) {
  // tapered brow: thick outer-middle, thin inner end
  const a = ang, L = w;
  return `<g transform="translate(${cx} ${cy - lift}) rotate(${a * s})">
    <path d="M${-s * L / 2} 2 C${-s * L * 0.2} -6 ${s * L * 0.2} -7 ${s * L / 2} 0 C${s * L * 0.2} -3 ${-s * L * 0.2} -2 ${-s * L / 2} 2Z" fill="${C.hairMid}" stroke="${C.hair}" stroke-width="2.5" stroke-linejoin="round"/>
  </g>`;
}

const EXPR = {
  neutral: { o: 1, lw: 0, ir: 1, browAng: 0, browLift: 0, mouth: 'flat' },
  smile: { o: 0.82, lw: 0.9, ir: 1.0, browAng: -4, browLift: 3, mouth: 'smile' },
  focused: { o: 0.62, lw: 0, ir: 0.92, browAng: -7, browLift: -4, mouth: 'tight' },
  surprised: { o: 1.14, lw: 0, ir: 0.82, pup: 0.55, browAng: 6, browLift: 15, mouth: 'o' },
  sleep: { closed: true, browAng: 3, browLift: -2, mouth: 'sleep' },
};

function mouth(kind, open, cx = 262, cy = 452) {
  const dark = '#8c3b4f';
  switch (kind) {
    case 'smile':
      return open
        ? `<path d="M${cx - 24} ${cy - 4} Q${cx} ${cy + 30} ${cx + 24} ${cy - 5} Q${cx} ${cy} ${cx - 24} ${cy - 4}Z" fill="${dark}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><path d="M${cx - 17} ${cy - 2} Q${cx} ${cy + 3} ${cx + 17} ${cy - 3} L${cx + 15} ${cy + 3} Q${cx} ${cy + 7} ${cx - 15} ${cy + 3}Z" fill="#fff" opacity=".95"/><ellipse cx="${cx}" cy="${cy + 15}" rx="11" ry="6" fill="#e56f7e"/>`
        : `<path d="M${cx - 22} ${cy - 3} Q${cx} ${cy + 17} ${cx + 22} ${cy - 5}" fill="none" stroke="${C.ink}" stroke-width="3.6" stroke-linecap="round"/><path d="M${cx + 22} ${cy - 5} q5 -1 7 -6" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>`;
    case 'tight':
      return open
        ? `<ellipse cx="${cx}" cy="${cy + 3}" rx="12" ry="8" fill="${dark}" stroke="${C.ink}" stroke-width="3"/>`
        : `<path d="M${cx - 16} ${cy + 2} Q${cx} ${cy + 3} ${cx + 16} ${cy}" fill="none" stroke="${C.ink}" stroke-width="3.4" stroke-linecap="round"/>`;
    case 'o':
      return `<ellipse cx="${cx}" cy="${cy + 8}" rx="${open ? 13 : 9}" ry="${open ? 17 : 12}" fill="${dark}" stroke="${C.ink}" stroke-width="3.2"/><ellipse cx="${cx}" cy="${cy + 16}" rx="6" ry="4" fill="#e56f7e"/>`;
    case 'sleep':
      return `<ellipse cx="${cx}" cy="${cy + 3}" rx="9" ry="5" fill="${dark}" opacity=".9"/><path d="M${cx - 9} ${cy + 3} Q${cx} ${cy - 2} ${cx + 9} ${cy + 3}" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round"/>`;
    default:
      return open
        ? `<path d="M${cx - 17} ${cy - 1} Q${cx} ${cy + 22} ${cx + 17} ${cy - 2} Q${cx} ${cy + 3} ${cx - 17} ${cy - 1}Z" fill="${dark}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><ellipse cx="${cx}" cy="${cy + 10}" rx="8" ry="4" fill="#e56f7e"/>`
        : `<path d="M${cx - 15} ${cy} Q${cx} ${cy + 9} ${cx + 15} ${cy - 1}" fill="none" stroke="${C.ink}" stroke-width="3.4" stroke-linecap="round"/>`;
  }
}

// ---- head ------------------------------------------------------------------
export function head({ expr = 'neutral', blink = false, talk = false, glasses = true, look = 0, glow = 0, rim = '#ffd7a8', rimA = 0.85, id = 'h' } = {}) {
  const E = { ...EXPR[expr] };
  if (blink && !E.closed) { E.closed = true; }
  const faceD = 'M152 236 C144 334 168 428 224 488 Q244 510 262 502 C334 476 384 414 392 330 L394 236 Z';
  // locks (filled shapes, tips downward)
  const locks = [
    ['M148 176 C122 262 126 350 148 440 C170 392 180 336 182 268 Z', 'L'],        // far side lock
    ['M166 170 C142 230 152 268 190 296 C206 274 214 236 230 196 Z', 'a'],
    ['M218 150 C212 212 222 254 256 290 C276 262 284 220 296 150 Z', 'b'],
    ['M284 140 C292 196 310 238 342 272 C352 232 348 190 346 140 Z', 'c'],
    ['M356 160 C392 214 400 300 388 384 C370 338 358 300 352 238 Z', 'd'],         // near side lock
  ];
  const lockPaths = locks.map(([d]) => d);
  const cap = 'M134 304 C112 190 146 98 234 70 C300 50 388 68 420 140 C442 192 436 266 422 336 L398 270 L172 226 Z';
  const back = 'M126 336 C104 226 128 118 214 78 C282 48 372 58 418 124 C450 170 452 250 432 332 C430 384 444 436 424 478 C406 452 398 424 392 404 L132 404 C128 386 122 360 126 336Z';
  const g = glasses;
  const farLens = { x: 196, y: 344, w: 106, h: 98 };
  const nearLens = { x: 324, y: 344, w: 120, h: 102 };
  const lensRect = (L) => `<rect x="${L.x - L.w / 2}" y="${L.y - L.h / 2}" width="${L.w}" height="${L.h}" rx="${L.h * 0.42}" ry="${L.h * 0.42}"/>`;
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 640" width="520" height="640">${defs(id)}
  <!-- back hair -->
  <path d="${back}" fill="url(#hairg${id})" stroke="${C.ink}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M142 400 C150 430 160 450 176 462 C170 430 164 410 160 400Z" fill="${C.hair}" opacity=".0"/>
  <!-- ear (near side) -->
  <g>
    <ellipse cx="396" cy="338" rx="22" ry="33" fill="${C.skin}" stroke="${C.ink}" stroke-width="3.2"/>
    <path d="M392 322 q12 6 6 24 q-4 6 -10 4" fill="none" stroke="${C.skinSh2}" stroke-width="3" stroke-linecap="round"/>
    <path d="M382 316 q14 -4 22 14" fill="none" stroke="${C.skinSh}" stroke-width="5" opacity=".7"/>
  </g>
  <!-- face -->
  <path d="${faceD}" fill="${C.skin}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>
  <clipPath id="fc${id}"><path d="${faceD}"/></clipPath>
  <g clip-path="url(#fc${id})">
    <!-- jaw/cheek shade on far side + under chin (hard cel edge) -->
    <path d="M150 300 C150 380 176 450 232 508 L250 520 C214 470 196 410 190 330 Z" fill="${C.skinSh}" opacity=".85"/>
    <path d="M300 520 C350 496 380 450 392 400 L392 520Z" fill="${C.skinSh}" opacity=".7"/>
    <!-- fringe cast shadow: fringe silhouette shifted down -->
    <g transform="translate(8 26)" fill="${C.skinSh}" opacity=".95">
      <path d="${cap}"/><path d="${lockPaths[1]}"/><path d="${lockPaths[2]}"/><path d="${lockPaths[3]}"/>
    </g>
    <g transform="translate(6 12)" fill="${C.skinSh2}" opacity=".55"><path d="${lockPaths[2]}"/></g>
  </g>
  <!-- blush -->
  <g filter="url(#soft2${id})" opacity="${expr === 'smile' ? 0.75 : 0.5}">
    <ellipse cx="176" cy="414" rx="26" ry="12" fill="${C.blush}"/><ellipse cx="364" cy="414" rx="28" ry="12" fill="${C.blush}"/>
  </g>
  <path d="M158 426 l14 0 M170 426 l-6 10 M184 426 l-6 10" stroke="${C.blush}" stroke-width="2.4" stroke-linecap="round" opacity="${expr === 'smile' ? 0.8 : 0}"/>
  <!-- brows -->
  ${brow(194, 284, 66, -1, E.browAng || 0, E.browLift || 0)}
  ${brow(330, 282, 74, 1, E.browAng || 0, E.browLift || 0)}
  <!-- eyes -->
  ${eye(id, 196, 344, 80, 94, -1, { ...E, lx: look })}
  ${eye(id, 324, 344, 90, 100, 1, { ...E, lx: look })}
  <!-- nose + mouth -->
  <path d="M258 408 q7 7 14 2" fill="none" stroke="${C.skinSh2}" stroke-width="3" stroke-linecap="round"/>
  ${mouth(E.mouth, talk)}
  <!-- fringe + side locks -->
  ${locks.map(([d, k]) => `<path d="${d}" fill="url(#hairg${id})" stroke="${C.ink}" stroke-width="3.2" stroke-linejoin="round"/>`).join('')}
  ${g ? glassesSvg(id, farLens, nearLens, lensRect, glow) : ''}
  <path d="${cap}" fill="url(#hairg${id})"/>
  <path d="M134 304 C112 190 146 98 234 70 C300 50 388 68 420 140 C442 192 436 266 422 336" fill="none" stroke="${C.ink}" stroke-width="3.6" stroke-linecap="round"/>
  <!-- ahoge -->
  <path d="M262 62 C250 24 280 -4 306 4 C288 8 276 28 280 62Z" fill="${C.hair}" stroke="${C.ink}" stroke-width="3"/>
  <!-- hair highlights: angel-ring band + strand hints -->
  <path d="M176 156 C214 102 322 90 392 130 C320 114 236 124 186 178Z" fill="${C.hairHi}" opacity=".5"/>
  <path d="M196 140 C236 112 316 106 366 128 C318 118 250 126 204 156Z" fill="${C.hairHi2}" opacity=".5"/>
  <path d="M232 112 C262 100 300 98 330 104" fill="none" stroke="#dfe6ff" stroke-width="4" stroke-linecap="round" opacity=".55"/>
  <path d="M236 190 C238 232 246 262 262 292" fill="none" stroke="${C.hairHi}" stroke-width="5" stroke-linecap="round" opacity=".55"/>
  <path d="M312 184 C318 214 328 244 344 270" fill="none" stroke="${C.hairHi}" stroke-width="5" stroke-linecap="round" opacity=".55"/>
  <path d="M168 200 C160 250 168 292 184 316" fill="none" stroke="${C.hairHi}" stroke-width="4" stroke-linecap="round" opacity=".4"/>
  <!-- hair inner shade (cel) -->
  <path d="M146 300 C132 360 140 410 156 440 C150 390 154 340 168 300Z" fill="#0e1020" opacity=".55"/>
  <!-- rim light (near side) -->
  <g fill="none" stroke="${rim}" stroke-linecap="round" opacity="${rimA}">
    <path d="M406 140 C432 190 434 262 420 330" stroke-width="6"/>
    <path d="M392 262 C394 300 392 340 388 380" stroke-width="5" opacity=".8"/>
    <path d="M384 330 C378 410 336 474 276 512" stroke-width="5" opacity=".7"/>
    <path d="M330 78 C366 82 398 104 412 130" stroke-width="5" opacity=".9"/>
  </g>
  </svg>`;
  return out;
}

function glassesSvg(id, F, N, rectOf, glow) {
  return `<g>
    <clipPath id="lcf${id}">${rectOf(F)}</clipPath><clipPath id="lcn${id}">${rectOf(N)}</clipPath>
    <g clip-path="url(#lcf${id})"><rect x="${F.x - 60}" y="${F.y - 50}" width="130" height="100" fill="#cfe6e8" opacity=".14"/>
      <path d="M${F.x - 36} ${F.y + 20} L${F.x - 6} ${F.y - 44} L${F.x + 6} ${F.y - 44} L${F.x - 24} ${F.y + 20}Z" fill="#fff" opacity=".22"/></g>
    <g clip-path="url(#lcn${id})"><rect x="${N.x - 70}" y="${N.y - 50}" width="140" height="100" fill="#cfe6e8" opacity=".14"/>
      <path d="M${N.x - 40} ${N.y + 22} L${N.x - 8} ${N.y - 46} L${N.x + 6} ${N.y - 46} L${N.x - 28} ${N.y + 22}Z" fill="#fff" opacity=".22"/>
      ${glow > 0 ? `<ellipse cx="${N.x + 6}" cy="${N.y - 2}" rx="68" ry="56" fill="url(#glow${id})" opacity="${glow * 0.42}"/><rect x="${N.x - 44}" y="${N.y - 40}" width="84" height="3" fill="${C.green}" opacity="${glow * 0.9}"/><rect x="${N.x - 44}" y="${N.y + 36}" width="60" height="3" fill="${C.green}" opacity="${glow * 0.7}"/>` : ''}
    </g>
    ${glow > 0 ? `<ellipse cx="${F.x + 4}" cy="${F.y}" rx="52" ry="44" fill="url(#glow${id})" opacity="${glow * 0.22}"/>` : ''}
    <g fill="none" stroke="${C.frame}" stroke-linejoin="round">
      <g stroke-width="5">${rectOf(F)}${rectOf(N)}</g>
      <path d="M${F.x + F.w / 2 - 2} ${F.y - 14} Q${(F.x + F.w / 2 + N.x - N.w / 2) / 2} ${F.y - 24} ${N.x - N.w / 2 + 2} ${N.y - 14}" stroke-width="5" stroke-linecap="round"/>
      <path d="M${F.x - F.w / 2} ${F.y - 6} L${F.x - F.w / 2 - 12} ${F.y - 10}" stroke-width="5" stroke-linecap="round"/>
    </g>
    <g fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".55"><path d="M${N.x - N.w / 2 + 14} ${N.y - N.h / 2 + 6} Q${N.x - 10} ${N.y - N.h / 2 - 1} ${N.x + 10} ${N.y - N.h / 2 + 2}"/></g>
    <!-- G2 temple arm: hinge, thick tech section, tapering behind ear -->
    <path d="M${N.x + N.w / 2 - 2} ${N.y - 8} L${N.x + N.w / 2 + 40} ${N.y - 20}" fill="none" stroke="${C.frame}" stroke-width="16" stroke-linecap="round"/>
    <path d="M${N.x + N.w / 2 + 38} ${N.y - 20} Q${N.x + N.w / 2 + 62} ${N.y - 28} ${N.x + N.w / 2 + 70} ${N.y - 4}" fill="none" stroke="${C.frame}" stroke-width="7" stroke-linecap="round"/>
    <path d="M${N.x + N.w / 2 + 2} ${N.y - 11} L${N.x + N.w / 2 + 36} ${N.y - 21}" fill="none" stroke="#6b6f84" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <circle cx="${N.x + N.w / 2 + 12}" cy="${N.y - 10}" r="3.6" fill="${C.green}"/>
    <circle cx="${N.x + N.w / 2 + 12}" cy="${N.y - 10}" r="9" fill="${C.green}" opacity="${0.18 + glow * 0.4}"/>
  </g>`;
}
