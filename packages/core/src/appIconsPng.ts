import { encodeGray4Png, renderCountdownRing } from './pngRing.js';
import type { RingRenderStats } from './pngRing.js';
import type { HudState } from './types.js';

export type AppBadgeKind =
  | 'calendar_gmail'
  | 'notion'
  | 'telegram'
  | 'pc_ai_host'
  | 'onq_os'
  | 'coding_pr'
  | 'career_pack'
  | 'safety_no'
  | 'conflict_409'
  | 'receipt_ok'
  | 'killswitch_423'
  | 'stale_offline'
  | 'focus_music';

const GLYPH_5X7: Record<string, readonly string[]> = {
  '3': ['1111.', '....1', '....1', '.111.', '....1', '....1', '1111.'],
  '1': ['..1..', '.11..', '..1..', '..1..', '..1..', '..1..', '.111.'],
  N: ['1...1', '11..1', '1.1.1', '1..11', '1...1', '1...1', '1...1'],
  M: ['1...1', '11.11', '1.1.1', '1...1', '1...1', '1...1', '1...1'],
  '>': ['1....', '.1...', '..1..', '...1.', '..1..', '.1...', '1....'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '11111'],
  '!': ['..1..', '..1..', '..1..', '..1..', '..1..', '.....', '..1..'],
  X: ['1...1', '1...1', '.1.1.', '..1..', '.1.1.', '1...1', '1...1'],
};

/**
 * Picks the authentic 4-bit app/state badge for the active G2 frame or LiveUI surface.
 */
export function resolveHudBadgeKind(state: HudState, liveUiTitle?: string): AppBadgeKind {
  const hint = liveUiTitle ?? (state.phase === 'idle' && state.answerLines.length > 0 ? state.answerLines.join(' ') : '');
  if (hint) {
    if (/PR GATE|SOFTWARE_DELIVERY|CODING_PR|CODING/i.test(hint)) return 'coding_pr';
    if (/CAREER|JOB/i.test(hint)) return 'career_pack';
    if (/KILL SWITCH|PAUSED|423/i.test(hint)) return 'killswitch_423';
    if (/MUSIC|FOCUS/i.test(hint)) return 'focus_music';
    if (/MORNING|BRIEF|EVENING|RECAP/i.test(hint)) return 'calendar_gmail';
    if (/TELEGRAM/i.test(hint)) return 'telegram';
    if (/NOTION/i.test(hint)) return 'notion';
    if (/PC HOST|OLLAMA|CLAUDE|CODEX|OMNIROUTE/i.test(hint)) return 'pc_ai_host';
    if (/CAL|MAIL/i.test(hint)) return 'calendar_gmail';
  }
  if (state.phase === 'conflict') return 'conflict_409';
  if (state.phase === 'preview' || state.phase === 'wrap_up') return 'safety_no';
  if (state.phase === 'done') return 'receipt_ok';
  if (state.phase === 'stale') return 'stale_offline';
  if (state.phase === 'error' || state.phase === 'undone') return 'killswitch_423';

  const card = state.cards[state.selectedCardIndex];
  if (!card) return 'onq_os';
  if (card.id === 'card-telegram-bridge') return 'telegram';
  if (card.id === 'card-computer-proactive') return 'pc_ai_host';
  if (card.id === 'card-unified-os') return 'onq_os';
  if (card.id === 'card-proactive-harness') return 'onq_os';
  if (card.kind === 'NOTION_DUE' || /\b(notion|design|task|review)\b/i.test(`${card.title} ${card.contextLine2}`)) {
    return 'notion';
  }
  if (card.kind === 'MEETING' || card.kind === 'EMAIL_ASK') return 'calendar_gmail';
  return 'onq_os';
}

/**
 * Renders a 76x76 4-bit grayscale PNG real-app badge preserving >= 70% pure-black optical field.
 */
export function renderAppBadgePng(
  kind: AppBadgeKind,
  opts: { size?: number; tick?: number; cardIndex?: number; cardTotal?: number } = {},
): RingRenderStats {
  const size = opts.size ?? 76;
  const tick = opts.tick ?? 0;
  const rowBytes = 1 + Math.ceil(size / 2);
  const raw = new Uint8Array(rowBytes * size);
  const grid = new Uint8Array(size * size);

  const px = (x: number, y: number, v: number) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= size || iy < 0 || iy >= size) return;
    const nib = Math.max(0, Math.min(15, Math.round(v)));
    const idx = iy * size + ix;
    if (nib > grid[idx]) grid[idx] = nib;
  };

  const fillRect = (x: number, y: number, w: number, h: number, v: number) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) px(x + dx, y + dy, v);
    }
  };

  const clearRect = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      const iy = Math.round(y + dy);
      if (iy < 0 || iy >= size) continue;
      for (let dx = 0; dx < w; dx++) {
        const ix = Math.round(x + dx);
        if (ix >= 0 && ix < size) grid[iy * size + ix] = 0;
      }
    }
  };

  const strokeRect = (x: number, y: number, w: number, h: number, v: number, t = 2) => {
    fillRect(x, y, w, t, v);
    fillRect(x, y + h - t, w, t, v);
    fillRect(x, y, t, h, v);
    fillRect(x + w - t, y, t, h, v);
  };

  const drawLine = (x0: number, y0: number, x1: number, y1: number, v: number, thick = 1) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      const x = x0 + (x1 - x0) * k;
      const y = y0 + (y1 - y0) * k;
      if (thick <= 1) px(x, y, v);
      else fillRect(x - 0.5, y - 0.5, thick, thick, v);
    }
  };

  const drawCircle = (cx: number, cy: number, r: number, v: number, thick = 2) => {
    for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) {
      for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r && d >= r - thick) px(x, y, v);
      }
    }
  };

  const drawGlyph = (ch: string, x: number, y: number, scale: number, v: number) => {
    const bmp = GLYPH_5X7[ch];
    if (!bmp) return;
    for (let r = 0; r < bmp.length; r++) {
      for (let c = 0; c < bmp[r].length; c++) {
        if (bmp[r][c] === '1') fillRect(x + c * scale, y + r * scale, scale, scale, v);
      }
    }
  };

  // Subtle Even G2 corner reticle brackets
  const L = Math.max(6, Math.round(size * 0.1));
  const m = 3;
  fillRect(m, m, L, 1, 6);
  fillRect(m, m, 1, L, 6);
  fillRect(size - m - L, m, L, 1, 6);
  fillRect(size - m - 1, m, 1, L, 6);
  fillRect(m, size - m - 1, L, 1, 6);
  fillRect(m, size - m - L, 1, L, 6);
  fillRect(size - m - L, size - m - 1, L, 1, 6);
  fillRect(size - m - 1, size - m - L, 1, L, 6);

  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2 - 2;

  switch (kind) {
    case 'calendar_gmail': {
      // Google Calendar "31" frame + Gmail "M" mini envelope bottom-right
      strokeRect(13, 14, 42, 40, 13, 2);
      fillRect(13, 14, 42, 8, 8);
      fillRect(21, 10, 4, 7, 15);
      fillRect(43, 10, 4, 7, 15);
      drawGlyph('3', 20, 29, 2, 15);
      drawGlyph('1', 34, 29, 2, 15);
      // Mini Gmail M corner badge
      clearRect(41, 41, 24, 18);
      strokeRect(42, 42, 22, 16, 15, 2);
      drawLine(43, 44, 53, 52, 14, 2);
      drawLine(62, 44, 53, 52, 14, 2);
      break;
    }
    case 'notion': {
      // Iconic Notion 3D cube bevel + bold crisp N glyph
      drawLine(22, 14, 56, 14, 10, 2);
      drawLine(16, 20, 22, 14, 10, 2);
      drawLine(50, 20, 56, 14, 12, 2);
      drawLine(16, 20, 16, 54, 10, 2);
      drawLine(16, 54, 22, 58, 8, 2);
      drawLine(56, 14, 56, 50, 10, 2);
      strokeRect(20, 20, 38, 38, 15, 2);
      drawGlyph('N', 29, 29, 4, 15);
      break;
    }
    case 'telegram': {
      // Telegram paper plane + concentric broadcast wave arcs
      const plane = [
        [14, 38, 59, 18],
        [59, 18, 49, 55],
        [49, 55, 34, 43],
        [34, 43, 14, 38],
        [34, 43, 58, 19],
        [32, 43, 30, 54],
      ] as const;
      for (const [x0, y0, x1, y1] of plane) drawLine(x0, y0, x1, y1, 15, 2);
      // Inner fold highlight
      drawLine(23, 38, 53, 22, 9, 1);
      // Subtle top-left signal waves
      const pulse = tick % 2 === 0 ? 12 : 7;
      drawCircle(18, 22, 7, pulse, 1);
      drawCircle(18, 22, 12, Math.max(4, pulse - 4), 1);
      break;
    }
    case 'pc_ai_host': {
      // Claude 8-ray starburst upper-left + local PC prompt frame lower-right
      const sx = 27;
      const sy = 25;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const r = i % 2 === 0 ? 12 : 9;
        drawLine(sx, sy, sx + Math.cos(a) * r, sy + Math.sin(a) * r, 15, 2);
      }
      clearRect(33, 34, 31, 24);
      strokeRect(34, 35, 29, 22, 14, 2);
      drawGlyph('>', 39, 41, 2, 15);
      drawGlyph('_', 49, 41, 2, 12);
      break;
    }
    case 'onq_os': {
      // Camera-free Even G2 dual-lens silhouette + R1 micro ring dot
      strokeRect(11, 23, 23, 18, 15, 2);
      strokeRect(42, 23, 23, 18, 15, 2);
      fillRect(34, 29, 8, 2, 15);
      drawLine(11, 27, 6, 22, 12, 2);
      drawLine(65, 27, 70, 22, 12, 2);
      // Active waveguide HUD lines inside lenses
      fillRect(15, 29, 13, 2, 9);
      fillRect(15, 34, 9, 1, 6);
      fillRect(46, 29, 13, 2, 11);
      fillRect(46, 34, 9, 1, 7);
      // Bottom R1 smart ring indicator
      drawCircle(cx, 53, 7, 13, 2);
      fillRect(cx - 1, 45, 3, 2, 15);
      break;
    }
    case 'coding_pr': {
      // Git PR merge branch inside shield
      drawLine(17, 15, 59, 15, 13, 2);
      drawLine(17, 15, 17, 42, 13, 2);
      drawLine(59, 15, 59, 42, 13, 2);
      drawLine(17, 42, 38, 59, 14, 2);
      drawLine(59, 42, 38, 59, 14, 2);
      drawCircle(29, 26, 4, 15, 2);
      drawCircle(29, 44, 4, 15, 2);
      drawCircle(47, 35, 4, 15, 2);
      drawLine(29, 30, 29, 40, 12, 2);
      drawLine(33, 27, 43, 33, 15, 2);
      break;
    }
    case 'career_pack': {
      // Crisp briefcase + AI match sparkle
      strokeRect(16, 25, 44, 30, 14, 2);
      strokeRect(29, 18, 18, 8, 13, 2);
      fillRect(18, 35, 40, 2, 9);
      fillRect(35, 34, 6, 5, 15);
      // 4-point sparkle upper-right
      drawLine(59, 10, 59, 20, 15, 1);
      drawLine(54, 15, 64, 15, 15, 1);
      break;
    }
    case 'safety_no': {
      // Shield + closed padlock (Default-NO invariant)
      drawLine(18, 14, 58, 14, 14, 2);
      drawLine(18, 14, 18, 41, 14, 2);
      drawLine(58, 14, 58, 41, 14, 2);
      drawLine(18, 41, 38, 58, 15, 2);
      drawLine(58, 41, 38, 58, 15, 2);
      drawCircle(38, 28, 6, 15, 2);
      strokeRect(29, 31, 18, 14, 15, 2);
      fillRect(36, 36, 4, 5, 12);
      break;
    }
    case 'conflict_409': {
      // Bold octagon + "!"
      drawLine(28, 13, 48, 13, 15, 2);
      drawLine(48, 13, 62, 27, 15, 2);
      drawLine(62, 27, 62, 46, 15, 2);
      drawLine(62, 46, 48, 59, 15, 2);
      drawLine(48, 59, 28, 59, 15, 2);
      drawLine(28, 59, 14, 46, 15, 2);
      drawLine(14, 46, 14, 27, 15, 2);
      drawLine(14, 27, 28, 13, 15, 2);
      drawGlyph('!', 32, 22, 3, 15);
      break;
    }
    case 'receipt_ok': {
      // Double ring + crisp checkmark
      drawCircle(cx, cy, 22, 14, 2);
      drawCircle(cx, cy, 18, 7, 1);
      drawLine(26, 36, 34, 45, 15, 3);
      drawLine(34, 45, 51, 26, 15, 3);
      break;
    }
    case 'killswitch_423': {
      // Bold octagon halt X
      drawCircle(cx, cy, 22, 15, 2);
      drawGlyph('X', 28, 22, 4, 15);
      break;
    }
    case 'stale_offline': {
      // Cloud outline + diagonal offline cut
      drawCircle(27, 36, 9, 12, 2);
      drawCircle(41, 30, 12, 12, 2);
      drawCircle(51, 37, 8, 12, 2);
      clearRect(24, 34, 29, 12);
      fillRect(22, 44, 33, 2, 13);
      drawLine(18, 51, 58, 18, 15, 2);
      break;
    }
    case 'focus_music': {
      // Beamed music eighth-notes + EQ bars
      fillRect(24, 18, 22, 4, 15);
      fillRect(24, 22, 3, 24, 14);
      fillRect(43, 18, 3, 24, 14);
      drawCircle(21, 46, 5, 15, 3);
      drawCircle(40, 43, 5, 15, 3);
      fillRect(54, 34, 3, 16, 10);
      fillRect(60, 26, 3, 24, 13);
      break;
    }
  }

  // Corridor position indicator pips at bottom edge
  const total = opts.cardTotal ?? 0;
  if (total > 1 && total <= 7) {
    const active = Math.max(0, Math.min(total - 1, opts.cardIndex ?? 0));
    const gap = 7;
    const startX = cx - ((total - 1) * gap) / 2;
    const pipY = size - 7;
    for (let i = 0; i < total; i++) {
      const px0 = startX + i * gap;
      if (i === active) fillRect(px0 - 1, pipY - 1, 3, 3, 15);
      else fillRect(px0, pipY, 2, 2, 6);
    }
  }

  let blackPixels = 0;
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const nib = grid[y * size + x];
      if (nib === 0) blackPixels++;
      const byteIdx = rowStart + 1 + (x >> 1);
      if ((x & 1) === 0) raw[byteIdx] |= (nib & 0x0f) << 4;
      else raw[byteIdx] |= nib & 0x0f;
    }
  }
  return encodeGray4Png(raw, size, size, blackPixels);
}

export function encodeAppBadgePng(
  kind: AppBadgeKind,
  opts: { size?: number; tick?: number; cardIndex?: number; cardTotal?: number } = {},
): Uint8Array {
  return renderAppBadgePng(kind, opts).pngBytes;
}

export function renderHudRingOrBadgePng(
  state: HudState,
  opts: { size?: number; tick?: number; liveUiTitle?: string } = {},
): Uint8Array {
  if (state.phase === 'armed') {
    return renderCountdownRing(Math.max(0, Math.min(1, 1 - state.armRemainingMs / 2000)), opts.size ?? 76).pngBytes;
  }
  return encodeAppBadgePng(resolveHudBadgeKind(state, opts.liveUiTitle), {
    size: opts.size ?? 76,
    tick: opts.tick,
    cardIndex: state.selectedCardIndex,
    cardTotal: state.cards.length,
  });
}
