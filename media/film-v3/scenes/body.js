// Bodies (no head). Each returns {svg,w,h,ax,ay}: (ax,ay) = neck-top anchor where head chin attaches.
import { C } from './char.js';

const tint = (rim) => rim;

function shell(w, h, inner, id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>
  <linearGradient id="jg${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.jacket}"/><stop offset="1" stop-color="${C.jacketSh}"/></linearGradient>
  <filter id="bs${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5"/></filter>
  <style>.s *{vector-effect:non-scaling-stroke}</style>
  </defs>${inner}</svg>`;
}

const hand = (x, y, r = 1, flip = 1, curl = 0) => `<g transform="translate(${x} ${y}) scale(${r * flip} ${r})">
  <path d="M-26 -8 C-30 14 -22 40 -6 52 C8 58 26 50 30 30 C34 10 28 -10 14 -16 C2 -20 -16 -20 -26 -8Z" fill="${C.skin}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M-6 42 q4 -16 2 -34 M8 46 q4 -14 3 -30 M20 40 q3 -12 2 -24" stroke="${C.skinSh2}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
  <path d="M-22 10 C-24 26 -16 42 -4 50 C-12 36 -14 22 -12 8Z" fill="${C.skinSh}" opacity=".8"/>
</g>`;

// ---- forearm + hand reaching in from the right (proper ergonomic temple pinch grip for Even G2) ---
export function handReach({ glasses = false } = {}) {
  const W = 900, H = 460;
  // Temple arm passes directly through (310..420, y=155..170) between forefinger above and thumb below.
  const g = glasses ? `<g transform="translate(88 158) rotate(-5)">
      <g fill="#7cebb0" opacity=".18"><rect x="0" y="0" width="88" height="66" rx="24"/><rect x="106" y="0" width="88" height="66" rx="24"/></g>
      <g fill="#ffffff" opacity=".16"><polygon points="18,54 38,8 50,8 30,54"/><polygon points="124,54 144,8 156,8 136,54"/></g>
      <g fill="none" stroke="${C.frame}" stroke-width="7.5" stroke-linejoin="round"><rect x="0" y="0" width="88" height="66" rx="24"/><rect x="106" y="0" width="88" height="66" rx="24"/><path d="M88 22 Q97 14 106 22"/></g>
      <path d="M194 18 L344 -2" stroke="${C.frame}" stroke-width="14" stroke-linecap="round"/>
      <path d="M196 15 L292 2" stroke="#537864" stroke-width="3" stroke-linecap="round" opacity=".75"/>
      <path d="M0 16 L-36 4" stroke="${C.frame}" stroke-width="8" stroke-linecap="round"/>
      <circle cx="218" cy="14" r="4.5" fill="${C.green}"/><circle cx="218" cy="14" r="16" fill="${C.green}" opacity=".25"/></g>` : '';
  const backFinger = (x, y, a, l = 112) => `<g transform="translate(${x} ${y}) rotate(${a})"><rect x="${-l}" y="-15" width="${l}" height="30" rx="15" fill="${C.skinSh}" stroke="${C.ink}" stroke-width="3.2"/><path d="M${-l + 18} -2 H-10" stroke="${C.skinSh2}" stroke-width="2.2" opacity=".7"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- forearm sleeve -->
  <path d="M900 108 L552 116 C496 116 468 176 474 236 C480 300 520 338 570 344 L900 374Z" fill="${C.jacket}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M900 108 L552 116 C514 120 496 150 490 184 L900 198Z" fill="${C.jacketHi}" opacity=".5"/>
  <path d="M900 298 L560 326 C530 318 506 290 492 256 L900 256Z" fill="${C.jacketSh2}" opacity=".55"/>
  <path d="M472 132 C446 168 442 260 472 318 L522 314 C502 260 502 178 522 126Z" fill="${C.jacketSh}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <!-- back curled middle/ring/pinky fingers -->
  ${backFinger(410, 218, 12, 108)}${backFinger(416, 250, 18, 100)}${backFinger(424, 280, 24, 88)}
  <!-- palm base -->
  <path d="M472 158 C422 154 382 172 356 206 C344 234 362 282 406 298 C442 310 462 308 474 300Z" fill="${C.skin}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>
  <!-- G2 glasses positioned naturally along temple pinch line -->
  ${g}
  <!-- foreground index finger resting gently over the top of the temple arm -->
  <path d="M412 162 C380 144 338 140 296 148 C278 152 276 172 296 176 C332 180 368 176 404 186Z" fill="${C.skin}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>
  <path d="M356 156 Q336 164 316 158" fill="none" stroke="${C.skinSh2}" stroke-width="2.2" opacity=".75" stroke-linecap="round"/>
  <!-- foreground thumb bracing underneath the temple arm -->
  <path d="M430 256 C394 238 358 214 328 192 C310 180 296 196 310 212 C338 242 374 274 414 292Z" fill="${C.skin}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>
  <path d="M360 220 Q344 226 330 214" fill="none" stroke="${C.skinSh2}" stroke-width="2.2" opacity=".7" stroke-linecap="round"/>
  </svg>`;
  return { svg, w: W, h: H };
}

// ---- standing, waist-up, slight 3/4 left ------------------------------------
export function standing({ rim = '#86ffaf', armUp = false, id = 'bs' } = {}) {
  const W = 700, H = 820, ax = 352, ay = 84;
  const sleeveL = 'M118 270 C70 330 54 470 60 640 C78 676 118 684 152 664 C156 560 166 440 186 340Z';
  const sleeveR = 'M600 270 C650 330 668 470 660 640 C640 676 596 684 566 664 C566 560 552 440 536 340Z';
  const torso = 'M118 270 C128 178 220 112 310 98 L394 98 C486 114 584 178 600 270 L566 664 L152 664 Z';
  const inner = `
  <!-- neck -->
  <path d="M322 0 L384 0 L390 96 L316 96Z" fill="${C.skin}" stroke="${C.ink}" stroke-width="3.2"/>
  <path d="M322 0 L384 0 L386 46 C366 66 340 64 320 44Z" fill="${C.skinSh}" opacity=".95"/>
  <g class="s" transform="translate(352 0) scale(.88 1) translate(-352 0)">
  <!-- torso -->
  <path d="${torso}" fill="url(#jg${id})" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <!-- tee -->
  <path d="M322 92 L392 92 L402 176 C374 214 340 214 312 176Z" fill="${C.tee}" stroke="${C.ink}" stroke-width="3"/>
  <path d="M322 96 C336 124 366 130 396 112" fill="none" stroke="${C.teeSh}" stroke-width="10" opacity=".7"/>
  <!-- jacket shade (cel): far side + under collar + hem folds -->
  <path d="M118 270 C128 178 200 124 262 106 C214 170 196 260 200 400 C190 520 180 600 152 664 L118 560Z" fill="${C.jacketSh2}" opacity=".5"/>
  <path d="M152 664 L566 664 L560 618 C440 640 270 640 156 618Z" fill="${C.jacketSh2}" opacity=".45"/>
  <path d="M252 262 C300 300 330 360 322 470" fill="none" stroke="${C.jacketSh2}" stroke-width="5" stroke-linecap="round" opacity=".6"/>
  <path d="M470 300 C500 360 506 440 496 540" fill="none" stroke="${C.jacketHi}" stroke-width="6" stroke-linecap="round" opacity=".5"/>
  <!-- zipper + pocket flaps -->
  <path d="M356 214 C358 360 362 500 366 664" fill="none" stroke="${C.ink}" stroke-width="4.5"/>
  <path d="M356 214 C358 360 362 500 366 664" fill="none" stroke="#c7d4cc" stroke-width="1.6" stroke-dasharray="4 5"/>
  <rect x="352" y="206" width="14" height="22" rx="4" fill="#d6dfd9" stroke="${C.ink}" stroke-width="2.4"/>
  <path d="M232 470 L316 482 L314 518 L230 510Z" fill="${C.jacketSh}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round" opacity=".95"/>
  <path d="M410 484 L494 472 L496 508 L412 520Z" fill="${C.jacketSh}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round" opacity=".95"/>
  <!-- collar (stand-up) -->
  <path d="M312 56 C282 70 262 96 250 138 C276 168 316 190 352 214 L358 150 L324 92Z" fill="${C.jacket}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>
  <path d="M312 56 C282 70 262 96 250 138 C266 130 290 124 314 130Z" fill="${C.jacketSh}" opacity=".75"/>
  <path d="M396 56 C430 70 452 98 464 144 C440 172 400 196 362 216 L358 150 L392 92Z" fill="${C.jacketHi}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>
  <path d="M396 56 C430 70 452 98 464 144 C446 138 420 134 398 138Z" fill="${C.jacket}" opacity=".9"/>
  <!-- sleeves -->
  <path d="${sleeveL}" fill="${C.jacket}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M118 270 C70 330 54 470 60 640 C70 660 90 668 110 668 C100 560 112 420 150 320Z" fill="${C.jacketSh2}" opacity=".65"/>
  <path d="M96 440 C120 456 150 458 170 448 M92 520 C118 536 150 538 168 528" fill="none" stroke="${C.jacketSh2}" stroke-width="4" stroke-linecap="round" opacity=".7"/>
  <path d="${sleeveR}" fill="${C.jacket}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M600 270 C650 330 668 470 660 640 C650 660 636 666 622 668 C638 560 628 430 596 320Z" fill="${C.jacketHi}" opacity=".55"/>
  <path d="M652 450 C628 466 598 468 576 458 M656 530 C632 546 600 548 578 538" fill="none" stroke="${C.jacketSh2}" stroke-width="4" stroke-linecap="round" opacity=".7"/>
  <!-- cuffs -->
  <path d="M58 626 C80 664 122 672 154 654 L156 690 C120 712 76 704 56 668Z" fill="${C.jacketSh}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>
  <path d="M662 626 C640 664 596 672 566 654 L564 690 C598 712 642 704 662 668Z" fill="${C.jacketSh}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>
  ${hand(106, 696, 1.1, 1)}${hand(612, 696, 1.1, -1)}
  <!-- rim light -->
  <g fill="none" stroke="${tint(rim)}" stroke-linecap="round" opacity=".85">
    <path d="M436 118 C510 150 572 204 584 274" stroke-width="7"/>
    <path d="M590 290 C636 346 652 470 646 616" stroke-width="6" opacity=".8"/>
    <path d="M464 148 C450 120 436 100 408 70" stroke-width="5" opacity=".8"/>
  </g></g>`;
  return { svg: shell(W, H, inner, id), w: W, h: H, ax, ay };
}


