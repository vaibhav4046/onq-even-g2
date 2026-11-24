import { describe, expect, it } from 'vitest';
import {
  checkCalendarConflict,
  checkNotionFreshness,
  checkThreadFreshness,
  rankCorridorCards,
} from '../src/index.js';
import type { BusySlot, CorridorCard } from '../src/index.js';

const BUSY: BusySlot[] = [
  {
    eventId: 'evt-vc',
    title: 'VC Sync - Priya',
    startIso: '2026-11-24T14:00:00.000Z',
    endIso: '2026-11-24T14:30:00.000Z',
  },
  {
    eventId: 'evt-design',
    title: 'Design Review',
    startIso: '2026-11-24T14:15:00.000Z',
    endIso: '2026-11-24T14:45:00.000Z',
  },
];

describe('conflictEngine.ts', () => {
  it('1. detects overlapping busy event and computes next verified free slot', () => {
    const res = checkCalendarConflict(
      '2026-11-24T14:15:00.000Z',
      '2026-11-24T14:45:00.000Z',
      BUSY,
      'evt-vc',
    );
    expect(res.conflict).toBe(true);
    expect(res.detail?.code).toBe('CONFLICT_CALENDAR_BUSY');
    expect(res.detail?.conflictingTitle).toBe('Design Review');
    expect(res.detail?.nextFreeStartIso).toBe('2026-11-24T14:45:00.000Z');
  });

  it('2. excludes the event being moved from self-overlap', () => {
    const res = checkCalendarConflict(
      '2026-11-24T14:05:00.000Z',
      '2026-11-24T14:35:00.000Z',
      [BUSY[0]],
      'evt-vc',
    );
    expect(res.conflict).toBe(false);
  });

  it('3. allows adjacent back-to-back non-overlapping slots', () => {
    const res = checkCalendarConflict(
      '2026-11-24T14:45:00.000Z',
      '2026-11-24T15:15:00.000Z',
      BUSY,
      'evt-vc',
    );
    expect(res.conflict).toBe(false);
  });

  it('4. skips chained busy slots when searching for next free slot', () => {
    const chained: BusySlot[] = [
      ...BUSY,
      {
        eventId: 'evt-chain',
        title: 'Standup',
        startIso: '2026-11-24T14:45:00.000Z',
        endIso: '2026-11-24T15:00:00.000Z',
      },
    ];
    const res = checkCalendarConflict(
      '2026-11-24T14:15:00.000Z',
      '2026-11-24T14:45:00.000Z',
      chained,
      'evt-vc',
    );
    expect(res.conflict).toBe(true);
    expect(res.detail?.nextFreeStartIso).toBe('2026-11-24T15:00:00.000Z');
  });

  it('5. passes thread freshness when historyId matches', () => {
    expect(checkThreadFreshness('hist-10', 'hist-10').fresh).toBe(true);
  });

  it('6. returns CONFLICT_THREAD_UPDATED when Gmail historyId drifted', () => {
    const res = checkThreadFreshness('hist-10', 'hist-11');
    expect(res.fresh).toBe(false);
    expect(res.detail?.code).toBe('CONFLICT_THREAD_UPDATED');
  });

  it('7. passes Notion freshness when last_edited_time matches', () => {
    expect(checkNotionFreshness('2026-11-24T10:00:00Z', '2026-11-24T10:00:00Z').fresh).toBe(true);
  });

  it('8. returns CONFLICT_NOTION_STALE when Notion last_edited_time drifted', () => {
    const res = checkNotionFreshness('2026-11-24T10:00:00Z', '2026-11-24T10:05:00Z');
    expect(res.fresh).toBe(false);
    expect(res.detail?.code).toBe('CONFLICT_NOTION_STALE');
  });

  it('9. ranks imminent meetings (< 45m) ahead of general asks and Notion tasks', () => {
    const base: Omit<CorridorCard, 'id' | 'triageRule' | 'startIso'> = {
      sourceMode: 'DEMO',
      syncedAtIso: '2026-11-24T13:45:00Z',
      provenanceLabel: 'SANDBOX',
      kind: 'MEETING',
      title: 'Item',
      timeMeta: '14:00',
      contextLine1: 'ctx',
      contextLine2: 'doc',
      etag: '1',
      quickActions: [],
    };
    const ranked = rankCorridorCards(
      [
        { ...base, id: 'later', triageRule: 'UPCOMING', startIso: '2026-11-24T17:00:00Z' },
        { ...base, id: 'notion', triageRule: 'NOTION_OVERDUE' },
        { ...base, id: 'imminent', triageRule: 'IMMINENT_MTG', startIso: '2026-11-24T14:00:00Z' },
      ],
      '2026-11-24T13:45:00Z',
    );
    expect(ranked.map((c) => c.id)).toEqual(['imminent', 'notion', 'later']);
  });

  it('10. handles missing optional historyId/lastEdited safely as fresh', () => {
    expect(checkThreadFreshness(undefined, 'hist-1').fresh).toBe(true);
    expect(checkNotionFreshness(undefined, '2026-11-24T10:00:00Z').fresh).toBe(true);
  });
});
