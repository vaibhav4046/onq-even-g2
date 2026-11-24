import {
  checkCalendarConflict,
  checkNotionFreshness,
  checkThreadFreshness,
  parseIcsEvents,
  rankCorridorCards,
} from '@oncue/core';
import type {
  ActionPreview,
  BusySlot,
  CommitReceipt,
  ConflictLockDetail,
  CorridorCard,
} from '@oncue/core';
import type { GoogleWorkspaceClient } from './googleProvider.js';
import type { NotionWorkspaceClient } from './notionProvider.js';
import type {
  WorkspaceExecutionInput,
  WorkspaceProvider,
  WorkspaceSnapshot,
} from './types.js';

export interface LiveProviderDeps {
  google?: GoogleWorkspaceClient;
  notion?: NotionWorkspaceClient;
  getIcsFeed?: () => string | null;
}

/**
 * Real multi-app Track 04 WorkspaceProvider uniting Google Calendar, Gmail,
 * Google Drive, Notion (auto-discovered schema), and optional .ics calendar imports.
 */
export class LiveWorkspaceProvider implements WorkspaceProvider {
  readonly mode = 'LIVE' as const;
  private lastSnapshot: WorkspaceSnapshot = {
    sourceMode: 'LIVE',
    provenanceLabel: 'LIVE',
    syncedAtIso: new Date().toISOString(),
    cards: [],
    calendarEvents: [],
    gmailThreads: [],
    notionTasks: [],
  };
  private cardBaseline = new Map<string, CorridorCard>();
  private receiptSeq = 2000;

  constructor(private readonly deps: LiveProviderDeps) {}

  async fetchCorridor(nowIso = new Date().toISOString()): Promise<{
    cards: CorridorCard[];
    busySlots: BusySlot[];
    sourceMode: 'LIVE';
    provenanceLabel: string;
    syncedAtIso: string;
  }> {
    const nowMs = Date.parse(nowIso);
    const timeMin = new Date(nowMs - 15 * 60_000).toISOString();
    const timeMax = new Date(nowMs + 8 * 3600_000).toISOString();

    const activeSources: string[] = [];
    const calendarEvents: WorkspaceSnapshot['calendarEvents'] = [];
    const gmailThreads: WorkspaceSnapshot['gmailThreads'] = [];
    const notionTasks: WorkspaceSnapshot['notionTasks'] = [];

    if (this.deps.google) {
      try {
        const events = await this.deps.google.listUpcomingEvents(timeMin, timeMax);
        activeSources.push('GCAL');
        for (const ev of events) {
          const startIso = ev.start?.dateTime ?? ev.start?.date;
          const endIso = ev.end?.dateTime ?? ev.end?.date;
          if (!startIso || !endIso) continue;
          const att = ev.attendees?.find((a) => !a.self) ?? ev.attendees?.[0];
          calendarEvents.push({
            eventId: ev.id,
            title: ev.summary ?? 'Untitled meeting',
            startIso,
            endIso,
            attendeeEmail: att?.email,
            attendeeName: att?.displayName ?? att?.email?.split('@')[0],
            etag: ev.etag ?? '',
          });
        }
      } catch {
        // handled via partial sources or upstream failure
      }

      try {
        const threads = await this.deps.google.listRecentThreads('newer_than:2d', 5);
        activeSources.push('GMAIL');
        for (const t of threads) {
          gmailThreads.push({
            threadId: t.threadId,
            historyId: t.historyId,
            fromName: t.fromName,
            fromEmail: t.fromEmail,
            subject: t.subject,
            snippet: t.snippet,
            sentMessages: [],
          });
        }
      } catch {
        // Gmail optional if scope missing
      }
    }

    const icsRaw = this.deps.getIcsFeed?.();
    if (icsRaw && calendarEvents.length === 0) {
      const parsed = parseIcsEvents(icsRaw, nowIso);
      if (parsed.length > 0) activeSources.push('ICS');
      for (const p of parsed) {
        calendarEvents.push({
          eventId: p.uid,
          title: p.summary,
          startIso: p.startIso,
          endIso: p.endIso,
          attendeeEmail: p.attendeeEmail,
          attendeeName: p.attendeeName,
          etag: p.uid,
        });
      }
    }

    if (this.deps.notion) {
      try {
        const schema = await this.deps.notion.inspectSchema();
        const tasks = await this.deps.notion.queryOpenTasks();
        activeSources.push('NOTION');
        for (const tk of tasks) {
          notionTasks.push({
            pageId: tk.pageId,
            title: tk.title,
            dueIso: tk.dueIso,
            completed: tk.completed,
            lastEdited: tk.lastEdited,
            schemaType: schema.completionKind === 'status' ? 'status' : 'checkbox',
          });
        }
      } catch {
        // Notion optional
      }
    }

    const provenanceLabel = activeSources.length > 0 ? activeSources.join('+') : 'LIVE';
    const cards: CorridorCard[] = [];

    for (const ev of calendarEvents) {
      const matchedThr = gmailThreads.find(
        (t) => ev.attendeeEmail && t.fromEmail.toLowerCase() === ev.attendeeEmail.toLowerCase(),
      );
      const minsAway = Math.round((Date.parse(ev.startIso) - nowMs) / 60_000);
      const timeLabel = minsAway >= 0 && minsAway <= 90 ? `${ev.startIso.slice(11, 16)} (${minsAway}m)` : ev.startIso.slice(11, 16);

      const card: CorridorCard = {
        id: `live-ev-${ev.eventId}`,
        sourceMode: 'LIVE',
        syncedAtIso: nowIso,
        provenanceLabel,
        kind: 'MEETING',
        title: ev.title,
        timeMeta: timeLabel,
        startIso: ev.startIso,
        endIso: ev.endIso,
        contextLine1: matchedThr ? matchedThr.snippet : 'No new email asks in last 48h',
        contextLine2: notionTasks[0] ? `Notion: ${notionTasks[0].title}` : 'Live Google Workspace sync',
        triageRule: minsAway <= 45 ? 'IMMINENT_MTG' : 'UPCOMING',
        etag: ev.etag,
        calendarEventId: ev.eventId,
        gmailThreadId: matchedThr?.threadId,
        gmailHistoryId: matchedThr?.historyId,
        attendeeEmail: ev.attendeeEmail,
        attendeeName: ev.attendeeName,
        quickActions: [
          {
            id: `qa-push-${ev.eventId}`,
            label: `Push 15m${ev.attendeeName ? ` + Reply ${ev.attendeeName.split(' ')[0]}` : ''}`,
            intent: 'RESCHEDULE_AND_NOTIFY',
            commandText: `Push 15m${ev.attendeeName ? ` and tell ${ev.attendeeName.split(' ')[0]}` : ''}`,
          },
          ...(matchedThr
            ? [
                {
                  id: `qa-draft-${ev.eventId}`,
                  label: `Draft Reply ${ev.attendeeName?.split(' ')[0] ?? ''}`.trim(),
                  intent: 'REPLY_EMAIL' as const,
                  commandText: `Draft reply to ${ev.attendeeName?.split(' ')[0] ?? 'attendee'} confirmed`,
                },
              ]
            : []),
        ],
      };
      cards.push(card);
      this.cardBaseline.set(card.id, card);
    }

    for (const tk of notionTasks.filter((t) => !t.completed).slice(0, 3)) {
      const card: CorridorCard = {
        id: `live-notion-${tk.pageId}`,
        sourceMode: 'LIVE',
        syncedAtIso: nowIso,
        provenanceLabel,
        kind: 'NOTION_DUE',
        title: tk.title,
        timeMeta: tk.dueIso ? tk.dueIso.slice(0, 10) : 'DUE',
        contextLine1: 'Open Notion workspace task',
        contextLine2: `Schema: ${tk.schemaType}`,
        triageRule: 'NOTION_OVERDUE',
        etag: tk.lastEdited,
        notionPageId: tk.pageId,
        notionLastEdited: tk.lastEdited,
        quickActions: [
          {
            id: `qa-done-${tk.pageId}`,
            label: 'Mark Notion Task Done',
            intent: 'COMPLETE_NOTION_TASK',
            commandText: `Mark ${tk.title} done`,
          },
        ],
      };
      cards.push(card);
      this.cardBaseline.set(card.id, card);
    }

    const ranked = rankCorridorCards(cards, nowIso);
    this.lastSnapshot = {
      sourceMode: 'LIVE',
      provenanceLabel,
      syncedAtIso: nowIso,
      cards: ranked,
      calendarEvents,
      gmailThreads,
      notionTasks,
    };

    const busySlots: BusySlot[] = calendarEvents.map((e) => ({
      eventId: e.eventId,
      title: e.title,
      startIso: e.startIso,
      endIso: e.endIso,
    }));

    return {
      cards: ranked,
      busySlots,
      sourceMode: 'LIVE',
      provenanceLabel,
      syncedAtIso: nowIso,
    };
  }

  async checkLiveConflicts(preview: ActionPreview): Promise<ConflictLockDetail | null> {
    const baselineCard = preview.cardId ? this.cardBaseline.get(preview.cardId) : undefined;

    for (const op of preview.operations) {
      if (op.provider === 'GCAL' && (op.op === 'MOVE_EVENT' || op.op === 'CREATE_HOLD')) {
        const [startIso, endIso] = op.afterValue.split('|');
        let busySlots: BusySlot[] = this.lastSnapshot.calendarEvents.map((e) => ({
          eventId: e.eventId,
          title: e.title,
          startIso: e.startIso,
          endIso: e.endIso,
        }));
        if (this.deps.google) {
          const busy = await this.deps.google.queryFreeBusy(startIso, endIso);
          if (busy.length > 0) {
            busySlots = busy.map((b, idx) => ({
              eventId: `freebusy-${idx}`,
              title: 'Busy Calendar Event',
              startIso: b.start,
              endIso: b.end,
            }));
          }
        }
        const movingId = op.op === 'MOVE_EVENT' ? baselineCard?.calendarEventId : undefined;
        const res = checkCalendarConflict(startIso, endIso, busySlots, movingId);
        if (res.conflict && res.detail) return res.detail;
      }

      if (op.provider === 'GMAIL' && this.deps.google && baselineCard?.gmailThreadId) {
        const meta = await this.deps.google.getThreadMetadata(baselineCard.gmailThreadId);
        const fresh = checkThreadFreshness(baselineCard.gmailHistoryId, meta.historyId);
        if (!fresh.fresh && fresh.detail) return fresh.detail;
      }

      if (op.provider === 'NOTION' && op.op === 'MARK_DONE' && this.deps.notion && baselineCard?.notionPageId) {
        const currentEdited = await this.deps.notion.getPageLastEdited(baselineCard.notionPageId);
        const fresh = checkNotionFreshness(baselineCard.notionLastEdited, currentEdited);
        if (!fresh.fresh && fresh.detail) return fresh.detail;
      }
    }
    return null;
  }

  async executePreview(input: WorkspaceExecutionInput): Promise<CommitReceipt> {
    this.receiptSeq++;
    const receiptId = `LIVE-${this.receiptSeq}`;
    const baselineCard = input.preview.cardId ? this.cardBaseline.get(input.preview.cardId) : undefined;
    const summaryLines: string[] = [];
    const committedOps: CommitReceipt['operations'] = [];
    let anyReversible = false;

    for (const op of input.operations) {
      if (op.provider === 'GCAL' && op.op === 'MOVE_EVENT' && this.deps.google && baselineCard?.calendarEventId) {
        const [newStart, newEnd] = op.afterValue.split('|');
        await this.deps.google.patchEventTime(baselineCard.calendarEventId, newStart, newEnd);
        anyReversible = true;
        summaryLines.push(`OK GCAL: ${baselineCard.startIso?.slice(11, 16) ?? ''}->${newStart.slice(11, 16)}`);
        committedOps.push({
          ...op,
          reversible: true,
          externalId: baselineCard.calendarEventId,
        });
      } else if (op.provider === 'GCAL' && op.op === 'CREATE_HOLD' && this.deps.google) {
        const [startIso, endIso] = op.afterValue.split('|');
        const created = await this.deps.google.createEvent(op.targetLabel, startIso, endIso);
        anyReversible = true;
        summaryLines.push(`OK GCAL: Hold ${startIso.slice(11, 16)} created`);
        committedOps.push({ ...op, reversible: true, externalId: created.id });
      } else if (op.provider === 'GMAIL' && this.deps.google && baselineCard?.gmailThreadId) {
        const draftOnly = op.op === 'SAVE_DRAFT';
        const res = await this.deps.google.sendThreadedReply({
          threadId: baselineCard.gmailThreadId,
          bodyText: op.afterValue,
          draftOnly,
        });
        if (!draftOnly) {
          summaryLines.push(`OK MAIL: Sent to ${res.recipient}`);
          committedOps.push({
            ...op,
            reversible: false,
            recallNote: 'SENT - CANNOT RECALL',
            externalId: res.id,
          });
        } else {
          anyReversible = true;
          summaryLines.push(`OK MAIL: Draft saved (${res.recipient})`);
          committedOps.push({
            ...op,
            reversible: true,
            recallNote: 'DRAFT DELETED ON UNDO',
            externalId: res.id,
          });
        }
      } else if (op.provider === 'NOTION' && op.op === 'CREATE_TASK' && this.deps.notion) {
        const created = await this.deps.notion.createTask(op.afterValue);
        anyReversible = true;
        summaryLines.push(`OK NOTION: ${op.afterValue.slice(0, 26)}`);
        committedOps.push({ ...op, reversible: true, externalId: created.pageId });
      } else if (op.provider === 'NOTION' && op.op === 'MARK_DONE' && this.deps.notion && baselineCard?.notionPageId) {
        await this.deps.notion.markTaskComplete(baselineCard.notionPageId);
        anyReversible = true;
        summaryLines.push('OK NOTION: Marked done');
        committedOps.push({ ...op, reversible: true, externalId: baselineCard.notionPageId });
      }
    }

    return {
      receiptId,
      idempotencyKey: input.preview.idempotencyKey,
      committedAtIso: new Date().toISOString(),
      status: 'COMMITTED',
      sourceMode: 'LIVE',
      summaryLines,
      operations: committedOps,
      undoExpiresAtIso: anyReversible ? new Date(Date.now() + 30_000).toISOString() : undefined,
      canUndo: anyReversible,
    };
  }

  async undoReceipt(receipt: CommitReceipt): Promise<CommitReceipt> {
    for (const op of receipt.operations) {
      if (op.provider === 'GCAL' && op.op === 'MOVE_EVENT' && op.beforeValue && op.externalId && this.deps.google) {
        const [oldStart, oldEnd] = op.beforeValue.split('|');
        await this.deps.google.patchEventTime(op.externalId, oldStart, oldEnd);
      } else if (op.provider === 'GCAL' && op.op === 'CREATE_HOLD' && op.externalId && this.deps.google) {
        await this.deps.google.deleteEvent(op.externalId);
      } else if (op.provider === 'GMAIL' && op.op === 'SAVE_DRAFT' && op.externalId && this.deps.google) {
        await this.deps.google.deleteDraft(op.externalId);
      } else if (op.provider === 'NOTION' && op.op === 'CREATE_TASK' && op.externalId && this.deps.notion) {
        await this.deps.notion.archivePage(op.externalId);
      } else if (op.provider === 'NOTION' && op.op === 'MARK_DONE' && op.externalId && this.deps.notion) {
        await this.deps.notion.unmarkTaskComplete(op.externalId);
      }
    }
    return {
      ...receipt,
      status: 'UNDONE',
      canUndo: false,
      summaryLines: ['UNDONE LIVE OPS', ...receipt.operations.filter((o) => o.recallNote).map((o) => o.recallNote!)],
    };
  }

  getSnapshot(): WorkspaceSnapshot {
    return this.lastSnapshot;
  }
}
