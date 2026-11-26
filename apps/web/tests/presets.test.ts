import { describe, expect, it } from 'vitest';
import { parseVoiceCommand } from '@onq/core';
import type { CorridorCard } from '@onq/core';

const NOW = new Date('2026-11-24T13:45:00.000Z');
const CARD: CorridorCard = {
  id: 'card-vc-priya',
  sourceMode: 'DEMO',
  syncedAtIso: NOW.toISOString(),
  provenanceLabel: 'SAMPLE',
  kind: 'MEETING',
  title: 'Investor call',
  timeMeta: '14:00 (15m)',
  startIso: '2026-11-24T14:00:00.000Z',
  endIso: '2026-11-24T14:30:00.000Z',
  contextLine1: 'Can we push 15m?',
  contextLine2: 'Q4_Metrics_v3',
  triageRule: 'IMMINENT_MTG',
  etag: 'e1',
  attendeeName: 'Investor contact',
  attendeeEmail: 'investor@sample.example',
  quickActions: [],
};

// The preset phrases the web UI sends (App.tsx, LandingStory, LiveVoiceStudio) must still parse to a write intent.
describe('web preset phrases', () => {
  it('Push 15m and tell Investor reschedules and notifies', () => {
    const res = parseVoiceCommand('Push 15m and tell Investor', { now: NOW, cards: [CARD], activeCard: CARD });
    expect(res.kind).toBe('RESCHEDULE_AND_NOTIFY');
    expect(res.targetStartIso).toBe('2026-11-24T14:15:00.000Z');
  });

  it('Move VC sync to 14:45 still targets a reschedule', () => {
    const res = parseVoiceCommand('Move VC sync to 14:45', { now: NOW, cards: [CARD], activeCard: CARD });
    expect(res.kind).toBe('RESCHEDULE_AND_NOTIFY');
  });

  it('What did Investor ask about Q4? is a read, not a write', () => {
    const res = parseVoiceCommand('What did Investor ask about Q4?', { now: NOW, cards: [CARD], activeCard: CARD });
    expect(res.kind).toBe('ASK_NOTES');
  });
});
