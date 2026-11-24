import { describe, expect, it, vi } from 'vitest';
import {
  createInitialHudState,
  OnCueHudController,
} from '../src/index.js';
import type { ActionPreview, CommitReceipt, CorridorCard } from '../src/index.js';

const CARD_A: CorridorCard = {
  id: 'c1',
  sourceMode: 'DEMO',
  syncedAtIso: '2026-11-24T13:48:00.000Z',
  provenanceLabel: 'SANDBOX',
  kind: 'MEETING',
  title: 'VC Sync - Priya Nair',
  timeMeta: '14:00 (12m)',
  contextLine1: 'Can we push 15m?',
  contextLine2: 'Q4_Metrics_v3',
  triageRule: 'IMMINENT_MTG',
  etag: 'e1',
  quickActions: [
    { id: 'a1', label: 'Push 15m + Reply', intent: 'RESCHEDULE_AND_NOTIFY', commandText: 'push 15m' },
    { id: 'a2', label: 'Save Draft Only', intent: 'REPLY_EMAIL', commandText: 'draft' },
  ],
};

const CARD_B: CorridorCard = { ...CARD_A, id: 'c2', title: 'Partner Sync - Alex Chen' };

const PREVIEW: ActionPreview = {
  previewToken: 'tok-1',
  idempotencyKey: 'idem-1',
  expiresAtIso: '2026-11-24T13:50:00.000Z',
  intent: 'RESCHEDULE_AND_NOTIFY',
  defaultSelection: 'NO',
  summaryLines: ['GCAL: 14:00 -> 14:15'],
  operations: [{ provider: 'GCAL', op: 'MOVE_EVENT', targetLabel: 'VC Sync', afterValue: '14:15' }],
  safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
};

const RECEIPT: CommitReceipt = {
  receiptId: 'rec-1042',
  idempotencyKey: 'idem-1',
  committedAtIso: '2026-11-24T13:49:00.000Z',
  status: 'COMMITTED',
  sourceMode: 'DEMO',
  summaryLines: ['OK GCAL: 14:00 -> 14:15'],
  operations: [{ provider: 'GCAL', op: 'MOVE_EVENT', targetLabel: 'VC Sync', afterValue: '14:15', reversible: true }],
  canUndo: true,
};

describe('stateMachine.ts', () => {
  it('1. initializes in idle phase with Default-NO selection', () => {
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A, CARD_B], 'DEMO'));
    expect(ctrl.getState().phase).toBe('idle');
    expect(ctrl.getState().previewSelection).toBe('NO');
  });

  it('2. scrolls cards down and wraps up on idle dossier', async () => {
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A, CARD_B], 'DEMO'));
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    expect(ctrl.getState().selectedCardIndex).toBe(1);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    expect(ctrl.getState().selectedCardIndex).toBe(0);
    await ctrl.handleEvent({ kind: 'SCROLL_UP' });
    expect(ctrl.getState().selectedCardIndex).toBe(1);
  });

  it('3. root DOUBLE_CLICK calls onRequestShutdown (shutDownPageContainer(1))', async () => {
    const onRequestShutdown = vi.fn();
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onRequestShutdown });
    await ctrl.handleEvent({ kind: 'DOUBLE_CLICK' });
    expect(onRequestShutdown).toHaveBeenCalledTimes(1);
  });

  it('4. tap on card enters detail and double-tap returns to idle', async () => {
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'));
    await ctrl.handleEvent({ kind: 'CLICK' });
    expect(ctrl.getState().phase).toBe('detail');
    await ctrl.handleEvent({ kind: 'DOUBLE_CLICK' });
    expect(ctrl.getState().phase).toBe('idle');
  });

  it('5. selecting detail action stages preview defaulting strictly to NO', async () => {
    const onStageAction = vi.fn().mockResolvedValue(PREVIEW);
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onStageAction });
    await ctrl.handleEvent({ kind: 'CLICK' }); // detail
    await ctrl.handleEvent({ kind: 'CLICK' }); // stage action 0
    expect(ctrl.getState().phase).toBe('preview');
    expect(ctrl.getState().previewSelection).toBe('NO');
  });

  it('6. tapping on Default-NO cancels with ZERO writes', async () => {
    const onCommitPreview = vi.fn();
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onCommitPreview });
    ctrl.stagePreview(PREVIEW);
    await ctrl.handleEvent({ kind: 'CLICK' });
    expect(ctrl.getState().phase).toBe('undone');
    expect(onCommitPreview).not.toHaveBeenCalled();
  });

  it('7. swiping from NO to YES and tapping arms 2.0s ring', async () => {
    let clock = 1000;
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), {}, () => clock);
    ctrl.stagePreview(PREVIEW);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    expect(ctrl.getState().previewSelection).toBe('YES');
    await ctrl.handleEvent({ kind: 'CLICK' });
    expect(ctrl.getState().phase).toBe('armed');
    expect(ctrl.getState().armRemainingMs).toBe(2000);
    ctrl.destroy();
  });

  it('8. tapping at 1.9s while armed disarms immediately with ZERO commits', async () => {
    let clock = 1000;
    const onCommitPreview = vi.fn().mockResolvedValue(RECEIPT);
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onCommitPreview }, () => clock);
    ctrl.stagePreview(PREVIEW);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    await ctrl.handleEvent({ kind: 'CLICK' }); // armed at 1000
    clock = 2900; // 1.9s elapsed
    ctrl.tickArm(clock);
    expect(ctrl.getState().phase).toBe('armed');
    await ctrl.handleEvent({ kind: 'CLICK' });
    expect(ctrl.getState().phase).toBe('undone');
    expect(onCommitPreview).not.toHaveBeenCalled();
  });

  it('9. boundary tap at 0.0s while committing locks input and fires at most ONE commit', async () => {
    let clock = 1000;
    let resolveCommit!: (r: CommitReceipt) => void;
    const onCommitPreview = vi.fn(
      () => new Promise<CommitReceipt>((res) => { resolveCommit = res; }),
    );
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onCommitPreview }, () => clock);
    ctrl.stagePreview(PREVIEW);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    await ctrl.handleEvent({ kind: 'CLICK' });
    clock = 3000; // 2.0s elapsed
    ctrl.tickArm(clock);
    expect(ctrl.getState().phase).toBe('committing');

    // Rapid frantic taps right at 0.0s must be ignored
    await ctrl.handleEvent({ kind: 'CLICK' });
    await ctrl.handleEvent({ kind: 'DOUBLE_CLICK' });
    expect(onCommitPreview).toHaveBeenCalledTimes(1);

    resolveCommit(RECEIPT);
    await Promise.resolve();
    await Promise.resolve();
    expect(ctrl.getState().phase).toBe('done');
  });

  it('10. FOREGROUND_EXIT while armed disarms immediately without committing', async () => {
    const onCommitPreview = vi.fn();
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onCommitPreview });
    ctrl.stagePreview(PREVIEW);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    await ctrl.handleEvent({ kind: 'CLICK' });
    expect(ctrl.getState().phase).toBe('armed');
    await ctrl.handleEvent({ kind: 'FOREGROUND_EXIT' });
    expect(ctrl.getState().phase).toBe('undone');
    expect(onCommitPreview).not.toHaveBeenCalled();
  });

  it('11. FOREGROUND_ENTER refreshes dossier without triggering tap', async () => {
    const onRefreshCorridor = vi.fn().mockResolvedValue({
      cards: [CARD_B],
      sourceMode: 'LIVE',
      provenanceLabel: 'GCAL+GMAIL',
      syncedAtIso: '2026-11-24T13:51:00.000Z',
    });
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onRefreshCorridor });
    await ctrl.handleEvent({ kind: 'FOREGROUND_ENTER' });
    expect(ctrl.getState().phase).toBe('idle');
    expect(ctrl.getState().sourceMode).toBe('LIVE');
    expect(ctrl.getState().cards[0].id).toBe('c2');
  });

  it('12. FOREGROUND_ENTER failure switches gracefully to STALE preserving cached cards', async () => {
    const onRefreshCorridor = vi.fn().mockRejectedValue(new Error('offline'));
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'LIVE'), { onRefreshCorridor });
    await ctrl.handleEvent({ kind: 'FOREGROUND_ENTER' });
    expect(ctrl.getState().phase).toBe('stale');
    expect(ctrl.getState().sourceMode).toBe('STALE');
    expect(ctrl.getState().cards).toHaveLength(1);
  });

  it('13. LONG_PRESS opens listening and LONG_PRESS_RELEASE triggers stopVoice', async () => {
    const onStartVoice = vi.fn();
    const onStopVoice = vi.fn().mockResolvedValue(undefined);
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onStartVoice, onStopVoice });
    await ctrl.handleEvent({ kind: 'LONG_PRESS' });
    expect(ctrl.getState().phase).toBe('listening');
    expect(onStartVoice).toHaveBeenCalledTimes(1);
    await ctrl.handleEvent({ kind: 'LONG_PRESS_RELEASE' });
    expect(onStopVoice).toHaveBeenCalledTimes(1);
  });

  it('14. conflict lock returned from commit transitions to conflict screen', async () => {
    let clock = 1000;
    const onCommitPreview = vi.fn().mockResolvedValue({
      code: 'CONFLICT_CALENDAR_BUSY',
      message: '14:15 busy',
      nextFreeStartIso: '2026-11-24T14:45:00.000Z',
      nextFreeEndIso: '2026-11-24T15:15:00.000Z',
      nextFreeLabel: '14:45 (30m)',
    });
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onCommitPreview }, () => clock);
    ctrl.stagePreview(PREVIEW);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    await ctrl.handleEvent({ kind: 'CLICK' });
    clock = 3000;
    ctrl.tickArm(clock);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctrl.getState().phase).toBe('conflict');
    expect(ctrl.getState().conflict?.nextFreeLabel).toBe('14:45 (30m)');
  });

  it('15. tapping on conflict screen stages suggested next free slot', async () => {
    const onStageSlot = vi.fn().mockResolvedValue(PREVIEW);
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onStageSlot });
    ctrl.showConflict({
      code: 'CONFLICT_CALENDAR_BUSY',
      message: '14:15 busy',
      nextFreeStartIso: '2026-11-24T14:45:00.000Z',
      nextFreeEndIso: '2026-11-24T15:15:00.000Z',
      nextFreeLabel: '14:45 (30m)',
    });
    await ctrl.handleEvent({ kind: 'CLICK' });
    expect(onStageSlot).toHaveBeenCalledWith('2026-11-24T14:45:00.000Z', '2026-11-24T15:15:00.000Z');
    expect(ctrl.getState().phase).toBe('preview');
  });

  it('16. tapping done screen with reversible receipt triggers surgical undo', async () => {
    let clock = 1000;
    const onCommitPreview = vi.fn().mockResolvedValue(RECEIPT);
    const onUndoReceipt = vi.fn().mockResolvedValue({ ...RECEIPT, status: 'UNDONE', canUndo: false });
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onCommitPreview, onUndoReceipt }, () => clock);
    ctrl.stagePreview(PREVIEW);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    await ctrl.handleEvent({ kind: 'CLICK' });
    clock = 3000;
    ctrl.tickArm(clock);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctrl.getState().phase).toBe('done');
    await ctrl.handleEvent({ kind: 'CLICK' });
    expect(onUndoReceipt).toHaveBeenCalledTimes(1);
    expect(ctrl.getState().phase).toBe('undone');
  });

  it('17. commit error transitions cleanly to error state without crashing', async () => {
    let clock = 1000;
    const onCommitPreview = vi.fn().mockRejectedValue(new Error('HTTP 504 SEND_UNKNOWN'));
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'), { onCommitPreview }, () => clock);
    ctrl.stagePreview(PREVIEW);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    await ctrl.handleEvent({ kind: 'CLICK' });
    clock = 3000;
    ctrl.tickArm(clock);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctrl.getState().phase).toBe('error');
    expect(ctrl.getState().errorMessage).toContain('SEND_UNKNOWN');
  });

  it('18. double-tap on preview ALWAYS cancels without arming even when YES is highlighted', async () => {
    const ctrl = new OnCueHudController(createInitialHudState([CARD_A], 'DEMO'));
    ctrl.stagePreview(PREVIEW);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    expect(ctrl.getState().previewSelection).toBe('YES');
    await ctrl.handleEvent({ kind: 'DOUBLE_CLICK' });
    expect(ctrl.getState().phase).toBe('undone');
  });
});
