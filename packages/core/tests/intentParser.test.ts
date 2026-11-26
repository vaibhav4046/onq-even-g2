import { describe, expect, it } from 'vitest';
import { parseVoiceCommand } from '../src/index.js';
import type { CorridorCard } from '../src/index.js';

const NOW = new Date('2026-11-24T13:45:00.000Z');

const CARDS: CorridorCard[] = [
  {
    id: 'c-investor',
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
  },
  {
    id: 'c-studio',
    sourceMode: 'DEMO',
    syncedAtIso: NOW.toISOString(),
    provenanceLabel: 'SAMPLE',
    kind: 'EMAIL_ASK',
    title: 'Design review',
    timeMeta: '14:15',
    startIso: '2026-11-24T14:15:00.000Z',
    endIso: '2026-11-24T14:45:00.000Z',
    contextLine1: 'Send Q4 metrics',
    contextLine2: 'Notion task due',
    triageRule: 'ASK_DEADLINE',
    etag: 'e2',
    attendeeName: 'Finance lead',
    attendeeEmail: 'finance@sample.example',
    quickActions: [],
  },
  {
    id: 'c-ops',
    sourceMode: 'DEMO',
    syncedAtIso: NOW.toISOString(),
    provenanceLabel: 'SAMPLE',
    kind: 'NOTION_DUE',
    title: 'Budget sync',
    timeMeta: '16:00',
    startIso: '2026-11-24T16:00:00.000Z',
    endIso: '2026-11-24T16:30:00.000Z',
    contextLine1: 'Budget review',
    contextLine2: 'Notion item',
    triageRule: 'NOTION_OVERDUE',
    etag: 'e3',
    attendeeName: 'Finance ops lead',
    attendeeEmail: 'financeops@sample.example',
    quickActions: [],
  },
];

describe('intentParser.ts (30-phrase voice evaluation matrix)', () => {
  const rescheduleCases = [
    'Push 15m and tell Investor',
    'Push 15 minutes and tell Investor',
    'Shift VC sync by 30 mins',
    'Delay 10m and email Investor',
    'Running 15 minutes late, tell Investor',
    'Running late',
    'Move VC sync to Thursday 3pm',
    'Reschedule Investor meeting to tomorrow 2pm',
  ];

  rescheduleCases.forEach((phrase, i) => {
    it(`R-${i + 1}: parses reschedule "${phrase}"`, () => {
      const res = parseVoiceCommand(phrase, { now: NOW, cards: CARDS, activeCard: CARDS[0] });
      expect(res.kind).toBe('RESCHEDULE_AND_NOTIFY');
      expect(res.targetStartIso).toBeTruthy();
    });
  });

  const actionPackCases = [
    'Task: send Q4 metrics to Partner by Thursday',
    'Todo: review term sheet tomorrow 10am',
    'Remind me to share deck with Investor Friday 9am',
    'Action: follow up with legal next Monday',
    'Add task update Notion roadmap today 5pm',
    'Capture follow up on hardware specs',
  ];

  actionPackCases.forEach((phrase, i) => {
    it(`A-${i + 1}: parses action pack "${phrase}"`, () => {
      const res = parseVoiceCommand(phrase, { now: NOW, cards: CARDS, activeCard: CARDS[0] });
      expect(res.kind).toBe('CREATE_ACTION_PACK');
      expect(res.taskTitle).toBeTruthy();
    });
  });

  const replyCases = [
    'Reply sounds good, see you at 14:15',
    'Draft reply to Investor yes deck is ready',
    'Email Investor running five behind',
    'Tell Investor yes 14:15 works',
  ];

  replyCases.forEach((phrase, i) => {
    it(`E-${i + 1}: parses email reply "${phrase}"`, () => {
      const res = parseVoiceCommand(phrase, { now: NOW, cards: CARDS, activeCard: CARDS[0] });
      expect(res.kind).toBe('REPLY_EMAIL');
      expect(res.matchedCardId).toBe('c-investor');
    });
  });

  const notionCompleteCases = [
    'Mark Q4 deck done',
    'Complete Notion task send metrics',
    'Finish todo item now',
    'Check off Notion item',
  ];

  notionCompleteCases.forEach((phrase, i) => {
    it(`N-${i + 1}: parses Notion completion "${phrase}"`, () => {
      const res = parseVoiceCommand(phrase, { now: NOW, cards: CARDS, activeCard: CARDS[0] });
      expect(res.kind).toBe('COMPLETE_NOTION_TASK');
    });
  });

  const askCases = [
    'What did Investor ask?',
    'Summarize Drive doc',
    'Read latest note from Investor',
    'What is next on my calendar?',
  ];

  askCases.forEach((phrase, i) => {
    it(`Q-${i + 1}: parses read-only query "${phrase}"`, () => {
      const res = parseVoiceCommand(phrase, { now: NOW, cards: CARDS, activeCard: CARDS[0] });
      expect(res.kind).toBe('ASK_NOTES');
    });
  });

  it('returns AMBIGUOUS when two contacts match "Finance"', () => {
    const res = parseVoiceCommand('Reply to Finance yes', { now: NOW, cards: CARDS, activeCard: CARDS[0] });
    expect(res.kind).toBe('AMBIGUOUS');
    expect(res.ambiguousMatches?.length).toBe(2);
  });

  it('returns UNKNOWN for empty or unintelligible noise transcripts', () => {
    expect(parseVoiceCommand('', { now: NOW, cards: CARDS }).kind).toBe('UNKNOWN');
    expect(parseVoiceCommand('uh', { now: NOW, cards: CARDS }).kind).toBe('UNKNOWN');
    expect(parseVoiceCommand('banana helicopter cloud', { now: NOW, cards: CARDS }).kind).toBe('UNKNOWN');
  });

  it('computes exact deterministic ISO timestamp for +15m shift', () => {
    const res = parseVoiceCommand('Push 15m and tell Investor', { now: NOW, cards: CARDS, activeCard: CARDS[0] });
    expect(res.targetStartIso).toBe('2026-11-24T14:15:00.000Z');
  });

  it('classifies Telegram, Project Planning, and Computer Delegation commands from glasses', () => {
    const tg = parseVoiceCommand('Reply on Telegram: running 5m late', { now: NOW, cards: CARDS });
    expect(tg.kind).toBe('TELEGRAM_ACTION');
    expect(tg.replyMessage).toBe('running 5m late');

    const plan = parseVoiceCommand('Plan a project roadmap for OnQ Even G2', { now: NOW, cards: CARDS });
    expect(plan.kind).toBe('PLAN_PROJECT');

    const comp = parseVoiceCommand('Check git status and open GitHub PRs', { now: NOW, cards: CARDS });
    expect(comp.kind).toBe('DELEGATE_COMPUTER_TASK');
  });
});
