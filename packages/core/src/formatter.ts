import type { HudState } from './types.js';

export const G2_MAX_COLS = 42;
export const G2_MAX_LINES = 7;
export const G2_MAX_UTF8_BYTES = 999;

const LVGL_ASCII_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B]/g, "'"],
  [/[\u201C\u201D\u201E\u201F]/g, '"'],
  [/[\u2013\u2014\u2015\u2212]/g, '-'],
  [/\u2026/g, '...'],
  [/\u00B7|\u2022/g, '|'],
  [/\u2192/g, '->'],
  [/\u2190/g, '<-'],
  [/\u00A0/g, ' '],
  [/[\u00E0-\u00E5]/g, 'a'],
  [/[\u00C0-\u00C5]/g, 'A'],
  [/[\u00E8-\u00EB]/g, 'e'],
  [/[\u00C8-\u00CB]/g, 'E'],
  [/[\u00EC-\u00EF]/g, 'i'],
  [/[\u00CC-\u00CF]/g, 'I'],
  [/[\u00F2-\u00F6]/g, 'o'],
  [/[\u00D2-\u00D6]/g, 'O'],
  [/[\u00F9-\u00FC]/g, 'u'],
  [/[\u00D9-\u00DC]/g, 'U'],
  [/\u00F1/g, 'n'],
  [/\u00D1/g, 'N'],
  [/\u00E7/g, 'c'],
  [/\u00C7/g, 'C'],
];

const textEncoder = new TextEncoder();

export function utf8ByteLength(text: string): number {
  return textEncoder.encode(text).length;
}

/**
 * Strips/transliterates any non-LVGL-ASCII glyph so firmware never renders blank boxes.
 */
export function sanitizeLvglAscii(input: string, preserveSpaces = false): string {
  let out = input ?? '';
  for (const [pattern, replacement] of LVGL_ASCII_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Remove remaining non-printable / non-ASCII characters except newline
  out = out.replace(/[^\x20-\x7E\n]/g, '');
  if (!preserveSpaces) {
    out = out.replace(/[ \t]+/g, ' ');
  }
  return out;
}

/**
 * Clips or word-wraps text cleanly on word boundaries within maxCols.
 */
export function wrapLine42(input: string, maxCols = G2_MAX_COLS): string[] {
  const clean = sanitizeLvglAscii(input).replace(/\r?\n/g, ' ').trim();
  if (!clean) return [''];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxCols) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, Math.max(1, maxCols - 2)) + '..');
      continue;
    }
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCols) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function clipLine42(input: string, maxCols = G2_MAX_COLS, preserveSpaces = false): string {
  const clean = sanitizeLvglAscii(input, preserveSpaces).replace(/\r?\n/g, ' ');
  const normalized = preserveSpaces ? clean.replace(/\s+$/g, '') : clean.trim();
  if (normalized.length <= maxCols) return normalized;
  const sub = normalized.slice(0, maxCols - 2);
  const lastSpace = sub.lastIndexOf(' ');
  const trimmed = lastSpace > Math.floor(maxCols * 0.45) ? sub.slice(0, lastSpace) : sub;
  return trimmed.replace(/[\s|(:]+$/, '') + '..';
}

export function padHeaderLine(left: string, right: string, maxCols = G2_MAX_COLS): string {
  const l = sanitizeLvglAscii(left).trim();
  const r = sanitizeLvglAscii(right).trim();
  if (!r) return clipLine42(l, maxCols);
  const maxLeft = Math.max(8, maxCols - r.length - 1);
  const trimmedLeft = l.length > maxLeft ? l.slice(0, maxLeft) : l;
  const spaces = Math.max(1, maxCols - trimmedLeft.length - r.length);
  return (trimmedLeft + ' '.repeat(spaces) + r).slice(0, maxCols);
}

export function renderAudioBarAscii(rms: number, width = 16): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(rms) ? rms : 0));
  const active = Math.round(clamped * width);
  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i < active) {
      bar += i > width * 0.72 ? '#' : '=';
    } else {
      bar += '-';
    }
  }
  return `[${bar}]`;
}

export interface FormattedLensFrame {
  header: string;
  lines: string[];
  bodyText: string;
  utf8Bytes: number;
  provenanceTag: 'LIVE' | 'DEMO' | 'STALE';
  ringProgress01?: number;
}

function formatTimeShort(iso: string): string {
  if (!iso || iso.length < 16) return 'NOW';
  const hhmm = iso.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : 'NOW';
}

export function formatLensFrame(state: HudState): FormattedLensFrame {
  const provenanceTag = state.sourceMode;
  const clock = formatTimeShort(state.syncedAtIso);
  const wx = state.weatherLabel ? `  ${sanitizeLvglAscii(state.weatherLabel).trim()}` : '';
  const ambientLeft = `${clock}${wx}`;
  let header = '';
  const body: string[] = [];
  let statusFoot = '';
  let ringProgress01: number | undefined;

  if (state.phase === 'stale') {
    header = padHeaderLine(`OFFLINE  ${clock}`, 'STALE');
    const card = state.cards[state.selectedCardIndex];
    if (card) {
      body.push(clipLine42(`CACHED: ${card.title}`));
      body.push(clipLine42(card.contextLine1));
      body.push(clipLine42(card.contextLine2));
    } else {
      body.push('OFFLINE CACHE EMPTY');
      body.push('RECONNECTING TO PC HOST...');
    }
  } else if (state.phase === 'meeting_live' && state.meeting) {
    const mins = String(Math.floor(state.meeting.elapsedSec / 60)).padStart(2, '0');
    const secs = String(state.meeting.elapsedSec % 60).padStart(2, '0');
    header = padHeaderLine(`LIVE ${mins}:${secs}  ${state.meeting.speakerCount} SPK`, 'RAM');
    const lastTurn = state.meeting.turns[state.meeting.turns.length - 1];
    if (lastTurn) {
      body.push(clipLine42(`${lastTurn.attendeeName}: ${lastTurn.text}`));
    } else {
      body.push('Listening in memory...');
    }
    if (state.answerLines.length > 0) {
      body.push(clipLine42(state.answerLines[0]));
    } else {
      body.push(
        clipLine42(
          `${state.meeting.decisions.length} decisions | ${state.meeting.actions.length} actions`,
        ),
      );
    }
  } else if (state.phase === 'wrap_up' && state.preview) {
    header = padHeaderLine('WRAP-UP CONFIRM', '45s');
    for (const ln of state.preview.summaryLines.slice(0, 3)) {
      body.push(clipLine42(ln));
    }
    const noMarker = state.previewSelection === 'NO' ? '> [NO]' : '   NO ';
    const yesMarker = state.previewSelection === 'YES' ? '> [YES]' : '   YES ';
    statusFoot = `${noMarker}     ${yesMarker}`;
  } else if (state.phase === 'listening') {
    header = padHeaderLine('LISTENING', clock);
    body.push(`MIC ${renderAudioBarAscii(state.rmsLevel, 16)}`);
    body.push(clipLine42(state.transcript ? `"${state.transcript}"` : 'Speak your command...'));
  } else if (state.phase === 'preview' && state.preview) {
    const ttl = Math.max(
      1,
      Math.round((Date.parse(state.preview.expiresAtIso) - Date.now()) / 1000),
    );
    const ttlLabel = Number.isFinite(ttl) && ttl < 999 ? `${ttl}s` : 'DEFAULT NO';
    header = padHeaderLine('CONFIRM', ttlLabel);
    for (const ln of state.preview.summaryLines.slice(0, 3)) {
      body.push(clipLine42(ln));
    }
    const noMarker = state.previewSelection === 'NO' ? '> [NO]' : '   NO ';
    const yesMarker = state.previewSelection === 'YES' ? '> [YES]' : '   YES ';
    statusFoot = `${noMarker}     ${yesMarker}`;
  } else if (state.phase === 'armed' && state.preview) {
    const secs = (Math.max(0, state.armRemainingMs) / 1000).toFixed(1);
    ringProgress01 = Math.max(0, Math.min(1, 1 - state.armRemainingMs / 2000));
    header = padHeaderLine('SENDING', `${secs}s`);
    for (const ln of state.preview.summaryLines.slice(0, 3)) {
      body.push(clipLine42(ln));
    }
    statusFoot = `Cancel anytime  #${state.preview.idempotencyKey.slice(0, 6)}`;
  } else if (state.phase === 'committing') {
    header = padHeaderLine('SENDING', 'LOCKED');
    body.push('Executing verified write...');
    body.push('Waiting for receipt');
  } else if (state.phase === 'conflict' && state.conflict) {
    header = padHeaderLine('LOCKED (409)', 'BUSY');
    body.push(clipLine42(state.conflict.message));
    body.push('No changes sent');
    if (state.conflict.nextFreeLabel) {
      statusFoot = clipLine42(`NEXT FREE: ${state.conflict.nextFreeLabel}`);
    }
  } else if (state.phase === 'done' && state.receipt) {
    const ob = state.receipt.outbox;
    const word = !ob ? 'DONE' : ob.status === 'queued' ? 'QUEUED' : ob.status === 'running' ? 'SENDING' : ob.status === 'failed' ? 'FAILED' : ob.status === 'undone' ? 'CANCELLED' : 'DONE';
    header = padHeaderLine(
      `${word}  #${state.receipt.receiptId.slice(-4)}`,
      formatTimeShort(state.receipt.committedAtIso),
    );
    if (ob?.status === 'failed') {
      body.push(clipLine42(ob.reason ?? 'Could not be completed'));
      body.push('Nothing confirmed sent');
    } else {
      for (const ln of state.receipt.summaryLines.slice(0, 3)) {
        body.push(clipLine42(ln));
      }
    }
    if (state.receipt.canUndo) {
      statusFoot = ob?.status === 'queued' ? 'Undo available (queued)' : 'Undo available (30s)';
    }
  } else if (state.phase === 'undone') {
    header = padHeaderLine('CANCELLED', clock);
    body.push('Zero writes executed');
    body.push('Workspace unchanged');
  } else if (state.phase === 'error') {
    header = padHeaderLine('NOTICE', clock);
    body.push(clipLine42(state.errorMessage ?? 'Action could not be completed'));
    body.push('No unconfirmed changes made');
  } else if (state.phase === 'detail') {
    const card = state.cards[state.selectedCardIndex];
    header = padHeaderLine(card ? card.title.slice(0, 26) : 'ACTIONS', card ? card.timeMeta.slice(0, 12) : clock);
    if (card) {
      const opts = card.quickActions.slice(0, 4);
      opts.forEach((opt, idx) => {
        const prefix = idx === state.selectedActionIndex ? '>' : ' ';
        body.push(clipLine42(`${prefix} ${opt.label}`));
      });
    } else {
      body.push('ALL CLEAR');
    }
  } else {
    // Minimal Meta-style ambient & pop-up HUD
    const total = state.cards.length;
    const card = state.cards[state.selectedCardIndex];
    const mailBadge = (state.unreadEmailCount ?? 0) > 0 ? `${state.unreadEmailCount}M ` : '';
    const rightTag =
      state.answerLines.length > 0
        ? 'BRIEF'
        : total > 0
          ? `${mailBadge}${state.selectedCardIndex + 1}/${total}`
          : provenanceTag === 'LIVE'
            ? 'LIVE'
            : 'READY';
    header = padHeaderLine(ambientLeft, rightTag);
    if (state.answerLines.length > 0) {
      for (const ln of state.answerLines.slice(0, 4)) {
        body.push(clipLine42(ln));
      }
    } else if (card) {
      body.push(clipLine42(`${card.title}  ${card.timeMeta}`));
      if (card.contextLine1) body.push(clipLine42(card.contextLine1));
      if (card.contextLine2) body.push(clipLine42(card.contextLine2));
    } else {
      body.push('ALL CLEAR');
      body.push('Next 6h calendar & inbox clear');
    }
  }

  const rawLines = statusFoot
    ? [header, '', ...body, '', statusFoot].slice(0, G2_MAX_LINES)
    : [header, '', ...body].slice(0, G2_MAX_LINES);
  const lines = rawLines.map((l, idx) => clipLine42(l, G2_MAX_COLS, idx === 0));
  const bodyText = lines.join('\n');
  const utf8Bytes = utf8ByteLength(bodyText);

  if (utf8Bytes > G2_MAX_UTF8_BYTES) {
    throw new Error(`G2 frame byte limit exceeded: ${utf8Bytes} > ${G2_MAX_UTF8_BYTES}`);
  }

  return {
    header: lines[0],
    lines,
    bodyText,
    utf8Bytes,
    provenanceTag,
    ringProgress01,
  };
}

export function assertLensBudget(lines: string[]): void {
  if (lines.length > G2_MAX_LINES) {
    throw new Error(`Line count ${lines.length} exceeds max ${G2_MAX_LINES}`);
  }
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.length > G2_MAX_COLS) {
      throw new Error(`Line ${i + 1} length ${ln.length} exceeds max ${G2_MAX_COLS}`);
    }
    if (!/^[\x20-\x7E]*$/.test(ln)) {
      throw new Error(`Line ${i + 1} contains non-LVGL-ASCII characters`);
    }
  }
  const bytes = utf8ByteLength(lines.join('\n'));
  if (bytes > G2_MAX_UTF8_BYTES) {
    throw new Error(`UTF-8 bytes ${bytes} exceeds max ${G2_MAX_UTF8_BYTES}`);
  }
}
