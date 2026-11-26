import { describe, expect, it, vi } from 'vitest';
import { createInitialHudState, formatLensFrame, G2_MAX_COLS, G2_MAX_LINES, OnQHudController } from '../src/index.js';
import type { ActionPreview, CommitReceipt, CorridorCard } from '../src/index.js';

const CARD: CorridorCard = {
  id: 'c1',
  sourceMode: 'LIVE',
  syncedAtIso: '2026-11-24T13:48:00.000Z',
  provenanceLabel: 'GCAL',
  kind: 'MEETING',
  title: 'Investor call',
  timeMeta: '14:00 (12m)',
  contextLine1: 'Can we push 15m?',
  contextLine2: 'Q4_Metrics_v3',
  triageRule: 'IMMINENT_MTG',
  etag: 'e1',
  quickActions: [],
};
const PREVIEW: ActionPreview = {
  previewToken: 'tok-1',
  idempotencyKey: 'idem-1',
  expiresAtIso: '2099-11-24T13:50:00.000Z',
  intent: 'RESCHEDULE_AND_NOTIFY',
  defaultSelection: 'NO',
  summaryLines: ['1) GCAL: 14:00 -> 14:15'],
  operations: [{ provider: 'GCAL', op: 'MOVE_EVENT', targetLabel: 'VC Sync', afterValue: '14:15' }],
  safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
};
const QUEUED: CommitReceipt = {
  receiptId: 'OBX-1a2b3c4d5e',
  idempotencyKey: 'idem-1',
  committedAtIso: '2026-11-24T13:49:00.000Z',
  status: 'QUEUED',
  sourceMode: 'LIVE',
  summaryLines: ['1) GCAL: 14:00 -> 14:15'],
  operations: [],
  canUndo: true,
  outbox: { id: 'ob_1a2b3c4d5e', status: 'queued' },
};
const PLAIN: CommitReceipt = { ...QUEUED, receiptId: 'rec-1042', status: 'COMMITTED', summaryLines: ['OK GCAL: 14:00 -> 14:15'], outbox: undefined };

/** Drives the real arm ring to a result card, with the server answering `receipt`. */
async function committed(receipt: CommitReceipt) {
  let clock = 1000;
  const onCommitPreview = vi.fn().mockResolvedValue(receipt);
  const ctrl = new OnQHudController(createInitialHudState([CARD], 'LIVE'), { onCommitPreview }, () => clock);
  ctrl.stagePreview(PREVIEW);
  await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
  await ctrl.handleEvent({ kind: 'CLICK' }); // armed: the 2.0 s ring is unchanged
  clock = 3000;
  ctrl.tickArm(clock);
  await new Promise((r) => setTimeout(r, 0));
  ctrl.destroy();
  return { ctrl, onCommitPreview };
}

const header = (c: OnQHudController) => formatLensFrame(c.getState()).lines[0];
const within = (c: OnQHudController) => {
  const f = formatLensFrame(c.getState());
  expect(f.lines.length).toBeLessThanOrEqual(G2_MAX_LINES);
  for (const l of f.lines) expect(l.length).toBeLessThanOrEqual(G2_MAX_COLS);
  expect(f.utf8Bytes).toBeLessThanOrEqual(999);
  return f;
};

describe('outbox progress on the existing result card', () => {
  it('the default path is unchanged: COMMITTED with the usual undo footer', async () => {
    const { ctrl } = await committed(PLAIN);
    expect(ctrl.getState().phase).toBe('done');
    expect(header(ctrl)).toContain('COMMITTED #1042');
    expect(within(ctrl).lines.at(-1)).toBe('TAP: UNDO (30s) 2xTAP: DOSSIER'); // the existing footer, collapsed by the ASCII sanitizer
  });

  it('shows QUEUED, then SENDING, then DONE with the real receipt lines, all inside 7x42', async () => {
    const { ctrl } = await committed(QUEUED);
    expect(ctrl.getState().phase).toBe('done');
    expect(header(ctrl)).toContain('QUEUED #');
    expect(within(ctrl).lines.at(-1)).toContain('CANCEL (QUEUED)'); // a queued write can still be cancelled

    ctrl.updateOutbox({ id: 'ob_1a2b3c4d5e', status: 'running' });
    expect(header(ctrl)).toContain('SENDING #');
    expect(ctrl.getState().receipt?.canUndo).toBe(false); // sending: too late to cancel
    expect(within(ctrl).lines.at(-1)).toBe('TAP: DOSSIER 2xTAP: BACK');

    ctrl.updateOutbox({ id: 'ob_1a2b3c4d5e', status: 'done', summaryLines: ['OK GCAL: 14:00 -> 14:15 via your Chrome'], canUndo: false, receiptId: 'BRW-ab12' });
    expect(header(ctrl)).toContain('DONE #ab12');
    expect(within(ctrl).lines.join('\n')).toContain('via your Chrome');
  });

  it('failed shows the reason line and says nothing was confirmed', async () => {
    const { ctrl } = await committed(QUEUED);
    ctrl.updateOutbox({ id: 'ob_1a2b3c4d5e', status: 'failed', reason: 'Calendar page did not load, Chrome was closed while sending it' });
    const f = within(ctrl);
    expect(f.lines[0]).toContain('FAILED #');
    expect(f.lines.join('\n')).toContain('Calendar page did not load');
    expect(f.lines.join('\n')).toContain('NOTHING WAS CONFIRMED AS SENT');
  });

  it('ignores updates for another write, and a failure while idle becomes a one-line notice', async () => {
    const { ctrl } = await committed(QUEUED);
    ctrl.updateOutbox({ id: 'ob_other', status: 'done' });
    expect(header(ctrl)).toContain('QUEUED #');

    const idle = new OnQHudController(createInitialHudState([CARD], 'LIVE'));
    idle.updateOutbox({ id: 'ob_x', status: 'running' });
    expect(idle.getState().phase).toBe('idle');
    idle.updateOutbox({ id: 'ob_x', status: 'failed', reason: 'Google said no' });
    expect(idle.getState().phase).toBe('error');
    expect(within(idle).lines.join('\n')).toContain('Google said no');
  });

  it('tapping the queued card cancels it through the existing undo hook', async () => {
    let clock = 1000;
    const onUndoReceipt = vi.fn().mockResolvedValue({ ...QUEUED, status: 'UNDONE', canUndo: false });
    const ctrl = new OnQHudController(createInitialHudState([CARD], 'LIVE'), { onCommitPreview: vi.fn().mockResolvedValue(QUEUED), onUndoReceipt }, () => clock);
    ctrl.stagePreview(PREVIEW);
    await ctrl.handleEvent({ kind: 'SCROLL_DOWN' });
    await ctrl.handleEvent({ kind: 'CLICK' });
    clock = 3000;
    ctrl.tickArm(clock);
    await new Promise((r) => setTimeout(r, 0));
    await ctrl.handleEvent({ kind: 'CLICK' });
    expect(onUndoReceipt).toHaveBeenCalledTimes(1);
    expect(ctrl.getState().phase).toBe('undone');
    ctrl.destroy();
  });
});
