import * as chrono from 'chrono-node';
import type {
  MeetingActionItem,
  MeetingDecision,
  MeetingProviderMode,
  MeetingSessionState,
  MeetingTurn,
} from './types.js';

export type WakeCommandKind =
  | 'START_SCRIBE'
  | 'WRAP_UP'
  | 'CONFIRM'
  | 'CANCEL'
  | 'ASK'
  | 'ACTION';

export interface ParsedWakeCommand {
  wakeMatched: boolean;
  wakeWord?: 'onq' | 'cue';
  kind: WakeCommandKind;
  cleanedText: string;
}

const WAKE_RE = /^(?:hey\s+|ok\s+)?(onq|on\s+q|cue|on\s+cue)[,\s:]+(.+)$/i;

/**
 * Parses hands-free wake commands ("OnQ, ..." primary and "Cue, ..." fallback alias)
 * across CORRIDOR, MEETING_LIVE, and WRAP_UP lifecycle phases.
 */
export function parseWakeCommand(transcript: string): ParsedWakeCommand {
  const raw = (transcript ?? '').trim();
  const m = raw.match(WAKE_RE);
  const wakeMatched = Boolean(m);
  const wakeWord = m
    ? m[1].toLowerCase().includes('q')
      ? 'onq'
      : 'cue'
    : undefined;
  const body = (m ? m[2] : raw).trim();
  const lower = body.toLowerCase();

  if (/\b(start\s+(?:meeting\s+)?notes|start\s+scribe|listen\s+to\s+meeting)\b/.test(lower)) {
    return { wakeMatched, wakeWord, kind: 'START_SCRIBE', cleanedText: body };
  }
  if (/\b(wrap\s+up|end\s+(?:the\s+)?meeting|end\s+scribe|wrap\s+up\s+and\s+save)\b/.test(lower)) {
    return { wakeMatched, wakeWord, kind: 'WRAP_UP', cleanedText: body };
  }
  if (/^(?:confirm(?:\s+action)?|yes\s+confirm|approve\s+action)\b/.test(lower)) {
    return { wakeMatched, wakeWord, kind: 'CONFIRM', cleanedText: body };
  }
  if (/^(?:cancel|stop|abort|nevermind|never\s+mind|disarm)\b/.test(lower)) {
    return { wakeMatched, wakeWord, kind: 'CANCEL', cleanedText: body };
  }
  if (
    /^(?:what|who|when|where|why|how|check|summarize|read|did|any|is\s+my)\b/.test(lower) ||
    lower.endsWith('?')
  ) {
    return { wakeMatched, wakeWord, kind: 'ASK', cleanedText: body };
  }
  return { wakeMatched, wakeWord, kind: 'ACTION', cleanedText: body };
}

/**
 * Maps real-time STT-3.7 speaker labels (including <1s PENDING labels) to
 * known Google Calendar meeting attendees and identifies whether the speaker is the wearer.
 */
export function mapSpeakerToAttendee(
  speakerLabel: string | undefined,
  attendees: string[],
  wearerSpeakerLabel = 'Speaker A',
): { attendeeName: string; isWearer: boolean; shortCode: string } {
  const raw = (speakerLabel ?? '').trim();
  if (!raw || raw.toUpperCase() === 'PENDING') {
    return { attendeeName: 'Speaker...', isWearer: false, shortCode: 'S?' };
  }

  const normalized = raw.replace(/^Speaker\s*/i, '').trim().toUpperCase();
  const wearerNorm = wearerSpeakerLabel.replace(/^Speaker\s*/i, '').trim().toUpperCase();
  const isWearer = normalized === wearerNorm || normalized === 'A' || normalized === '0';

  if (isWearer) {
    return { attendeeName: 'You', isWearer: true, shortCode: 'S1' };
  }

  let idx = 0;
  if (/^\d+$/.test(normalized)) {
    idx = Math.max(0, Number(normalized) - 1);
  } else if (/^[B-Z]$/.test(normalized)) {
    idx = normalized.charCodeAt(0) - 'B'.charCodeAt(0);
  }

  const others = attendees.filter((a) => !/^you$/i.test(a.trim()));
  const mapped = others[idx] ?? `Attendee ${normalized || idx + 2}`;
  const firstName = mapped.split(/\s+/)[0] || mapped;
  return { attendeeName: firstName, isWearer: false, shortCode: `S${idx + 2}` };
}

/**
 * Security guard for voice-confirmed writes during WRAP_UP:
 * prevents a background meeting speaker from confirming a destructive write.
 */
export function canVoiceConfirmWrite(input: {
  transcript: string;
  rms: number;
  isWearer: boolean;
  speakerLabel?: string;
}): { allowed: boolean; reason?: string } {
  if (!input.rms || input.rms < 0.012) {
    return { allowed: false, reason: 'RMS_BELOW_THRESHOLD' };
  }
  if (!input.isWearer) {
    return {
      allowed: false,
      reason: `NON_WEARER_SPEAKER_${input.speakerLabel ?? 'UNKNOWN'}`,
    };
  }
  const parsed = parseWakeCommand(input.transcript);
  if (parsed.kind !== 'CONFIRM') {
    return { allowed: false, reason: 'CONFIRM_PHRASE_REQUIRED' };
  }
  return { allowed: true };
}

/**
 * Deterministic meeting intelligence extractor: extracts decisions and owner+due
 * action items per finalized turn using chrono-node (zero fabricated dates).
 */
export function extractMeetingArtifacts(
  turns: MeetingTurn[],
  referenceDate: Date = new Date(),
): { decisions: MeetingDecision[]; actions: MeetingActionItem[] } {
  const decisions: MeetingDecision[] = [];
  const actions: MeetingActionItem[] = [];

  for (const t of turns) {
    if (!t.isFinal) continue;
    const text = t.text.trim();
    const lower = text.toLowerCase();

    if (/\b(agreed|decided|decision|let us lock|let's lock|approved|confirmed|we will target)\b/.test(lower)) {
      decisions.push({
        id: `dec-${t.id}`,
        summary: text,
        speaker: t.attendeeName,
        atIso: t.atIso,
      });
    }

    if (/\b(send|share|prepare|follow up|followup|book|schedule|update|action:)\b/.test(lower)) {
      const parsed = chrono.parse(text, referenceDate, { forwardDate: true });
      const dueDate = parsed[0]?.start?.date();
      actions.push({
        id: `act-${t.id}`,
        title: text.replace(/^action:\s*/i, '').trim(),
        owner: t.attendeeName,
        dueIso: dueDate ? dueDate.toISOString() : undefined,
        dueLabel: parsed[0]?.text,
      });
    }
  }

  return { decisions, actions };
}

/**
 * Strictly RAM-only meeting transcript buffer (never touches SQLite or disk).
 * Cleared immediately when session ends or client disconnects.
 */
export class MeetingTranscriptBuffer {
  private active = false;
  private startedAtIso = '';
  private providerMode: MeetingProviderMode = 'DEMO_SANDBOX';
  private attendees: string[] = [];
  private turns: MeetingTurn[] = [];
  private readonly maxTurns: number;

  constructor(maxTurns = 48) {
    this.maxTurns = maxTurns;
  }

  start(options: {
    providerMode: MeetingProviderMode;
    attendees: string[];
    startedAtIso?: string;
  }): MeetingSessionState {
    this.active = true;
    this.startedAtIso = options.startedAtIso ?? new Date().toISOString();
    this.providerMode = options.providerMode;
    this.attendees = [...options.attendees];
    this.turns = [];
    return this.getState();
  }

  pushTurn(input: {
    speakerLabel: string;
    text: string;
    atIso?: string;
    isFinal?: boolean;
    wearerSpeakerLabel?: string;
  }): MeetingSessionState {
    if (!this.active) {
      this.start({ providerMode: this.providerMode, attendees: this.attendees });
    }
    const atIso = input.atIso ?? new Date().toISOString();
    const mapping = mapSpeakerToAttendee(input.speakerLabel, this.attendees, input.wearerSpeakerLabel);
    const turn: MeetingTurn = {
      id: `turn-${this.turns.length + 1}`,
      speakerLabel: input.speakerLabel,
      attendeeName: mapping.attendeeName,
      text: input.text.trim(),
      atIso,
      isWearer: mapping.isWearer,
      isFinal: input.isFinal ?? true,
    };

    // Replace trailing non-final turn from same speaker or append cleanly
    const last = this.turns[this.turns.length - 1];
    if (last && !last.isFinal && last.speakerLabel === turn.speakerLabel) {
      this.turns[this.turns.length - 1] = turn;
    } else {
      this.turns.push(turn);
    }
    if (this.turns.length > this.maxTurns) {
      this.turns.shift();
    }
    return this.getState(Date.parse(atIso));
  }

  getState(nowMs = Date.now()): MeetingSessionState {
    const startMs = this.startedAtIso ? Date.parse(this.startedAtIso) : nowMs;
    const elapsedSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    const uniqueSpeakers = new Set(
      this.turns
        .map((t) => t.speakerLabel)
        .filter((s) => s && s.toUpperCase() !== 'PENDING'),
    );
    const { decisions, actions } = extractMeetingArtifacts(this.turns, new Date(nowMs));
    return {
      active: this.active,
      startedAtIso: this.startedAtIso,
      elapsedSec,
      speakerCount: Math.max(uniqueSpeakers.size, this.active ? 1 : 0),
      providerMode: this.providerMode,
      attendees: [...this.attendees],
      turns: [...this.turns],
      decisions,
      actions,
    };
  }

  /** Securely wipes all in-RAM meeting transcripts, decisions, and action items. */
  wipe(): void {
    this.active = false;
    this.startedAtIso = '';
    this.attendees = [];
    this.turns = [];
  }
}
