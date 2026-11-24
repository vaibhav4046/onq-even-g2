import { describe, expect, it } from 'vitest';
import { parseIcsEvents } from '../src/index.js';

const SAMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:evt-101@onq.test',
  'DTSTART:20261124T140000Z',
  'DTEND:20261124T143000Z',
  'SUMMARY:VC Sync with Priya Nair',
  'ATTENDEE;CN="Priya Nair":mailto:priya@tvm.example',
  'DESCRIPTION:Agenda and deck at https://docs.google.com/document/d/abc123',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-102@onq.test',
  'DTSTART;TZID=Europe/London:20261124T151500',
  'SUMMARY:Folded Line',
  '  Partner Review',
  'ATTENDEE;CN=Alex Chen:mailto:alex@partner.example',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-old@onq.test',
  'DTSTART:20261124T080000Z',
  'DTEND:20261124T083000Z',
  'SUMMARY:Morning Standup',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('icsParser.ts', () => {
  it('1. parses UTC VEVENTs, attendees, and linked Google Doc URLs', () => {
    const events = parseIcsEvents(SAMPLE_ICS);
    expect(events).toHaveLength(3);
    expect(events[1].uid).toBe('evt-101@onq.test');
    expect(events[1].summary).toBe('VC Sync with Priya Nair');
    expect(events[1].startIso).toBe('2026-11-24T14:00:00.000Z');
    expect(events[1].attendeeEmail).toBe('priya@tvm.example');
    expect(events[1].attendeeName).toBe('Priya Nair');
    expect(events[1].driveDocUrl).toContain('docs.google.com');
  });

  it('2. unfolds RFC 5545 continuation lines and parses TZID timestamps', () => {
    const events = parseIcsEvents(SAMPLE_ICS);
    const partner = events.find((e) => e.uid === 'evt-102@onq.test');
    expect(partner?.summary).toBe('Folded Line Partner Review');
    expect(partner?.startIso).toBe('2026-11-24T15:15:00.000Z');
    // Defaults endIso to +30m when DTEND omitted
    expect(partner?.endIso).toBe('2026-11-24T15:45:00.000Z');
  });

  it('3. filters past events older than 30m when nowIso is supplied', () => {
    const events = parseIcsEvents(SAMPLE_ICS, '2026-11-24T13:45:00.000Z');
    expect(events.map((e) => e.uid)).toEqual(['evt-101@onq.test', 'evt-102@onq.test']);
  });

  it('4. parses all-day YYYYMMDD dates cleanly', () => {
    const ics = 'BEGIN:VEVENT\nUID:allday\nDTSTART:20261125\nSUMMARY:Demo Day Prep\nEND:VEVENT';
    const events = parseIcsEvents(ics);
    expect(events[0].startIso).toBe('2026-11-25T09:00:00.000Z');
  });

  it('5. unescapes commas, semicolons, and escaped newlines in text fields', () => {
    const ics = 'BEGIN:VEVENT\nUID:esc\nDTSTART:20261124T160000Z\nSUMMARY:Budget\\, Q4\\; Review\nEND:VEVENT';
    const events = parseIcsEvents(ics);
    expect(events[0].summary).toBe('Budget, Q4; Review');
  });

  it('6. handles empty or malformed ICS gracefully without throwing', () => {
    expect(parseIcsEvents('')).toEqual([]);
    expect(parseIcsEvents('NOT AN ICS FILE')).toEqual([]);
  });

  it('7. ignores incomplete VEVENT missing SUMMARY or DTSTART', () => {
    const ics = 'BEGIN:VEVENT\nUID:bad1\nSUMMARY:No Start\nEND:VEVENT';
    expect(parseIcsEvents(ics)).toEqual([]);
  });

  it('8. sorts returned events chronologically by startIso', () => {
    const ics = [
      'BEGIN:VEVENT\nUID:later\nDTSTART:20261124T180000Z\nSUMMARY:Later\nEND:VEVENT',
      'BEGIN:VEVENT\nUID:earlier\nDTSTART:20261124T120000Z\nSUMMARY:Earlier\nEND:VEVENT',
    ].join('\n');
    const events = parseIcsEvents(ics);
    expect(events.map((e) => e.uid)).toEqual(['earlier', 'later']);
  });
});
