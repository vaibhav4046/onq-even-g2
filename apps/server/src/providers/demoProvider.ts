import crypto from 'node:crypto';
import {
  checkCalendarConflict,
  checkNotionFreshness,
  checkThreadFreshness,
  rankCorridorCards,
} from '@onq/core';
import type {
  ActionPreview,
  BusySlot,
  CommitReceipt,
  ConflictLockDetail,
  CorridorCard,
} from '@onq/core';
import type {
  WorkspaceExecutionInput,
  WorkspaceProvider,
  WorkspaceSnapshot,
} from './types.js';

export interface DemoFaultInjection {
  forceThreadDrift?: boolean;
  forceConflictBusy?: boolean;
  forceSendUnknown?: boolean;
  forceOffline?: boolean;
  forceRateLimit429?: boolean;
}

export class DemoWorkspaceProvider implements WorkspaceProvider {
  readonly mode = 'DEMO' as const;
  private events: WorkspaceSnapshot['calendarEvents'];
  private threads: WorkspaceSnapshot['gmailThreads'];
  private tasks: WorkspaceSnapshot['notionTasks'];
  private receiptSeq = 1041;
  private fault: DemoFaultInjection = {};

  constructor(private readonly nowIso = '2026-11-24T13:48:00.000Z') {
    this.events = [
      {
        eventId: 'evt-vc-priya',
        title: 'Investor call',
        startIso: '2026-11-24T14:00:00.000Z',
        endIso: '2026-11-24T14:30:00.000Z',
        attendeeEmail: 'investor@sample.example',
        attendeeName: 'Investor contact',
        etag: 'etag-vc-1',
      },
      {
        eventId: 'evt-design-busy',
        title: 'Design Review',
        startIso: '2026-11-24T14:45:00.000Z',
        endIso: '2026-11-24T15:15:00.000Z',
        attendeeEmail: 'design@sample.example',
        attendeeName: 'Design lead',
        etag: 'etag-des-1',
      },
      {
        eventId: 'evt-partner-sync',
        title: 'Partner sync',
        startIso: '2026-11-24T15:15:00.000Z',
        endIso: '2026-11-24T15:45:00.000Z',
        attendeeEmail: 'partner@sample.example',
        attendeeName: 'Partner contact',
        etag: 'etag-partner-1',
      },
    ];

    this.threads = [
      {
        threadId: 'thr-priya-1',
        historyId: 'hist-100',
        fromName: 'Investor contact',
        fromEmail: 'investor@sample.example',
        subject: 'Re: 14:00 Investor call + Q4 deck',
        snippet: 'Can we push 15m? Q4 deck ready?',
        sentMessages: [],
      },
      {
        threadId: 'thr-partner-1',
        historyId: 'hist-200',
        fromName: 'Partner contact',
        fromEmail: 'partner@sample.example',
        subject: 'Q4 metrics checklist',
        snippet: 'Send Q4 metrics before partner sync?',
        sentMessages: [],
      },
    ];

    this.tasks = [
      {
        pageId: 'notion-task-1',
        title: 'Finalize Q4 deck notes',
        dueIso: '2026-11-24T16:00:00.000Z',
        completed: false,
        lastEdited: '2026-11-24T12:00:00.000Z',
        schemaType: 'checkbox',
      },
      {
        pageId: 'notion-task-2',
        title: 'Send Q4 metrics to Partner',
        dueIso: '2026-11-24T17:00:00.000Z',
        completed: false,
        lastEdited: '2026-11-24T12:10:00.000Z',
        schemaType: 'status',
      },
    ];
  }

  setFault(patch: DemoFaultInjection): void {
    this.fault = { ...this.fault, ...patch };
  }

  getNowIso(): string {
    return this.nowIso;
  }

  addBusySlot(title: string, startIso: string, endIso: string): void {
    this.events.push({
      eventId: `evt-user-${crypto.randomBytes(3).toString('hex')}`,
      title,
      startIso,
      endIso,
      etag: `etag-${Date.now()}`,
    });
  }

  injectIncomingReply(snippet: string): void {
    const thr = this.threads[0];
    if (thr) {
      thr.snippet = snippet;
      thr.historyId = `hist-${Date.now()}`;
    }
  }

  addNotionTask(title: string, dueIso?: string): void {
    this.tasks.unshift({
      pageId: `notion-user-${crypto.randomBytes(3).toString('hex')}`,
      title,
      dueIso,
      completed: false,
      lastEdited: new Date().toISOString(),
      schemaType: 'checkbox',
    });
  }

  toggleNotionTask(pageId: string): void {
    const t = this.tasks.find((x) => x.pageId === pageId);
    if (t) {
      t.completed = !t.completed;
      t.lastEdited = new Date().toISOString();
    }
  }

  resetSandbox(): void {
    const fresh = new DemoWorkspaceProvider(this.nowIso);
    this.events = fresh.events;
    this.threads = fresh.threads;
    this.tasks = fresh.tasks;
    this.fault = {};
    this.receiptSeq = 1041;
  }

  getBusySlots(): BusySlot[] {
    const base = this.events.map((e) => ({
      eventId: e.eventId,
      title: e.title,
      startIso: e.startIso,
      endIso: e.endIso,
    }));
    if (this.fault.forceConflictBusy) {
      base.push({
        eventId: 'evt-injected-conflict',
        title: 'Board Check-in',
        startIso: '2026-11-24T14:15:00.000Z',
        endIso: '2026-11-24T14:45:00.000Z',
      });
    }
    return base;
  }

  async fetchCorridor(nowIso = this.nowIso): Promise<{
    cards: CorridorCard[];
    busySlots: BusySlot[];
    sourceMode: 'DEMO' | 'STALE';
    provenanceLabel: string;
    syncedAtIso: string;
  }> {
    if (this.fault.forceRateLimit429) {
      throw Object.assign(new Error('Rate limited by upstream provider'), { statusCode: 429, retryAfter: 30 });
    }
    if (this.fault.forceOffline) {
      throw Object.assign(new Error('Workspace network unreachable'), { statusCode: 503 });
    }

    const vc = this.events[0];
    const investorThr = this.threads[0];
    const partner = this.events[2];
    const partnerThr = this.threads[1];
    const notionTask = this.tasks[0];

    const cards: CorridorCard[] = [
      {
        id: 'card-vc-priya',
        sourceMode: 'DEMO',
        syncedAtIso: nowIso,
        provenanceLabel: 'SAMPLE',
        kind: 'MEETING',
        title: vc.title,
        timeMeta: `${vc.startIso.slice(11, 16)} (12m)`,
        startIso: vc.startIso,
        endIso: vc.endIso,
        contextLine1: investorThr.snippet,
        contextLine2: 'Q4_Metrics_v3 (Drive) | 2 comments',
        triageRule: 'IMMINENT_MTG',
        etag: vc.etag,
        calendarEventId: vc.eventId,
        gmailThreadId: investorThr.threadId,
        gmailHistoryId: investorThr.historyId,
        notionPageId: notionTask.pageId,
        notionLastEdited: notionTask.lastEdited,
        attendeeEmail: vc.attendeeEmail,
        attendeeName: vc.attendeeName,
        driveDocTitle: 'Q4_Metrics_v3',
        driveSnippet: 'ARR growth +18% QoQ; runway 22m; slide 4 flagged by the investor.',
        quickActions: [
          {
            id: 'qa-push-15',
            label: 'Push 15m + Reply Investor',
            intent: 'RESCHEDULE_AND_NOTIFY',
            commandText: 'Push 15m and tell Investor',
          },
          {
            id: 'qa-push-conflict',
            label: 'Move 14:45 (Test 409 Lock)',
            intent: 'RESCHEDULE_AND_NOTIFY',
            commandText: 'Move VC sync to 14:45',
          },
          {
            id: 'qa-draft-reply',
            label: 'Draft Reply to Investor',
            intent: 'REPLY_EMAIL',
            commandText: 'Draft reply to Investor yes Q4 deck is ready',
          },
        ],
      },
      {
        id: 'card-partner-sync',
        sourceMode: 'DEMO',
        syncedAtIso: nowIso,
        provenanceLabel: 'SAMPLE',
        kind: 'EMAIL_ASK',
        title: partner.title,
        timeMeta: partner.startIso.slice(11, 16),
        startIso: partner.startIso,
        endIso: partner.endIso,
        contextLine1: partnerThr.snippet,
        contextLine2: `Notion: ${this.tasks[1].title}`,
        triageRule: 'ASK_DEADLINE',
        etag: partner.etag,
        calendarEventId: partner.eventId,
        gmailThreadId: partnerThr.threadId,
        gmailHistoryId: partnerThr.historyId,
        notionPageId: this.tasks[1].pageId,
        notionLastEdited: this.tasks[1].lastEdited,
        attendeeEmail: partner.attendeeEmail,
        attendeeName: partner.attendeeName,
        quickActions: [
          {
            id: 'qa-task-partner',
            label: 'Task + Hold for Partner',
            intent: 'CREATE_ACTION_PACK',
            commandText: 'Task: send Q4 metrics to Partner by Thursday',
          },
          {
            id: 'qa-done-partner',
            label: 'Mark Notion Task Done',
            intent: 'COMPLETE_NOTION_TASK',
            commandText: 'Mark Send Q4 metrics done',
          },
        ],
      },
    ];

    return {
      cards: rankCorridorCards(cards, nowIso),
      busySlots: this.getBusySlots(),
      sourceMode: 'DEMO',
      provenanceLabel: 'SAMPLE',
      syncedAtIso: nowIso,
    };
  }

  async checkLiveConflicts(preview: ActionPreview): Promise<ConflictLockDetail | null> {
    if (this.fault.forceThreadDrift) {
      return {
        code: 'CONFLICT_THREAD_UPDATED',
        message: 'Investor replied 4s ago; card stale',
      };
    }

    for (const op of preview.operations) {
      if (op.provider === 'GCAL' && (op.op === 'MOVE_EVENT' || op.op === 'CREATE_HOLD')) {
        const [startIso, endIso] = op.afterValue.split('|');
        const movingId = op.op === 'MOVE_EVENT' ? 'evt-vc-priya' : undefined;
        const conflict = checkCalendarConflict(startIso, endIso, this.getBusySlots(), movingId);
        if (conflict.conflict && conflict.detail) {
          return conflict.detail;
        }
      }
      if (op.provider === 'GMAIL' && (op.op === 'SEND_REPLY' || op.op === 'SAVE_DRAFT')) {
        const thr = this.threads.find((t) => op.targetLabel.includes(t.fromEmail) || op.targetLabel.includes(t.threadId));
        if (thr && preview.cardId === 'card-vc-priya') {
          const check = checkThreadFreshness('hist-100', thr.historyId);
          if (!check.fresh && check.detail) return check.detail;
        }
      }
      if (op.provider === 'NOTION' && op.op === 'MARK_DONE') {
        const task = this.tasks.find((t) => t.title === op.targetLabel || t.pageId === op.targetLabel);
        if (task) {
          const check = checkNotionFreshness(task.lastEdited, task.lastEdited);
          if (!check.fresh && check.detail) return check.detail;
        }
      }
    }
    return null;
  }

  async executePreview(input: WorkspaceExecutionInput): Promise<CommitReceipt> {
    if (this.fault.forceSendUnknown) {
      this.receiptSeq++;
      return {
        receiptId: `REC-${this.receiptSeq}`,
        idempotencyKey: input.preview.idempotencyKey,
        committedAtIso: new Date().toISOString(),
        status: 'SEND_UNKNOWN',
        sourceMode: 'DEMO',
        summaryLines: ['!! SEND_UNKNOWN (504 TIMEOUT)', 'CHECK OUTBOX BEFORE RETRY'],
        operations: input.operations.map((o) => ({ ...o, reversible: false })),
        canUndo: false,
      };
    }

    this.receiptSeq++;
    const receiptId = `REC-${this.receiptSeq}`;
    const summaryLines: string[] = [];
    const committedOps: CommitReceipt['operations'] = [];
    let anyReversible = false;

    for (const op of input.operations) {
      if (op.provider === 'GCAL' && op.op === 'MOVE_EVENT') {
        const [newStart, newEnd] = op.afterValue.split('|');
        const evt = this.events.find((e) => e.eventId === 'evt-vc-priya') ?? this.events[0];
        const prevStart = evt.startIso;
        const prevEnd = evt.endIso;
        evt.startIso = newStart;
        evt.endIso = newEnd;
        evt.etag = `etag-${Date.now()}`;
        anyReversible = true;
        summaryLines.push(`OK GCAL: ${prevStart.slice(11, 16)}->${newStart.slice(11, 16)}`);
        committedOps.push({
          ...op,
          beforeValue: `${prevStart}|${prevEnd}`,
          reversible: true,
          externalId: evt.eventId,
        });
      } else if (op.provider === 'GCAL' && op.op === 'CREATE_HOLD') {
        const [startIso, endIso] = op.afterValue.split('|');
        const holdId = `evt-hold-${crypto.randomBytes(3).toString('hex')}`;
        this.events.push({
          eventId: holdId,
          title: op.targetLabel,
          startIso,
          endIso,
          etag: `etag-${holdId}`,
        });
        anyReversible = true;
        summaryLines.push(`OK GCAL: Hold ${startIso.slice(11, 16)} created`);
        committedOps.push({ ...op, reversible: true, externalId: holdId });
      } else if (op.provider === 'GMAIL' && op.op === 'SEND_REPLY') {
        const thr = this.threads[0];
        thr.sentMessages.push({
          to: thr.fromEmail,
          body: op.afterValue,
          atIso: new Date().toISOString(),
          mode: 'SENT',
        });
        summaryLines.push(`OK MAIL: Sent to ${thr.fromName}`);
        committedOps.push({
          ...op,
          reversible: false,
          recallNote: 'SENT - CANNOT RECALL',
          externalId: thr.threadId,
        });
      } else if (op.provider === 'GMAIL' && op.op === 'SAVE_DRAFT') {
        const thr = this.threads.find((t) => op.targetLabel.includes(t.fromEmail)) ?? this.threads[0];
        thr.sentMessages.push({
          to: thr.fromEmail,
          body: op.afterValue,
          atIso: new Date().toISOString(),
          mode: 'DRAFT',
        });
        anyReversible = true;
        summaryLines.push(`OK MAIL: Draft saved for ${thr.fromName}`);
        committedOps.push({
          ...op,
          reversible: true,
          recallNote: 'DRAFT DELETED ON UNDO',
          externalId: thr.threadId,
        });
      } else if (op.provider === 'NOTION' && op.op === 'CREATE_TASK') {
        const pageId = `notion-${crypto.randomBytes(3).toString('hex')}`;
        this.tasks.unshift({
          pageId,
          title: op.afterValue,
          completed: false,
          lastEdited: new Date().toISOString(),
          schemaType: 'checkbox',
        });
        anyReversible = true;
        summaryLines.push(`OK NOTION: ${op.afterValue.slice(0, 26)}`);
        committedOps.push({ ...op, reversible: true, externalId: pageId });
      } else if (op.provider === 'NOTION' && op.op === 'MARK_DONE') {
        const task = this.tasks.find((t) => !t.completed) ?? this.tasks[0];
        if (task) {
          task.completed = true;
          task.lastEdited = new Date().toISOString();
        }
        anyReversible = true;
        summaryLines.push(`OK NOTION: Marked done`);
        committedOps.push({ ...op, reversible: true, externalId: task?.pageId });
      }
    }

    return {
      receiptId,
      idempotencyKey: input.preview.idempotencyKey,
      committedAtIso: new Date().toISOString(),
      status: 'COMMITTED',
      sourceMode: 'DEMO',
      summaryLines,
      operations: committedOps,
      undoExpiresAtIso: anyReversible ? new Date(Date.now() + 30_000).toISOString() : undefined,
      canUndo: anyReversible,
    };
  }

  async undoReceipt(receipt: CommitReceipt): Promise<CommitReceipt> {
    const updatedOps = receipt.operations.map((op) => {
      if (op.provider === 'GCAL' && op.op === 'MOVE_EVENT' && op.beforeValue) {
        const [oldStart] = op.beforeValue.split('|');
        const evt = this.events.find((e) => e.eventId === op.externalId);
        if (evt) {
          const dur = Date.parse(evt.endIso) - Date.parse(evt.startIso);
          evt.startIso = oldStart;
          evt.endIso = new Date(Date.parse(oldStart) + dur).toISOString();
        }
      } else if (op.provider === 'GCAL' && op.op === 'CREATE_HOLD' && op.externalId) {
        this.events = this.events.filter((e) => e.eventId !== op.externalId);
      } else if (op.provider === 'NOTION' && op.op === 'CREATE_TASK' && op.externalId) {
        this.tasks = this.tasks.filter((t) => t.pageId !== op.externalId);
      } else if (op.provider === 'NOTION' && op.op === 'MARK_DONE' && op.externalId) {
        const t = this.tasks.find((x) => x.pageId === op.externalId);
        if (t) t.completed = false;
      } else if (op.provider === 'GMAIL' && op.op === 'SAVE_DRAFT') {
        const thr = this.threads.find((t) => t.threadId === op.externalId);
        if (thr) {
          thr.sentMessages = thr.sentMessages.filter((m) => m.mode !== 'DRAFT');
        }
      }
      return op;
    });

    return {
      ...receipt,
      status: 'UNDONE',
      canUndo: false,
      summaryLines: ['UNDONE REVERSIBLE OPS', ...updatedOps.filter((o) => o.recallNote).map((o) => o.recallNote!)],
      operations: updatedOps,
    };
  }

  getSnapshot(): WorkspaceSnapshot {
    return {
      sourceMode: 'DEMO',
      provenanceLabel: 'SAMPLE',
      syncedAtIso: this.nowIso,
      cards: [],
      calendarEvents: this.events,
      gmailThreads: this.threads,
      notionTasks: this.tasks,
    };
  }
}
