export type SourceMode = 'LIVE' | 'DEMO' | 'STALE';

export type CorridorCardKind = 'MEETING' | 'EMAIL_ASK' | 'NOTION_DUE';

export type TriageRule =
  | 'IMMINENT_MTG'
  | 'ASK_DEADLINE'
  | 'DIRECT_ASK'
  | 'NOTION_OVERDUE'
  | 'UPCOMING';

export type ActionIntent =
  | 'RESCHEDULE_AND_NOTIFY'
  | 'CREATE_ACTION_PACK'
  | 'REPLY_EMAIL'
  | 'COMPLETE_NOTION_TASK'
  | 'ASK_NOTES'
  | 'AMBIGUOUS'
  | 'UNKNOWN';

export interface QuickActionOption {
  id: string;
  label: string; // max 28 chars for G2 ListContainer / summary
  intent: Exclude<ActionIntent, 'ASK_NOTES' | 'AMBIGUOUS' | 'UNKNOWN'>;
  commandText: string;
}

export interface CorridorCard {
  id: string;
  sourceMode: SourceMode;
  syncedAtIso: string;
  provenanceLabel: string; // e.g. "LIVE · GCAL+GMAIL" | "DEMO · SANDBOX" | "STALE · 4m ago"
  kind: CorridorCardKind;
  title: string;
  timeMeta: string;
  startIso?: string;
  endIso?: string;
  contextLine1: string;
  contextLine2: string;
  triageRule: TriageRule;
  etag: string;
  calendarEventId?: string;
  gmailThreadId?: string;
  gmailHistoryId?: string;
  notionPageId?: string;
  notionLastEdited?: string;
  attendeeEmail?: string;
  attendeeName?: string;
  driveDocTitle?: string;
  driveSnippet?: string;
  quickActions: QuickActionOption[];
}

export interface ActionOperation {
  provider: 'GCAL' | 'GMAIL' | 'NOTION';
  op:
    | 'MOVE_EVENT'
    | 'CREATE_HOLD'
    | 'SEND_REPLY'
    | 'SAVE_DRAFT'
    | 'CREATE_TASK'
    | 'MARK_DONE';
  targetLabel: string;
  beforeValue?: string;
  afterValue: string;
}

export interface SafetyChecks {
  calendarConflictFree: boolean;
  threadFresh: boolean;
  recipientVerified: boolean;
  factGuardPassed: boolean;
}

export interface ActionPreview {
  previewToken: string;
  idempotencyKey: string;
  expiresAtIso: string;
  intent: Exclude<ActionIntent, 'ASK_NOTES' | 'AMBIGUOUS' | 'UNKNOWN'>;
  defaultSelection: 'NO';
  cardId?: string;
  summaryLines: string[];
  operations: ActionOperation[];
  safetyChecks: SafetyChecks;
  conflictDetail?: string;
  suggestedSlotIso?: string;
  suggestedSlotLabel?: string;
}

export interface CommitReceipt {
  receiptId: string;
  idempotencyKey: string;
  committedAtIso: string;
  status: 'COMMITTED' | 'SEND_UNKNOWN' | 'UNDONE' | 'CONFLICT';
  sourceMode: SourceMode;
  summaryLines: string[];
  operations: Array<
    ActionOperation & {
      reversible: boolean;
      recallNote?: string; // e.g. "SENT - CANNOT RECALL"
      externalId?: string;
    }
  >;
  undoExpiresAtIso?: string;
  canUndo: boolean;
}

export interface ConflictLockDetail {
  code: 'CONFLICT_CALENDAR_BUSY' | 'CONFLICT_THREAD_UPDATED' | 'CONFLICT_NOTION_STALE';
  message: string;
  conflictingTitle?: string;
  nextFreeStartIso?: string;
  nextFreeEndIso?: string;
  nextFreeLabel?: string;
}

export type HudPhase =
  | 'idle'
  | 'detail'
  | 'listening'
  | 'meeting_live'
  | 'wrap_up'
  | 'preview'
  | 'armed'
  | 'committing'
  | 'done'
  | 'undone'
  | 'conflict'
  | 'error'
  | 'stale';

export type VoiceOrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'armed' | 'conflict';

export interface TtsWordBoundary {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface MeetingTurn {
  id: string;
  speakerLabel: string;
  attendeeName: string;
  text: string;
  atIso: string;
  isWearer: boolean;
  isFinal: boolean;
}

export interface MeetingDecision {
  id: string;
  summary: string;
  speaker: string;
  atIso: string;
}

export interface MeetingActionItem {
  id: string;
  title: string;
  owner: string;
  dueIso?: string;
  dueLabel?: string;
}

export type MeetingProviderMode = 'LIVE_ASSEMBLYAI' | 'LOCAL_WHISPER' | 'DEMO_SANDBOX';

export interface MeetingSessionState {
  active: boolean;
  startedAtIso: string;
  elapsedSec: number;
  speakerCount: number;
  providerMode: MeetingProviderMode;
  attendees: string[];
  turns: MeetingTurn[];
  decisions: MeetingDecision[];
  actions: MeetingActionItem[];
}

export interface HudState {
  phase: HudPhase;
  sourceMode: SourceMode;
  provenanceLabel: string;
  cards: CorridorCard[];
  selectedCardIndex: number;
  selectedActionIndex: number;
  previewSelection: 'NO' | 'YES';
  preview: ActionPreview | null;
  receipt: CommitReceipt | null;
  conflict: ConflictLockDetail | null;
  answerLines: string[];
  errorMessage: string | null;
  armRemainingMs: number;
  commitId: number;
  rmsLevel: number;
  transcript: string;
  syncedAtIso: string;
  meeting?: MeetingSessionState | null;
  voiceEngineLabel?: string;
  ttsVoiceId?: string;
}

export type NormalizedEvenEventKind =
  | 'CLICK'
  | 'DOUBLE_CLICK'
  | 'SCROLL_UP'
  | 'SCROLL_DOWN'
  | 'LONG_PRESS'
  | 'LONG_PRESS_RELEASE'
  | 'FOREGROUND_ENTER'
  | 'FOREGROUND_EXIT'
  | 'AUDIO_PCM'
  | 'MENU_CLICK'
  | 'UNKNOWN';

export interface NormalizedEvenEvent {
  kind: NormalizedEvenEventKind;
  listIndex?: number;
  menuItemId?: number;
  audioPcm?: Uint8Array;
  rawType?: string;
}
