import crypto from 'node:crypto';
import type { ActionOperation, CommitReceipt, CorridorCard, SourceMode } from '@onq/core';
import type { SnapshotSource } from './snapshotStore.js';

/**
 * Shapes and pure helpers for the per-source snapshots: how a provider result is split per source, how the
 * owner's own Chrome is asked to read a source and its answer normalized, and how a snapshot is tagged for the glasses.
 */

export interface WorkspaceSlice {
  cards: CorridorCard[];
  sourceMode: SourceMode;
  provenanceLabel: string;
  syncedAtIso: string;
}
export interface GmailSlice {
  threads: Array<{ threadId: string; fromName: string; fromEmail: string; subject: string; snippet: string }>;
}
export interface TelegramSlice {
  title: string;
  detail: string;
}

/** Splits one provider corridor result into the calendar / notion / gmail snapshots (one API call feeds all three). */
export function sliceWorkspace(
  data: { cards: CorridorCard[]; sourceMode: SourceMode; provenanceLabel: string; syncedAtIso: string },
  threads: Array<{ threadId: string; fromName: string; fromEmail: string; subject: string; snippet: string }>,
): Record<'calendar' | 'notion' | 'gmail', WorkspaceSlice | GmailSlice> {
  const meta = { sourceMode: data.sourceMode, provenanceLabel: data.provenanceLabel, syncedAtIso: data.syncedAtIso };
  return {
    calendar: { cards: data.cards.filter((c) => c.kind !== 'NOTION_DUE'), ...meta },
    notion: { cards: data.cards.filter((c) => c.kind === 'NOTION_DUE'), ...meta },
    gmail: { threads: threads.slice(0, 5).map(({ threadId, fromName, fromEmail, subject, snippet }) => ({ threadId, fromName, fromEmail, subject, snippet })) },
  };
}

/** What the owner's own Chrome is asked to read. Read-only goals; the browser agent still gates anything risky. */
export const BROWSER_READ_GOAL: Record<SnapshotSource, string> = {
  calendar: 'Open https://calendar.google.com and read my next 5 events today. Answer with one event per line as "HH:MM | title" and nothing else. Change nothing.',
  gmail: 'Open https://mail.google.com and read the 5 newest inbox threads. Answer with one per line as "sender | subject" and nothing else. Change nothing.',
  notion: 'Open https://www.notion.so and read up to 5 open tasks from my task list. Answer with one task title per line and nothing else. Change nothing.',
  telegram: 'Open https://web.telegram.org and read the newest message. Answer in two lines: the sender, then the message text. Change nothing.',
};

const lineList = (answer: string): string[] =>
  answer
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s>*•-]+/, '').trim())
    .filter(Boolean)
    .slice(0, 8);

const cardId = (prefix: string, text: string) => `${prefix}-${crypto.createHash('sha1').update(text).digest('hex').slice(0, 8)}`;

/** Turns the browser agent's plain-text answer into the same payload shape the API route stores. Throws when nothing parses. */
export function normalizeBrowserAnswer(source: SnapshotSource, answer: string, nowIso: string): WorkspaceSlice | GmailSlice | TelegramSlice {
  const lines = lineList(answer);
  const base = { sourceMode: 'LIVE' as const, syncedAtIso: nowIso };
  if (source === 'calendar') {
    const day = nowIso.slice(0, 10);
    const cards: CorridorCard[] = [];
    for (const l of lines) {
      const m = l.match(/^(\d{1,2}):(\d{2})\s*\|\s*(.+)$/);
      if (!m) continue;
      const hhmm = `${m[1].padStart(2, '0')}:${m[2]}`;
      const startIso = `${day}T${hhmm}:00.000Z`;
      cards.push({
        id: cardId('br-cal', l),
        sourceMode: 'LIVE',
        syncedAtIso: nowIso,
        provenanceLabel: 'GCAL BROWSER',
        kind: 'MEETING',
        title: m[3].slice(0, 60),
        timeMeta: hhmm,
        startIso,
        endIso: new Date(Date.parse(startIso) + 30 * 60_000).toISOString(),
        contextLine1: 'Read from your own Chrome',
        contextLine2: 'Google Calendar (browser, read-only)',
        triageRule: 'UPCOMING',
        etag: cardId('br', l),
        quickActions: [],
      });
    }
    if (cards.length === 0) throw new Error('Browser answer had no "HH:MM | title" lines');
    return { cards, provenanceLabel: 'GCAL BROWSER', ...base };
  }
  if (source === 'notion') {
    const cards: CorridorCard[] = lines.slice(0, 3).map((l) => ({
      id: cardId('br-notion', l),
      sourceMode: 'LIVE' as const,
      syncedAtIso: nowIso,
      provenanceLabel: 'NOTION BROWSER',
      kind: 'NOTION_DUE' as const,
      title: l.slice(0, 60),
      timeMeta: 'DUE',
      contextLine1: 'Read from your own Chrome',
      contextLine2: 'Notion (browser, read-only)',
      triageRule: 'NOTION_OVERDUE' as const,
      etag: cardId('br', l),
      quickActions: [],
    }));
    if (cards.length === 0) throw new Error('Browser answer had no task lines');
    return { cards, provenanceLabel: 'NOTION BROWSER', ...base };
  }
  if (source === 'gmail') {
    const threads = lines.flatMap((l) => {
      const [from, ...rest] = l.split('|').map((p) => p.trim());
      return from && rest.length ? [{ threadId: cardId('br-th', l), fromName: from, fromEmail: '', subject: rest.join(' | '), snippet: '' }] : [];
    });
    if (threads.length === 0) throw new Error('Browser answer had no "sender | subject" lines');
    return { threads };
  }
  if (lines.length === 0) throw new Error('Browser answer was empty');
  return { title: `TG · ${lines[0]}`.slice(0, 60), detail: (lines[1] ?? '').slice(0, 120) };
}

/** Goal text for an already-approved write sent through the owner's Chrome. */
export function browserWriteGoal(op: ActionOperation): string {
  const head = 'The owner already approved this exact action. Do only this, nothing else.';
  switch (op.op) {
    case 'MOVE_EVENT':
      return `${head} In Google Calendar move the event "${op.targetLabel}" to ${op.afterValue.replace('|', ' until ')}.`;
    case 'CREATE_HOLD':
      return `${head} In Google Calendar create a hold "${op.targetLabel}" at ${op.afterValue.replace('|', ' until ')}.`;
    case 'SEND_REPLY':
    case 'SAVE_DRAFT':
      return `${head} In Gmail ${op.op === 'SAVE_DRAFT' ? 'save a draft reply' : 'reply'} on the thread "${op.targetLabel}" with this text: ${op.afterValue}`;
    case 'CREATE_TASK':
      return `${head} In Notion add the task "${op.afterValue}".`;
    case 'MARK_DONE':
      return `${head} In Notion mark the task "${op.targetLabel}" done.`;
    case 'SEND_TELEGRAM':
      return `${head} In Telegram Web open the chat "${op.targetLabel}" and send this message: ${op.afterValue}`;
    default:
      return `${head} ${op.op} ${op.targetLabel}: ${op.afterValue}`;
  }
}

/** Receipt for writes done through the browser. They cannot be undone by OnQ, and the receipt says so. */
export function browserReceipt(input: {
  idempotencyKey: string;
  ops: ActionOperation[];
  sourceMode: SourceMode;
  answers: string[];
  nowIso: string;
  tag: string;
}): CommitReceipt {
  return {
    receiptId: `BRW-${input.tag}`,
    idempotencyKey: input.idempotencyKey,
    committedAtIso: input.nowIso,
    status: 'COMMITTED',
    sourceMode: input.sourceMode,
    summaryLines: input.ops.map((o, i) => `OK ${o.provider} via your Chrome${input.answers[i] ? `: ${input.answers[i].slice(0, 24)}` : ''}`).slice(0, 3),
    operations: input.ops.map((o) => ({ ...o, reversible: false, recallNote: 'DONE IN BROWSER - CANNOT UNDO' })),
    canUndo: false,
  };
}

/** HH:MM (UTC, same as every other time on the glasses) the snapshot was fetched. */
export function asOfHhmm(fetchedAtMs: number): string {
  return new Date(fetchedAtMs).toISOString().slice(11, 16);
}

/** Only snapshots older than this get a freshness tag, so default demo / sim output is unchanged. */
export const FRESHNESS_TAG_AFTER_MS = 60_000;
const TAG_LEFT_BUDGET = 24; // the idle header is "LIVE | <label>" plus the counter; keep the tag inside 42 columns

/** 'GCAL+GMAIL as of 09:41', clipped so the time is never the part that gets cut. */
export function tagProvenance(label: string, fetchedAtMs: number): string {
  const tag = ` as of ${asOfHhmm(fetchedAtMs)}`;
  return `${label.slice(0, Math.max(4, TAG_LEFT_BUDGET - tag.length))}${tag}`;
}
