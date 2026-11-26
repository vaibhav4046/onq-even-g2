import { describe, expect, it } from 'vitest';
import {
  canVoiceConfirmWrite,
  createInitialHudState,
  extractMeetingArtifacts,
  formatLensFrame,
  mapSpeakerToAttendee,
  MeetingTranscriptBuffer,
  OnQHudController,
  parseWakeCommand,
} from '../src/index.js';
import type { ActionPreview, CorridorCard, MeetingTurn } from '../src/index.js';

const CARD_MEETING: CorridorCard = {
  id: 'card-1',
  sourceMode: 'DEMO',
  syncedAtIso: '2026-11-24T13:48:00.000Z',
  provenanceLabel: 'DEMO · SAMPLE',
  kind: 'MEETING',
  title: 'Investor call',
  timeMeta: '14:00 (12m)',
  contextLine1: 'Can we push 15m? Q4 deck ready?',
  contextLine2: 'Q4_Metrics_v3 | 2 comments',
  triageRule: 'IMMINENT_MTG',
  etag: 'etag-1',
  quickActions: [
    { id: 'q1', label: 'Push 15m + Reply', intent: 'RESCHEDULE_AND_NOTIFY', commandText: 'Push 15m and tell Investor' },
  ],
};

const WRAP_PREVIEW: ActionPreview = {
  previewToken: 'wrap-tok-1',
  idempotencyKey: 'wrap-idem-1',
  expiresAtIso: '2026-11-24T14:50:00.000Z',
  intent: 'CREATE_ACTION_PACK',
  defaultSelection: 'NO',
  summaryLines: [
    '1) NOTION: Send Q4 metrics deck',
    '2) GCAL: Follow-up 17:00 (30m)',
    '3) MAIL: Draft Investor contact',
  ],
  operations: [
    { provider: 'NOTION', op: 'CREATE_TASK', targetLabel: 'Meeting Notes', afterValue: 'Send Q4 metrics deck' },
  ],
  safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
};

describe('meetingLifecycle.ts (Before / During / After)', () => {
  it('1. parses primary wake phrase "OnQ, start meeting notes"', () => {
    const parsed = parseWakeCommand('OnQ, start meeting notes');
    expect(parsed.wakeMatched).toBe(true);
    expect(parsed.wakeWord).toBe('onq');
    expect(parsed.kind).toBe('START_SCRIBE');
  });

  it('2. parses fallback alias "Cue, wrap up" cleanly', () => {
    const parsed = parseWakeCommand('Hey Cue: wrap up');
    expect(parsed.wakeMatched).toBe(true);
    expect(parsed.wakeWord).toBe('cue');
    expect(parsed.kind).toBe('WRAP_UP');
  });

  it('3. distinguishes confirm, cancel, question, and action commands', () => {
    expect(parseWakeCommand('OnQ, confirm action').kind).toBe('CONFIRM');
    expect(parseWakeCommand('Cancel').kind).toBe('CANCEL');
    expect(parseWakeCommand('What did Investor decide?').kind).toBe('ASK');
    expect(parseWakeCommand('Push 15m and tell Investor').kind).toBe('ACTION');
  });

  it('4. maps <1s PENDING speaker label safely without fabricating identity', () => {
    const mapped = mapSpeakerToAttendee('PENDING', ['Investor contact', 'Partner contact']);
    expect(mapped.attendeeName).toBe('Speaker...');
    expect(mapped.isWearer).toBe(false);
    expect(mapped.shortCode).toBe('S?');
  });

  it('5. maps wearer Speaker A vs attendees Speaker B and Speaker C', () => {
    const s1 = mapSpeakerToAttendee('Speaker A', ['Investor contact', 'Partner contact']);
    const s2 = mapSpeakerToAttendee('Speaker B', ['Investor contact', 'Partner contact']);
    const s3 = mapSpeakerToAttendee('Speaker C', ['Investor contact', 'Partner contact']);
    expect(s1).toEqual({ attendeeName: 'You', isWearer: true, shortCode: 'S1' });
    expect(s2).toEqual({ attendeeName: 'Investor', isWearer: false, shortCode: 'S2' });
    expect(s3).toEqual({ attendeeName: 'Partner', isWearer: false, shortCode: 'S3' });
  });

  it('6. voice confirmation guard blocks silent audio and non-wearer speakers', () => {
    const lowRms = canVoiceConfirmWrite({
      transcript: 'OnQ confirm action',
      rms: 0.004,
      isWearer: true,
      speakerLabel: 'Speaker A',
    });
    expect(lowRms).toEqual({ allowed: false, reason: 'RMS_BELOW_THRESHOLD' });

    const intruder = canVoiceConfirmWrite({
      transcript: 'OnQ confirm action',
      rms: 0.08,
      isWearer: false,
      speakerLabel: 'Speaker B',
    });
    expect(intruder).toEqual({ allowed: false, reason: 'NON_WEARER_SPEAKER_Speaker B' });

    const valid = canVoiceConfirmWrite({
      transcript: 'OnQ, confirm action',
      rms: 0.06,
      isWearer: true,
      speakerLabel: 'Speaker A',
    });
    expect(valid).toEqual({ allowed: true });
  });

  it('7. extracts decisions and chrono-node deadlines only from finalized turns', () => {
    const turns: MeetingTurn[] = [
      {
        id: 't0',
        speakerLabel: 'Speaker B',
        attendeeName: 'Investor',
        text: 'Agreed: partial thought',
        atIso: '2026-11-24T14:01:00.000Z',
        isWearer: false,
        isFinal: false,
      },
      {
        id: 't1',
        speakerLabel: 'Speaker A',
        attendeeName: 'You',
        text: 'Agreed: lock Q4 beta launch for Thursday.',
        atIso: '2026-11-24T14:02:00.000Z',
        isWearer: true,
        isFinal: true,
      },
      {
        id: 't2',
        speakerLabel: 'Speaker B',
        attendeeName: 'Investor',
        text: 'Action: send Q4 metrics deck to Partner by Thursday 15:00.',
        atIso: '2026-11-24T14:03:00.000Z',
        isWearer: false,
        isFinal: true,
      },
    ];
    const { decisions, actions } = extractMeetingArtifacts(turns, new Date('2026-11-24T14:00:00.000Z'));
    expect(decisions).toHaveLength(1);
    expect(decisions[0].speaker).toBe('You');
    expect(actions).toHaveLength(1);
    expect(actions[0].owner).toBe('Investor');
    expect(actions[0].dueIso).toBeDefined();
  });

  it('8. RAM-only MeetingTranscriptBuffer updates partial turns in place and wipes completely', () => {
    const buf = new MeetingTranscriptBuffer(10);
    buf.start({
      providerMode: 'DEMO_SANDBOX',
      attendees: ['Investor contact', 'Partner contact'],
      startedAtIso: '2026-11-24T14:00:00.000Z',
    });
    buf.pushTurn({ speakerLabel: 'Speaker B', text: 'Send Q4', isFinal: false, atIso: '2026-11-24T14:01:00.000Z' });
    let st = buf.pushTurn({ speakerLabel: 'Speaker B', text: 'Send Q4 deck by Friday.', isFinal: true, atIso: '2026-11-24T14:01:05.000Z' });
    expect(st.turns).toHaveLength(1);
    expect(st.actions).toHaveLength(1);

    buf.wipe();
    st = buf.getState();
    expect(st.active).toBe(false);
    expect(st.turns).toHaveLength(0);
    expect(st.decisions).toHaveLength(0);
    expect(st.actions).toHaveLength(0);
  });

  it('9. formatLensFrame keeps meeting_live within 42 columns and 999 UTF-8 bytes', () => {
    const buf = new MeetingTranscriptBuffer();
    const meeting = buf.start({
      providerMode: 'LIVE_ASSEMBLYAI',
      attendees: ['Investor contact', 'Partner contact'],
      startedAtIso: '2026-11-24T14:00:00.000Z',
    });
    buf.pushTurn({
      speakerLabel: 'Speaker B',
      text: 'Agreed: approve Q4 rollout and send final metrics deck to Partner by Thursday morning.',
      isFinal: true,
      atIso: '2026-11-24T14:02:00.000Z',
    });

    const state = createInitialHudState([CARD_MEETING], 'DEMO');
    state.phase = 'meeting_live';
    state.meeting = { ...meeting, ...buf.getState(Date.parse('2026-11-24T14:03:00.000Z')) };

    const frame = formatLensFrame(state);
    expect(frame.utf8Bytes).toBeLessThanOrEqual(999);
    for (const line of frame.lines) {
      expect(line.length).toBeLessThanOrEqual(42);
    }
  });

  it('10. formatLensFrame renders wrap_up safely inside optical character budget', () => {
    const state = createInitialHudState([CARD_MEETING], 'DEMO');
    state.phase = 'wrap_up';
    state.preview = WRAP_PREVIEW;
    state.previewSelection = 'NO';
    const frame = formatLensFrame(state);
    expect(frame.utf8Bytes).toBeLessThanOrEqual(999);
    for (const line of frame.lines) {
      expect(line.length).toBeLessThanOrEqual(42);
    }
  });

  it('11. OnQHudController transitions to meeting_live and back to corridor on wipe', () => {
    const ctrl = new OnQHudController(createInitialHudState([CARD_MEETING], 'DEMO'));
    const buf = new MeetingTranscriptBuffer();
    const meeting = buf.start({ providerMode: 'DEMO_SANDBOX', attendees: ['Investor contact'] });
    ctrl.setMeetingSession(meeting);
    expect(ctrl.getState().phase).toBe('meeting_live');

    ctrl.setMeetingSession(null);
    expect(ctrl.getState().phase).toBe('idle');
  });

  it('12. OnQHudController stages wrap_up preview with strict Default-NO selection', () => {
    const ctrl = new OnQHudController(createInitialHudState([CARD_MEETING], 'DEMO'));
    ctrl.stagePreview(WRAP_PREVIEW, true);
    const st = ctrl.getState();
    expect(st.phase).toBe('wrap_up');
    expect(st.previewSelection).toBe('NO');
  });
});
