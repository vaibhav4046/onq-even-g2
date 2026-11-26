import type {
  ActionPreview,
  CommitReceipt,
  ConflictLockDetail,
  CorridorCard,
  HudState,
  MeetingSessionState,
  NormalizedEvenEvent,
  OutboxUiStatus,
  SourceMode,
} from './types.js';

export const ARM_DURATION_MS = 2000;
export const ARM_TICK_MS = 250; // 4 Hz BLE-safe ring cadence

export interface HudControllerHooks {
  onStateChange?: (state: HudState) => void;
  onStageAction?: (card: CorridorCard, actionIndex: number) => Promise<ActionPreview | ConflictLockDetail | null>;
  onStageSlot?: (slotStartIso: string, slotEndIso: string) => Promise<ActionPreview | ConflictLockDetail>;
  onCommitPreview?: (preview: ActionPreview) => Promise<CommitReceipt | ConflictLockDetail>;
  onUndoReceipt?: (receipt: CommitReceipt) => Promise<CommitReceipt>;
  onRefreshCorridor?: () => Promise<{ cards: CorridorCard[]; sourceMode: SourceMode; provenanceLabel: string; syncedAtIso: string }>;
  onStartVoice?: () => void;
  onStopVoice?: () => Promise<void>;
  onExitMeeting?: () => Promise<void> | void;
  onRequestShutdown?: () => void;
}

export function createInitialHudState(cards: CorridorCard[] = [], sourceMode: SourceMode = 'DEMO'): HudState {
  const nowIso = new Date().toISOString();
  return {
    phase: 'idle',
    sourceMode,
    provenanceLabel: sourceMode === 'LIVE' ? 'GCAL+GMAIL+NOTION' : 'SAMPLE',
    cards,
    selectedCardIndex: 0,
    selectedActionIndex: 0,
    previewSelection: 'NO',
    preview: null,
    receipt: null,
    conflict: null,
    answerLines: [],
    errorMessage: null,
    armRemainingMs: 0,
    commitId: 0,
    rmsLevel: 0,
    transcript: '',
    syncedAtIso: nowIso,
    meeting: null,
  };
}

function isConflictDetail(val: unknown): val is ConflictLockDetail {
  return (
    Boolean(val) &&
    typeof val === 'object' &&
    'code' in (val as Record<string, unknown>) &&
    String((val as Record<string, unknown>).code).startsWith('CONFLICT_')
  );
}

/**
 * 4-phase Commit-Locked FSM:
 * - Default-NO on every preview
 * - 2.0s Arm/Undo Ring: any tap/double-tap/foreground-exit cancels with ZERO writes
 * - At 0.0s: synchronously transitions to committing BEFORE awaiting network I/O
 * - Monotonic commitId prevents stale async responses from mutating newer transitions
 */
export class OnQHudController {
  private state: HudState;
  private armTimer: ReturnType<typeof setInterval> | null = null;
  private armStartedAt = 0;

  constructor(
    initial?: Partial<HudState>,
    private readonly hooks: HudControllerHooks = {},
    private readonly nowFn: () => number = () => Date.now(),
  ) {
    this.state = { ...createInitialHudState(), ...initial };
  }

  getState(): HudState {
    return this.state;
  }

  private emit(): void {
    this.hooks.onStateChange?.(this.state);
  }

  private setState(patch: Partial<HudState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private clearArmTimer(): void {
    if (this.armTimer !== null) {
      clearInterval(this.armTimer);
      this.armTimer = null;
    }
  }

  setCorridor(
    cards: CorridorCard[],
    sourceMode: SourceMode,
    provenanceLabel: string,
    syncedAtIso = new Date(this.nowFn()).toISOString(),
  ): void {
    if (this.state.phase === 'committing' || this.state.phase === 'armed') return;
    const boundedIdx =
      cards.length === 0 ? 0 : Math.min(this.state.selectedCardIndex, cards.length - 1);
    this.setState({
      cards,
      sourceMode,
      provenanceLabel,
      syncedAtIso,
      selectedCardIndex: boundedIdx,
      phase: sourceMode === 'STALE' ? 'stale' : this.state.phase === 'stale' ? 'idle' : this.state.phase,
    });
  }

  stagePreview(preview: ActionPreview, isWrapUp = false): void {
    this.clearArmTimer();
    this.setState({
      phase: isWrapUp ? 'wrap_up' : 'preview',
      preview,
      previewSelection: 'NO', // ALWAYS Default-NO
      conflict: null,
      errorMessage: null,
    });
  }

  setMeetingSession(meeting: MeetingSessionState | null, answerLines: string[] = []): void {
    if (this.state.phase === 'committing' || this.state.phase === 'armed') return;
    if (!meeting) {
      this.setState({ phase: 'idle', meeting: null, answerLines });
      return;
    }
    this.setState({
      phase: 'meeting_live',
      meeting,
      answerLines,
      conflict: null,
      errorMessage: null,
    });
  }

  showConflict(conflict: ConflictLockDetail): void {
    this.clearArmTimer();
    this.setState({
      phase: 'conflict',
      conflict,
      preview: null,
      previewSelection: 'NO',
    });
  }

  showAnswer(lines: string[]): void {
    this.clearArmTimer();
    this.setState({
      phase: 'idle',
      answerLines: lines,
    });
  }

  showError(message: string): void {
    this.clearArmTimer();
    this.setState({
      phase: 'error',
      errorMessage: message,
      preview: null,
    });
  }

  setListening(rmsLevel = 0, transcript = ''): void {
    if (this.state.phase === 'committing') return;
    this.clearArmTimer();
    this.setState({
      phase: 'listening',
      rmsLevel,
      transcript,
      errorMessage: null,
    });
  }

  armCountdown(): void {
    if ((this.state.phase !== 'preview' && this.state.phase !== 'wrap_up') || !this.state.preview) return;
    this.clearArmTimer();
    this.armStartedAt = this.nowFn();
    this.setState({
      phase: 'armed',
      armRemainingMs: ARM_DURATION_MS,
    });

    this.armTimer = setInterval(() => {
      this.tickArm(this.nowFn());
    }, ARM_TICK_MS);
  }

  /**
   * Exposed for deterministic timer testing without real wall-clock waiting.
   */
  tickArm(nowMs = this.nowFn()): void {
    if (this.state.phase !== 'armed' || !this.state.preview) {
      this.clearArmTimer();
      return;
    }
    const elapsed = nowMs - this.armStartedAt;
    const remaining = Math.max(0, ARM_DURATION_MS - elapsed);
    if (remaining > 0) {
      this.setState({ armRemainingMs: remaining });
      return;
    }

    // 0.0s boundary reached: clear timer & SYNCHRONOUSLY enter committing BEFORE async I/O
    this.clearArmTimer();
    const previewToCommit = this.state.preview;
    const nextCommitId = this.state.commitId + 1;
    this.setState({
      phase: 'committing',
      armRemainingMs: 0,
      commitId: nextCommitId,
    });
    void this.executeCommit(previewToCommit, nextCommitId);
  }

  private async executeCommit(preview: ActionPreview, commitId: number): Promise<void> {
    if (!this.hooks.onCommitPreview) return;
    try {
      const result = await this.hooks.onCommitPreview(preview);
      if (this.state.commitId !== commitId) return; // stale async guard
      if (isConflictDetail(result)) {
        this.setState({
          phase: 'conflict',
          conflict: result,
          preview: null,
          previewSelection: 'NO',
        });
        return;
      }
      this.setState({
        phase: 'done',
        receipt: result,
        preview: null,
        previewSelection: 'NO',
      });
    } catch (err) {
      if (this.state.commitId !== commitId) return;
      const msg = err instanceof Error ? err.message : 'Commit failed';
      this.setState({
        phase: 'error',
        errorMessage: msg,
        preview: null,
      });
    }
  }

  /**
   * The computer reports progress on a write that went to the background outbox. Updates the shown result card
   * only when it is that write's card. A failure while the glasses sit on the dossier becomes a one-line notice.
   */
  updateOutbox(upd: { id: string; status: OutboxUiStatus; reason?: string; summaryLines?: string[]; canUndo?: boolean; receiptId?: string }): void {
    const r = this.state.receipt;
    if (this.state.phase === 'done' && r?.outbox?.id === upd.id) {
      const finished = upd.status === 'done';
      this.setState({
        receipt: {
          ...r,
          receiptId: upd.receiptId ?? r.receiptId,
          summaryLines: upd.summaryLines?.length ? upd.summaryLines : r.summaryLines,
          canUndo: finished ? Boolean(upd.canUndo) : upd.status === 'queued' ? r.canUndo : false,
          outbox: { id: upd.id, status: upd.status, ...(upd.reason ? { reason: upd.reason } : {}) },
        },
      });
      return;
    }
    if (upd.status === 'failed' && this.state.phase === 'idle') this.showError(upd.reason ?? 'SEND FAILED');
  }

  disarmToUndone(): void {
    this.clearArmTimer();
    this.setState({
      phase: 'undone',
      armRemainingMs: 0,
      preview: null,
      previewSelection: 'NO',
    });
  }

  async handleEvent(ev: NormalizedEvenEvent): Promise<void> {
    // Hard input lock while committing at 0.0s boundary
    if (this.state.phase === 'committing') {
      return;
    }

    // Lifecycle events never trigger taps/writes
    if (ev.kind === 'FOREGROUND_EXIT') {
      if (this.state.phase === 'armed') {
        this.disarmToUndone();
      }
      return;
    }
    if (ev.kind === 'FOREGROUND_ENTER') {
      if (this.hooks.onRefreshCorridor) {
        try {
          const data = await this.hooks.onRefreshCorridor();
          this.setCorridor(data.cards, data.sourceMode, data.provenanceLabel, data.syncedAtIso);
        } catch {
          // Keep cached data with STALE badge
          this.setState({ phase: 'stale', sourceMode: 'STALE' });
        }
      }
      return;
    }

    // Voice capture hold/release
    if (ev.kind === 'LONG_PRESS') {
      this.setListening(0, '');
      this.hooks.onStartVoice?.();
      return;
    }
    if (ev.kind === 'LONG_PRESS_RELEASE') {
      if (this.state.phase === 'listening') {
        await this.hooks.onStopVoice?.();
      }
      return;
    }

    // While armed: ANY click or double-click disarms with ZERO writes
    if (this.state.phase === 'armed') {
      if (ev.kind === 'CLICK' || ev.kind === 'DOUBLE_CLICK') {
        this.disarmToUndone();
      }
      return;
    }

    if (this.state.phase === 'preview' || this.state.phase === 'wrap_up') {
      if (ev.kind === 'SCROLL_UP' || ev.kind === 'SCROLL_DOWN') {
        this.setState({
          previewSelection: this.state.previewSelection === 'NO' ? 'YES' : 'NO',
        });
        return;
      }
      if (ev.kind === 'DOUBLE_CLICK') {
        this.disarmToUndone();
        return;
      }
      if (ev.kind === 'CLICK') {
        if (this.state.previewSelection === 'YES') {
          this.armCountdown();
        } else {
          this.disarmToUndone();
        }
      }
      return;
    }

    if (this.state.phase === 'conflict') {
      if (ev.kind === 'DOUBLE_CLICK') {
        this.setState({ phase: 'idle', conflict: null });
        return;
      }
      if (
        ev.kind === 'CLICK' &&
        this.state.conflict?.nextFreeStartIso &&
        this.state.conflict?.nextFreeEndIso &&
        this.hooks.onStageSlot
      ) {
        const res = await this.hooks.onStageSlot(
          this.state.conflict.nextFreeStartIso,
          this.state.conflict.nextFreeEndIso,
        );
        if (isConflictDetail(res)) {
          this.showConflict(res);
        } else {
          this.stagePreview(res);
        }
      } else if (ev.kind === 'CLICK') {
        this.setState({ phase: 'idle', conflict: null });
      }
      return;
    }

    if (this.state.phase === 'done' && this.state.receipt) {
      if (ev.kind === 'DOUBLE_CLICK') {
        this.setState({ phase: 'idle', receipt: null });
        return;
      }
      if (ev.kind === 'CLICK') {
        if (this.state.receipt.canUndo && this.hooks.onUndoReceipt) {
          const undone = await this.hooks.onUndoReceipt(this.state.receipt);
          this.setState({ phase: 'undone', receipt: undone });
        } else {
          this.setState({ phase: 'idle', receipt: null });
        }
      }
      return;
    }

    if (this.state.phase === 'undone' || this.state.phase === 'error' || this.state.phase === 'stale') {
      if (ev.kind === 'CLICK' || ev.kind === 'DOUBLE_CLICK') {
        if (this.state.phase === 'stale' && this.hooks.onRefreshCorridor) {
          try {
            const data = await this.hooks.onRefreshCorridor();
            this.setState({ phase: 'idle' });
            this.setCorridor(data.cards, data.sourceMode, data.provenanceLabel, data.syncedAtIso);
            return;
          } catch {
            return;
          }
        }
        this.setState({ phase: 'idle', errorMessage: null, receipt: null });
      }
      return;
    }

    if (this.state.phase === 'meeting_live') {
      if (ev.kind === 'DOUBLE_CLICK') {
        await this.hooks.onExitMeeting?.();
        this.setMeetingSession(null);
      }
      return;
    }

    if (this.state.phase === 'detail') {
      const card = this.state.cards[this.state.selectedCardIndex];
      const count = card?.quickActions.length ?? 0;
      if (ev.kind === 'DOUBLE_CLICK') {
        this.setState({ phase: 'idle', selectedActionIndex: 0 });
        return;
      }
      if (ev.kind === 'SCROLL_DOWN' && count > 0) {
        this.setState({ selectedActionIndex: (this.state.selectedActionIndex + 1) % count });
        return;
      }
      if (ev.kind === 'SCROLL_UP' && count > 0) {
        this.setState({
          selectedActionIndex: (this.state.selectedActionIndex - 1 + count) % count,
        });
        return;
      }
      if (ev.kind === 'CLICK' && card && this.hooks.onStageAction) {
        const idx = ev.listIndex !== undefined ? Math.min(ev.listIndex, Math.max(0, count - 1)) : this.state.selectedActionIndex;
        const res = await this.hooks.onStageAction(card, idx);
        if (!res) return;
        if (isConflictDetail(res)) {
          this.showConflict(res);
        } else {
          this.stagePreview(res);
        }
      }
      return;
    }

    // phase === 'idle' (root dossier)
    if (ev.kind === 'DOUBLE_CLICK') {
      if ((this.state.answerLines?.length ?? 0) > 0) {
        this.setState({ answerLines: [] });
        return;
      }
      this.hooks.onRequestShutdown?.();
      return;
    }
    const cardCount = this.state.cards.length;
    if (ev.kind === 'SCROLL_DOWN' && cardCount > 0) {
      this.setState({
        selectedCardIndex: (this.state.selectedCardIndex + 1) % cardCount,
        selectedActionIndex: 0,
      });
      return;
    }
    if (ev.kind === 'SCROLL_UP' && cardCount > 0) {
      this.setState({
        selectedCardIndex: (this.state.selectedCardIndex - 1 + cardCount) % cardCount,
        selectedActionIndex: 0,
      });
      return;
    }
    if (ev.kind === 'CLICK' && cardCount > 0) {
      const cardIdx =
        ev.listIndex !== undefined ? Math.min(ev.listIndex, cardCount - 1) : this.state.selectedCardIndex;
      this.setState({
        phase: 'detail',
        selectedCardIndex: cardIdx,
        selectedActionIndex: 0,
      });
    }
  }

  destroy(): void {
    this.clearArmTimer();
  }
}
