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
  const displayTag = provenanceTag === 'DEMO' ? 'SAMPLE' : provenanceTag;
  const clock = formatTimeShort(state.syncedAtIso);
  let header = '';
  const body: string[] = [];
  let footer = '';
  let ringProgress01: number | undefined;

  if (state.phase === 'stale') {
    header = padHeaderLine(`STALE | ${state.provenanceLabel}`, clock);
    const card = state.cards[state.selectedCardIndex];
    if (card) {
      body.push(clipLine42(`CACHED: ${card.title}`));
      body.push(clipLine42(card.contextLine1));
      body.push(clipLine42(card.contextLine2));
    } else {
      body.push('OFFLINE CACHE EMPTY');
      body.push('RECONNECT RELAY TO SYNC');
    }
    footer = 'TAP: RETRY SYNC    2xTAP: EXIT';
  } else if (state.phase === 'meeting_live' && state.meeting) {
    const mins = String(Math.floor(state.meeting.elapsedSec / 60)).padStart(2, '0');
    const secs = String(state.meeting.elapsedSec % 60).padStart(2, '0');
    const recBadge = state.meeting.providerMode === 'LIVE_ASSEMBLYAI' ? 'LIVE' : 'SAMPLE';
    header = padHeaderLine(`REC ${mins}:${secs} | ${state.meeting.speakerCount} SPK | ${recBadge}`, 'RAM');
    const lastTurn = state.meeting.turns[state.meeting.turns.length - 1];
    if (lastTurn) {
      body.push(clipLine42(`${lastTurn.attendeeName}: ${lastTurn.text}`));
    } else {
      body.push('LISTENING TO MEETING ROOM...');
    }
    if (state.answerLines.length > 0) {
      body.push(clipLine42(state.answerLines[0]));
    } else {
      body.push(
        clipLine42(
          `${state.meeting.decisions.length} DECISIONS | ${state.meeting.actions.length} ACTIONS`,
        ),
      );
    }
    footer = 'SAY "ONQ, ..." ASK | "WRAP UP"';
  } else if (state.phase === 'wrap_up' && state.preview) {
    header = padHeaderLine(`${displayTag} | WRAP-UP DEFAULT NO`, '45s');
    for (const ln of state.preview.summaryLines.slice(0, 3)) {
      body.push(clipLine42(ln));
    }
    const noMarker = state.previewSelection === 'NO' ? '> [NO-CANCEL]' : '  NO-CANCEL ';
    const yesMarker = state.previewSelection === 'YES' ? '> [YES-ARM 2s]' : '  YES-ARM 2s ';
    body.push(clipLine42(`${noMarker}  ${yesMarker}`));
    footer = 'SAY "CONFIRM ACTION" | TAP RING';
  } else if (state.phase === 'listening') {
    header = padHeaderLine(`${displayTag} | VOICE MIC 16KHZ`, 'REC');
    body.push('SPEAK CORRIDOR COMMAND:');
    body.push(`MIC ${renderAudioBarAscii(state.rmsLevel, 16)}`);
    body.push(clipLine42(state.transcript ? `"${state.transcript}"` : 'Ex: "Push 15m and tell Investor"'));
    footer = 'RELEASE TO PARSE   2xTAP: CANCEL';
  } else if (state.phase === 'preview' && state.preview) {
    const ttl = Math.max(
      1,
      Math.round((Date.parse(state.preview.expiresAtIso) - Date.now()) / 1000),
    );
    const ttlLabel = Number.isFinite(ttl) && ttl < 999 ? `EXP ${ttl}s` : `${displayTag}`;
    header = padHeaderLine(`${displayTag} | CONFIRM DEFAULT NO`, ttlLabel);
    for (const ln of state.preview.summaryLines.slice(0, 3)) {
      body.push(clipLine42(ln));
    }
    const noMarker = state.previewSelection === 'NO' ? '> [NO-CANCEL]' : '  NO-CANCEL ';
    const yesMarker = state.previewSelection === 'YES' ? '> [YES-ARM 2s]' : '  YES-ARM 2s ';
    body.push(clipLine42(`${noMarker}  ${yesMarker}`));
    footer = 'SWIPE: TOGGLE  TAP: SELECT  2xTAP: BACK';
  } else if (state.phase === 'armed' && state.preview) {
    const secs = (Math.max(0, state.armRemainingMs) / 1000).toFixed(1);
    ringProgress01 = Math.max(0, Math.min(1, 1 - state.armRemainingMs / 2000));
    header = padHeaderLine(`${displayTag} | ARMED TAP TO CANCEL`, `${secs}s`);
    for (const ln of state.preview.summaryLines.slice(0, 2)) {
      body.push(clipLine42(ln));
    }
    body.push(clipLine42(`IDEMP #${state.preview.idempotencyKey.slice(0, 6)}`));
    footer = 'ANY TAP = ZERO WRITES  HOLDING LOCK';
  } else if (state.phase === 'committing') {
    header = padHeaderLine(`${displayTag} | COMMITTING LOCKED`, 'WAIT');
    body.push('EXECUTING VERIFIED WORKSPACE WRITE...');
    body.push('INPUT LOCKED AT 0.0s BOUNDARY');
    footer = 'PLEASE WAIT FOR RECEIPT';
  } else if (state.phase === 'conflict' && state.conflict) {
    header = padHeaderLine(`${displayTag} | !! LOCKED (409)`, 'BLOCKED');
    body.push(clipLine42(state.conflict.message));
    body.push('NO CALENDAR EDIT | NO EMAIL SENT');
    if (state.conflict.nextFreeLabel) {
      body.push(clipLine42(`NEXT FREE: ${state.conflict.nextFreeLabel}`));
      footer = 'TAP: STAGE FREE SLOT  2xTAP: DISMISS';
    } else {
      footer = 'TAP: REFRESH DOSSIER  2xTAP: BACK';
    }
  } else if (state.phase === 'done' && state.receipt) {
    // A write running in the background outbox shows its progress here: QUEUED, SENDING, DONE, or the failure reason.
    const ob = state.receipt.outbox;
    const word = !ob ? 'COMMITTED' : ob.status === 'queued' ? 'QUEUED' : ob.status === 'running' ? 'SENDING' : ob.status === 'failed' ? 'FAILED' : ob.status === 'undone' ? 'CANCELLED' : 'DONE';
    header = padHeaderLine(
      `${displayTag} | ${word} #${state.receipt.receiptId.slice(-4)}`,
      formatTimeShort(state.receipt.committedAtIso),
    );
    if (ob?.status === 'failed') {
      body.push(clipLine42(ob.reason ?? 'COULD NOT BE COMPLETED'));
      body.push('NOTHING WAS CONFIRMED AS SENT');
    } else {
      for (const ln of state.receipt.summaryLines.slice(0, 3)) {
        body.push(clipLine42(ln));
      }
    }
    footer =
      ob?.status === 'queued' && state.receipt.canUndo
        ? 'TAP: CANCEL (QUEUED)  2xTAP: DOSSIER'
        : state.receipt.canUndo
          ? 'TAP: UNDO (30s)   2xTAP: DOSSIER'
          : 'TAP: DOSSIER      2xTAP: BACK';
  } else if (state.phase === 'undone') {
    header = padHeaderLine(`${displayTag} | CANCELLED`, clock);
    body.push('ZERO WORKSPACE WRITES EXECUTED');
    body.push('CALENDAR & INBOX UNCHANGED');
    footer = 'TAP: DOSSIER      2xTAP: BACK';
  } else if (state.phase === 'error') {
    header = padHeaderLine(`${displayTag} | NOTICE`, clock);
    body.push(clipLine42(state.errorMessage ?? 'ACTION COULD NOT BE COMPLETED'));
    body.push('NO UNCONFIRMED CHANGES MADE');
    footer = 'TAP: DOSSIER      2xTAP: BACK';
  } else if (state.phase === 'detail') {
    const card = state.cards[state.selectedCardIndex];
    header = padHeaderLine(`${displayTag} | ACTIONS`, card ? card.timeMeta.slice(0, 14) : clock);
    if (card) {
      body.push(clipLine42(card.title));
      const opts = card.quickActions.slice(0, 3);
      opts.forEach((opt, idx) => {
        const prefix = idx === state.selectedActionIndex ? '>' : ' ';
        body.push(clipLine42(`${prefix} ${opt.label}`));
      });
    } else {
      body.push('ALL CLEAR - NO UPCOMING MEETINGS');
    }
    footer = 'SWIPE: PICK  TAP: STAGE  HOLD: VOICE';
  } else {
    // idle dossier
    const total = state.cards.length;
    const card = state.cards[state.selectedCardIndex];
    const mailBadge = (state.unreadEmailCount ?? 0) > 0 ? `M:${state.unreadEmailCount} ` : '';
    const counter = total > 0 ? `${mailBadge}${clock} ${state.selectedCardIndex + 1}/${total}` : `${mailBadge}${clock}`;
    const subTag = state.provenanceLabel === displayTag ? 'CORRIDOR' : state.provenanceLabel;
    header = padHeaderLine(`${displayTag} | ${subTag}`, counter);
    if (card) {
      const [l1Tag, l2Tag] =
        card.id === 'card-telegram-bridge'
          ? ['TG:', 'CHAT:']
          : card.id === 'card-computer-proactive'
            ? ['REPO:', 'PR:']
            : card.id === 'card-unified-os'
              ? ['OS:', 'NEXT:']
              : ['ASK:', 'DOC:'];
      body.push(clipLine42(`${card.timeMeta} | ${card.title}`));
      body.push(clipLine42(card.contextLine1 ? `${l1Tag} ${card.contextLine1}` : `${l1Tag} Ready`));
      body.push(clipLine42(card.contextLine2 ? `${l2Tag} ${card.contextLine2}` : `${l2Tag} Clear`));
    } else if (state.answerLines.length > 0) {
      for (const ln of state.answerLines.slice(0, 3)) {
        body.push(clipLine42(ln));
      }
    } else {
      body.push('ALL CLEAR - NO CORRIDOR TASKS DUE');
      body.push('NEXT 6H CALENDAR & INBOX CLEAR');
    }
    footer = 'TAP: ACT  HOLD: VOICE  SWIPE: NEXT';
  }

  const sep = '------------------------------------------';
  const rawLines = [header, sep, ...body, sep, footer].slice(0, G2_MAX_LINES);
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
