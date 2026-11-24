import * as chrono from 'chrono-node';
import type { ActionIntent, CorridorCard } from './types.js';

export interface ParsedVoiceIntent {
  kind: ActionIntent;
  rawText: string;
  shiftMinutes?: number;
  targetStartIso?: string;
  targetDateLabel?: string;
  contactQuery?: string;
  matchedCardId?: string;
  ambiguousMatches?: Array<{ cardId: string; title: string; contact: string }>;
  taskTitle?: string;
  replyMessage?: string;
  queryTopic?: string;
}

export interface KnownContact {
  name: string;
  email: string;
  cardId?: string;
}

function extractContactQuery(text: string): string | undefined {
  const m = text.match(/\b(?:tell|email|reply(?:\s+to)?|to|with|for)\s+([A-Z][a-z]+|[a-z]{3,16})\b/i);
  if (!m) return undefined;
  const candidate = m[1].toLowerCase();
  const stopWords = new Set([
    'me',
    'her',
    'him',
    'them',
    'the',
    'this',
    'that',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'today',
    'tomorrow',
    'later',
    'minute',
    'minutes',
    'min',
    'hour',
    'hours',
    'notion',
    'calendar',
    'sync',
    'meeting',
    'done',
  ]);
  return stopWords.has(candidate) ? undefined : m[1];
}

function matchCardByContact(
  contactQuery: string | undefined,
  cards: CorridorCard[],
  activeCard?: CorridorCard,
): {
  cardId?: string;
  ambiguousMatches?: Array<{ cardId: string; title: string; contact: string }>;
} {
  if (!contactQuery) {
    return { cardId: activeCard?.id ?? cards[0]?.id };
  }
  const q = contactQuery.toLowerCase();
  const hits = cards.filter((c) => {
    const name = (c.attendeeName ?? '').toLowerCase();
    const email = (c.attendeeEmail ?? '').toLowerCase();
    const title = c.title.toLowerCase();
    return name.includes(q) || email.includes(q) || title.includes(q);
  });

  if (hits.length === 1) return { cardId: hits[0].id };
  if (hits.length > 1) {
    return {
      ambiguousMatches: hits.map((h) => ({
        cardId: h.id,
        title: h.title,
        contact: h.attendeeName ?? h.attendeeEmail ?? h.title,
      })),
    };
  }
  return { cardId: activeCard?.id ?? cards[0]?.id };
}

function parseMinutesDelta(lower: string): number | undefined {
  const m = lower.match(
    /(?:push|shift|delay|move|late(?:\s+by)?|in)\s+(?:by\s+)?(\d{1,3})\s*(?:m|min|mins|minutes?)\b/,
  );
  if (m) return Number(m[1]);
  const h = lower.match(/(?:push|shift|delay|move|late(?:\s+by)?)\s+(?:by\s+)?(\d{1,2})\s*(?:h|hr|hrs|hours?)\b/);
  if (h) return Number(h[1]) * 60;
  if (/\brunning\s+late\b/.test(lower)) return 15;
  return undefined;
}

/**
 * Deterministic voice intent parser powered by chrono-node date resolution.
 * Never trusts an LLM to choose dates/times or fabricate recipients.
 */
export function parseVoiceCommand(
  transcript: string,
  options: {
    now?: Date;
    cards?: CorridorCard[];
    activeCard?: CorridorCard;
  } = {},
): ParsedVoiceIntent {
  const rawText = (transcript ?? '').trim();
  const lower = rawText.toLowerCase();
  const now = options.now ?? new Date();
  const cards = options.cards ?? [];
  const activeCard = options.activeCard ?? cards[0];

  if (!rawText || rawText.length < 3) {
    return { kind: 'UNKNOWN', rawText };
  }

  // 1. Complete Notion task (check before ASK_NOTES so "check off" doesn't match "check")
  if (
    (/\b(mark|complete|finish|close|check off)\b/.test(lower) &&
      /\b(task|notion|todo|item|deck|done)\b/.test(lower)) ||
    /\bmark\s+.+\s+done\b/.test(lower)
  ) {
    const taskTitle = rawText
      .replace(/^(please\s+)?(mark|complete|finish|check off)\s+/i, '')
      .replace(/\s+(as\s+)?(done|complete|completed)\.?$/i, '')
      .trim();
    return {
      kind: 'COMPLETE_NOTION_TASK',
      rawText,
      taskTitle: taskTitle || activeCard?.title || 'Current task',
      matchedCardId: activeCard?.id,
    };
  }

  // 2. Questions / Read-only Notes lookup
  if (/^(what|who|summarize|summary|read|check(?!\s+off)|tell me what)\b/.test(lower) || /\bwhat did\b/.test(lower)) {
    return {
      kind: 'ASK_NOTES',
      rawText,
      contactQuery: extractContactQuery(rawText),
      matchedCardId: activeCard?.id,
      queryTopic: rawText,
    };
  }

  // 3. Create Action Pack (Notion task + optional Calendar hold + Gmail draft)
  if (/^(task|todo|action|remind|capture|note|follow up|followup)\b/.test(lower) || /\badd task\b/.test(lower)) {
    const chronoParsed = chrono.parse(rawText, now, { forwardDate: true });
    const parsedDate = chronoParsed[0]?.start?.date();
    const contactQuery = extractContactQuery(rawText);
    const cleanedTitle = rawText
      .replace(/^(task|todo|action|remind me( to)?|capture|add task|note)\s*:?\s*/i, '')
      .trim();

    return {
      kind: 'CREATE_ACTION_PACK',
      rawText,
      taskTitle: cleanedTitle || 'Follow-up corridor action',
      contactQuery,
      targetStartIso: parsedDate ? parsedDate.toISOString() : undefined,
      targetDateLabel: chronoParsed[0]?.text,
      matchedCardId: activeCard?.id,
    };
  }

  // 4. Reschedule & Notify
  const shiftMinutes = parseMinutesDelta(lower);
  const chronoReschedule = chrono.parse(rawText, now, { forwardDate: true });
  const isRescheduleVerb = /\b(push|move|reschedule|shift|delay|running\s+\d+|running\s+late)\b/.test(lower);

  if (isRescheduleVerb || shiftMinutes !== undefined) {
    const contactQuery = extractContactQuery(rawText);
    const match = matchCardByContact(contactQuery, cards, activeCard);
    if (match.ambiguousMatches) {
      return {
        kind: 'AMBIGUOUS',
        rawText,
        contactQuery,
        ambiguousMatches: match.ambiguousMatches,
      };
    }

    let targetStartIso: string | undefined;
    const targetCard = cards.find((c) => c.id === match.cardId) ?? activeCard;
    if (shiftMinutes !== undefined && targetCard?.startIso) {
      const baseMs = Date.parse(targetCard.startIso);
      if (Number.isFinite(baseMs)) {
        targetStartIso = new Date(baseMs + shiftMinutes * 60_000).toISOString();
      }
    } else if (chronoReschedule[0]?.start) {
      targetStartIso = chronoReschedule[0].start.date().toISOString();
    }

    return {
      kind: 'RESCHEDULE_AND_NOTIFY',
      rawText,
      shiftMinutes,
      targetStartIso,
      targetDateLabel: chronoReschedule[0]?.text,
      contactQuery,
      matchedCardId: match.cardId,
    };
  }

  // 5. Reply / Draft Email
  if (/^(reply|draft|email|respond|tell)\b/.test(lower)) {
    const contactQuery = extractContactQuery(rawText);
    const match = matchCardByContact(contactQuery, cards, activeCard);
    if (match.ambiguousMatches) {
      return {
        kind: 'AMBIGUOUS',
        rawText,
        contactQuery,
        ambiguousMatches: match.ambiguousMatches,
      };
    }
    const cleanedMsg = rawText
      .replace(/^(draft\s+)?(reply|respond|email|tell)(\s+to)?(\s+[A-Z]?[a-z]+)?\s*:?\s*/i, '')
      .trim();
    return {
      kind: 'REPLY_EMAIL',
      rawText,
      contactQuery,
      matchedCardId: match.cardId,
      replyMessage: cleanedMsg || 'Confirmed, thanks.',
    };
  }

  return { kind: 'UNKNOWN', rawText };
}
