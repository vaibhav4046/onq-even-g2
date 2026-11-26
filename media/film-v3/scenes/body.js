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

// ---- forearm + hand reaching in from the right (optionally holding the G2) ---
export function handReach({ glasses = false } = {}) {
  const W = 900, H = 460;
  const g = glasses ? `<g transform="translate(70 118) rotate(-12)">
      <g fill="#cfe9e4" opacity=".28"><rect x="0" y="0" width="86" height="64" rx="24"/><rect x="104" y="0" width="86" height="64" rx="24"/></g>
      <g fill="none" stroke="#2b2c36" stroke-width="7"><rect x="0" y="0" width="86" height="64" rx="24"/><rect x="104" y="0" width="86" height="64" rx="24"/><path d="M86 20 Q95 12 104 20"/></g>
      <path d="M190 14 L300 -8" stroke="#2b2c36" stroke-width="13" stroke-linecap="round"/><path d="M0 14 L-40 0" stroke="#2b2c36" stroke-width="9" stroke-linecap="round"/>
      <circle cx="212" cy="10" r="5" fill="#39ff88"/><circle cx="212" cy="10" r="18" fill="#39ff88" opacity=".25"/></g>` : '';
  const finger = (x, y, a, l = 120) => `<g transform="translate(${x} ${y}) rotate(${a})"><rect x="${-l}" y="-17" width="${l}" height="34" rx="17" fill="${C.skin}" stroke="${C.ink}" stroke-width="3.4"/><path d="M${-l + 22} -3 H-10" stroke="${C.skinSh2}" stroke-width="2.4" opacity=".7"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <path d="M900 90 L560 100 C500 100 470 170 476 230 C482 300 520 340 570 346 L900 380Z" fill="${C.jacket}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M900 90 L560 100 C520 104 500 140 494 176 L900 190Z" fill="${C.jacketHi}" opacity=".55"/>
  <path d="M900 300 L560 330 C530 320 506 290 492 252 L900 250Z" fill="${C.jacketSh2}" opacity=".55"/>
  <path d="M470 120 C440 160 436 260 468 320 L520 316 C500 260 500 170 520 112Z" fill="${C.jacketSh}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M470 150 C400 150 340 160 300 190 C280 220 290 270 320 290 C380 316 430 312 470 304Z" fill="${C.skin}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>
  ${finger(330, 176, -6, 150)}${finger(320, 214, 2, 160)}${finger(324, 252, 8, 140)}
  <path d="M420 290 C380 330 330 350 280 340 C262 336 262 316 280 312 C320 306 350 292 372 270Z" fill="${C.skin}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>
  <path d="M470 150 C440 160 420 180 410 200" fill="none" stroke="${C.skinSh}" stroke-width="10" opacity=".6"/>
  ${g}</svg>`;
  return { svg, w: W, h: H };
}

// ---- standing, waist-up, slight 3/4 left ------------------------------------
export function standing({ rim = '#ffd7a8', armUp = false, id = 'bs' } = {}) {
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


