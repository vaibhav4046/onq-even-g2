import type { ConflictLockDetail, CorridorCard } from './types.js';

export interface BusySlot {
  eventId: string;
  title: string;
  startIso: string;
  endIso: string;
}

export interface CalendarConflictResult {
  conflict: boolean;
  detail?: ConflictLockDetail;
}

function formatUtcHhMm(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Checks whether [targetStartIso, targetEndIso) overlaps any confirmed busy slot
 * (excluding movingEventId) and deterministically computes the next verified free slot.
 */
export function checkCalendarConflict(
  targetStartIso: string,
  targetEndIso: string,
  busySlots: BusySlot[],
  movingEventId?: string,
): CalendarConflictResult {
  const targetStart = Date.parse(targetStartIso);
  const targetEnd = Date.parse(targetEndIso);
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) {
    return { conflict: false };
  }

  const others = busySlots
    .filter((s) => s.eventId !== movingEventId)
    .map((s) => ({
      ...s,
      startMs: Date.parse(s.startIso),
      endMs: Date.parse(s.endIso),
    }))
    .filter((s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs))
    .sort((a, b) => a.startMs - b.startMs);

  const overlapping = others.find((s) => targetStart < s.endMs && targetEnd > s.startMs);
  if (!overlapping) {
    return { conflict: false };
  }

  // Compute next verified free slot of same duration starting at or after overlapping.endMs
  const durationMs = targetEnd - targetStart;
  let candidateStart = overlapping.endMs;
  for (const slot of others) {
    const candidateEnd = candidateStart + durationMs;
    if (candidateStart < slot.endMs && candidateEnd > slot.startMs) {
      candidateStart = Math.max(candidateStart, slot.endMs);
    }
  }
  const nextEnd = candidateStart + durationMs;
  const hhmm = formatUtcHhMm(candidateStart);
  const durMins = Math.round(durationMs / 60_000);

  return {
    conflict: true,
    detail: {
      code: 'CONFLICT_CALENDAR_BUSY',
      message: `${formatUtcHhMm(targetStart)} busy (${overlapping.title})`,
      conflictingTitle: overlapping.title,
      nextFreeStartIso: new Date(candidateStart).toISOString(),
      nextFreeEndIso: new Date(nextEnd).toISOString(),
      nextFreeLabel: `${hhmm} (${durMins}m)`,
    },
  };
}

export function checkThreadFreshness(
  expectedHistoryId: string | undefined,
  currentHistoryId: string | undefined,
): { fresh: boolean; detail?: ConflictLockDetail } {
  if (!expectedHistoryId || !currentHistoryId) return { fresh: true };
  if (expectedHistoryId === currentHistoryId) return { fresh: true };
  return {
    fresh: false,
    detail: {
      code: 'CONFLICT_THREAD_UPDATED',
      message: 'Thread updated by sender since card sync',
    },
  };
}

export function checkNotionFreshness(
  expectedLastEdited: string | undefined,
  currentLastEdited: string | undefined,
): { fresh: boolean; detail?: ConflictLockDetail } {
  if (!expectedLastEdited || !currentLastEdited) return { fresh: true };
  if (expectedLastEdited === currentLastEdited) return { fresh: true };
  return {
    fresh: false,
    detail: {
      code: 'CONFLICT_NOTION_STALE',
      message: 'Notion task edited elsewhere since sync',
    },
  };
}

const RULE_PRIORITY: Record<CorridorCard['triageRule'], number> = {
  IMMINENT_MTG: 0,
  ASK_DEADLINE: 1,
  DIRECT_ASK: 2,
  NOTION_OVERDUE: 3,
  UPCOMING: 4,
};

export function rankCorridorCards(cards: CorridorCard[], nowIso?: string): CorridorCard[] {
  const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
  return [...cards].sort((a, b) => {
    const aImminent =
      a.startIso && Number.isFinite(Date.parse(a.startIso))
        ? Date.parse(a.startIso) - nowMs <= 45 * 60_000 && Date.parse(a.startIso) - nowMs >= -10 * 60_000
        : false;
    const bImminent =
      b.startIso && Number.isFinite(Date.parse(b.startIso))
        ? Date.parse(b.startIso) - nowMs <= 45 * 60_000 && Date.parse(b.startIso) - nowMs >= -10 * 60_000
        : false;
    if (aImminent !== bImminent) return aImminent ? -1 : 1;

    const pDiff = RULE_PRIORITY[a.triageRule] - RULE_PRIORITY[b.triageRule];
    if (pDiff !== 0) return pDiff;

    const aTime = a.startIso ? Date.parse(a.startIso) : Number.MAX_SAFE_INTEGER;
    const bTime = b.startIso ? Date.parse(b.startIso) : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
}
