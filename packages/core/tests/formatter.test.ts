import { describe, expect, it } from 'vitest';
import {
  assertLensBudget,
  clipLine42,
  createInitialHudState,
  formatLensFrame,
  G2_MAX_COLS,
  G2_MAX_LINES,
  G2_MAX_UTF8_BYTES,
  padHeaderLine,
  renderAudioBarAscii,
  sanitizeLvglAscii,
  utf8ByteLength,
  wrapLine42,
} from '../src/index.js';
import type { CorridorCard } from '../src/index.js';

const SAMPLE_CARD: CorridorCard = {
  id: 'c1',
  sourceMode: 'DEMO',
  syncedAtIso: '2026-11-24T13:48:00.000Z',
  provenanceLabel: 'SAMPLE',
  kind: 'MEETING',
  title: 'Investor call',
  timeMeta: '14:00 (12m)',
  startIso: '2026-11-24T14:00:00.000Z',
  endIso: '2026-11-24T14:30:00.000Z',
  contextLine1: 'Can we push 15m? Q4 deck ready?',
  contextLine2: 'Q4_Metrics_v3 (Drive) | 2 comments',
  triageRule: 'IMMINENT_MTG',
  etag: 'etag-1',
  quickActions: [
    { id: 'qa1', label: 'Push 15m + Reply Investor', intent: 'RESCHEDULE_AND_NOTIFY', commandText: 'push 15m and tell Investor' },
  ],
};

describe('formatter.ts', () => {
  it('1. strips emojis and non-ASCII LVGL unsafe characters', () => {
    const out = sanitizeLvglAscii('Hello 🚀 “Investor” — café résumé → ok');
    expect(out).toBe('Hello "Investor" - cafe resume -> ok');
    expect(/^[\x20-\x7E\n]*$/.test(out)).toBe(true);
  });

  it('2. wraps on word boundaries without mid-word cuts', () => {
    const wrapped = wrapLine42('Meeting with Investor contact regarding Q4 metrics spreadsheet and deck', 42);
    expect(wrapped.length).toBeGreaterThan(1);
    for (const ln of wrapped) {
      expect(ln.length).toBeLessThanOrEqual(42);
    }
    expect(wrapped[0]).toBe('Meeting with Investor contact regarding Q4');
  });

  it('3. clips lines cleanly at word boundary within 42 columns', () => {
    const clipped = clipLine42('This is a long line that should clip cleanly on a space boundary before 42', 42);
    expect(clipped.length).toBeLessThanOrEqual(42);
    expect(clipped.endsWith('..')).toBe(true);
    expect(clipped).not.toContain('befo..');
  });

  it('4. handles single ultra-long token with ellipsis', () => {
    const clipped = clipLine42('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 42);
    expect(clipped.length).toBe(42);
    expect(clipped.endsWith('..')).toBe(true);
  });

  it('5. padHeaderLine keeps left and right within 42 columns', () => {
    const hdr = padHeaderLine('LIVE | GCAL+GMAIL+NOTION+EXTRA', '13:48 1/4', 42);
    expect(hdr.length).toBe(42);
    expect(hdr.endsWith('13:48 1/4')).toBe(true);
  });

  it('6. renderAudioBarAscii emits only firmware-safe ASCII glyphs', () => {
    const low = renderAudioBarAscii(0.05, 16);
    const high = renderAudioBarAscii(0.95, 16);
    expect(low).toMatch(/^\[[-=#]{16}\]$/);
    expect(high).toMatch(/^\[[-=#]{16}\]$/);
    expect(high).toContain('#');
  });

  it('7. computes accurate UTF-8 byte lengths', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('a\nb')).toBe(3);
  });

  it('8. formats idle dossier within 7 lines, 42 cols, 999 bytes without demo/tutorial clutter', () => {
    const state = { ...createInitialHudState([SAMPLE_CARD], 'DEMO'), weatherLabel: '24C Clear' };
    const frame = formatLensFrame(state);
    expect(frame.lines.length).toBeLessThanOrEqual(G2_MAX_LINES);
    expect(frame.utf8Bytes).toBeLessThanOrEqual(G2_MAX_UTF8_BYTES);
    expect(frame.header).toContain('24C Clear');
    expect(frame.bodyText).not.toContain('SAMPLE |');
    expect(frame.bodyText).not.toContain('TAP:');
    expect(frame.bodyText).not.toContain('SWIPE:');
    expect(frame.bodyText).not.toContain('----');
    expect(frame.provenanceTag).toBe('DEMO');
    assertLensBudget(frame.lines);
  });

  it('9. formats LIVE dossier cleanly with LIVE provenance metadata', () => {
    const state = createInitialHudState([{ ...SAMPLE_CARD, sourceMode: 'LIVE' }], 'LIVE');
    const frame = formatLensFrame(state);
    expect(frame.provenanceTag).toBe('LIVE');
    assertLensBudget(frame.lines);
  });

  it('10. formats STALE offline state with OFFLINE header and cached card', () => {
    const state = { ...createInitialHudState([SAMPLE_CARD], 'STALE'), phase: 'stale' as const };
    const frame = formatLensFrame(state);
    expect(frame.header).toContain('OFFLINE');
    expect(frame.bodyText).toContain('CACHED:');
    assertLensBudget(frame.lines);
  });

  it('11. formats listening state with RMS ASCII waveform', () => {
    const state = { ...createInitialHudState([SAMPLE_CARD], 'DEMO'), phase: 'listening' as const, rmsLevel: 0.65 };
    const frame = formatLensFrame(state);
    expect(frame.bodyText).toContain('MIC [');
    assertLensBudget(frame.lines);
  });

  it('12. formats preview state with Default-NO marker highlighted cleanly', () => {
    const state = {
      ...createInitialHudState([SAMPLE_CARD], 'DEMO'),
      phase: 'preview' as const,
      previewSelection: 'NO' as const,
      preview: {
        previewToken: 'pt1',
        idempotencyKey: 'abcdef123456',
        expiresAtIso: new Date(Date.now() + 30_000).toISOString(),
        intent: 'RESCHEDULE_AND_NOTIFY' as const,
        defaultSelection: 'NO' as const,
        summaryLines: ['GCAL: 14:00 -> 14:15', 'MAIL: Reply Investor'],
        operations: [],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      },
    };
    const frame = formatLensFrame(state);
    expect(frame.bodyText).toContain('> [NO]');
    expect(frame.bodyText).not.toContain('SWIPE:');
    assertLensBudget(frame.lines);
  });

  it('13. formats armed state with ring progress', () => {
    const state = {
      ...createInitialHudState([SAMPLE_CARD], 'DEMO'),
      phase: 'armed' as const,
      armRemainingMs: 1000,
      preview: {
        previewToken: 'pt1',
        idempotencyKey: '9f2a1122',
        expiresAtIso: new Date(Date.now() + 30_000).toISOString(),
        intent: 'RESCHEDULE_AND_NOTIFY' as const,
        defaultSelection: 'NO' as const,
        summaryLines: ['MOVING 14:00->14:15'],
        operations: [],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      },
    };
    const frame = formatLensFrame(state);
    expect(frame.ringProgress01).toBeCloseTo(0.5, 2);
    expect(frame.header).toContain('1.0s');
    assertLensBudget(frame.lines);
  });

  it('14. formats HTTP 409 conflict lock screen without confirm cues', () => {
    const state = {
      ...createInitialHudState([SAMPLE_CARD], 'LIVE'),
      phase: 'conflict' as const,
      conflict: {
        code: 'CONFLICT_CALENDAR_BUSY' as const,
        message: '14:15 busy (Design Review)',
        nextFreeLabel: '14:45 (30m)',
      },
    };
    const frame = formatLensFrame(state);
    expect(frame.header).toContain('LOCKED (409)');
    expect(frame.bodyText).toContain('NEXT FREE: 14:45');
    expect(frame.bodyText).not.toContain('YES-ARM');
    assertLensBudget(frame.lines);
  });

  it('15. formats empty all-clear state cleanly', () => {
    const state = createInitialHudState([], 'DEMO');
    const frame = formatLensFrame(state);
    expect(frame.bodyText).toContain('ALL CLEAR');
    assertLensBudget(frame.lines);
  });

  it('16. assertLensBudget throws on line length > 42, line count > 7, or non-ASCII', () => {
    expect(() => assertLensBudget(['x'.repeat(G2_MAX_COLS + 1)])).toThrow();
    expect(() => assertLensBudget(Array(8).fill('ok'))).toThrow();
    expect(() => assertLensBudget(['bad \u2014 dash'])).toThrow();
  });

  it('17. renders answerLines overlay cleanly even when corridor cards are present', () => {
    const state = {
      ...createInitialHudState([SAMPLE_CARD], 'DEMO'),
      answerLines: ['PR GATE | master @ 065a7bf', '38 files changed | ALL SUITES PASS', 'DEFAULT-NO | TAP YES / 2s RING'],
    };
    const frame = formatLensFrame(state);
    expect(frame.header).toContain('BRIEF');
    expect(frame.bodyText).toContain('PR GATE | master @ 065a7bf');
    expect(frame.bodyText).not.toContain('Investor call');
    assertLensBudget(frame.lines);
  });
});
