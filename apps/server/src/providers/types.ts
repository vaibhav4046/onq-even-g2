import type {
  ActionOperation,
  ActionPreview,
  BusySlot,
  CommitReceipt,
  ConflictLockDetail,
  CorridorCard,
  SourceMode,
} from '@onq/core';

export interface WorkspaceSnapshot {
  sourceMode: SourceMode;
  provenanceLabel: string;
  syncedAtIso: string;
  cards: CorridorCard[];
  calendarEvents: Array<{
    eventId: string;
    title: string;
    startIso: string;
    endIso: string;
    attendeeEmail?: string;
    attendeeName?: string;
    etag: string;
  }>;
  gmailThreads: Array<{
    threadId: string;
    historyId: string;
    fromName: string;
    fromEmail: string;
    subject: string;
    snippet: string;
    sentMessages: Array<{ to: string; body: string; atIso: string; mode: 'SENT' | 'DRAFT' }>;
  }>;
  notionTasks: Array<{
    pageId: string;
    title: string;
    dueIso?: string;
    completed: boolean;
    lastEdited: string;
    schemaType: 'checkbox' | 'status';
  }>;
}

export interface WorkspaceExecutionInput {
  preview: ActionPreview;
  operations: ActionOperation[];
  card?: CorridorCard;
}

export interface WorkspaceProvider {
  readonly mode: SourceMode;
  fetchCorridor(nowIso?: string): Promise<{
    cards: CorridorCard[];
    busySlots: BusySlot[];
    sourceMode: SourceMode;
    provenanceLabel: string;
    syncedAtIso: string;
  }>;
  checkLiveConflicts(preview: ActionPreview): Promise<ConflictLockDetail | null>;
  executePreview(input: WorkspaceExecutionInput): Promise<CommitReceipt>;
  undoReceipt(receipt: CommitReceipt): Promise<CommitReceipt>;
  getSnapshot(): WorkspaceSnapshot;
}
