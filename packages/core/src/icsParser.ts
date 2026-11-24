export interface ParsedIcsEvent {
  uid: string;
  summary: string;
  startIso: string;
  endIso: string;
  attendeeEmail?: string;
  attendeeName?: string;
  driveDocUrl?: string;
  driveDocTitle?: string;
  description?: string;
}

function unfoldIcsLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');
  const unfolded: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function parseIcsTimestamp(value: string): string | undefined {
  const v = value.trim();
  // YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i);
  if (m) {
    const [, yr, mo, da, hh, mm, ss] = m;
    return `${yr}-${mo}-${da}T${hh}:${mm}:${ss}.000Z`;
  }
  // YYYYMMDD all-day date
  const d = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (d) {
    return `${d[1]}-${d[2]}-${d[3]}T09:00:00.000Z`;
  }
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function unescapeIcsText(s: string): string {
  return s
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Pure-TS RFC 5545 .ics VEVENT parser. Zero external dependencies.
 */
export function parseIcsEvents(icsText: string, nowIso?: string): ParsedIcsEvent[] {
  const lines = unfoldIcsLines(icsText ?? '');
  const events: ParsedIcsEvent[] = [];
  let inEvent = false;
  let current: Partial<ParsedIcsEvent> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }
    if (trimmed === 'END:VEVENT') {
      if (inEvent && current.summary && current.startIso) {
        const startMs = Date.parse(current.startIso);
        const endIso =
          current.endIso ??
          (Number.isFinite(startMs) ? new Date(startMs + 30 * 60_000).toISOString() : current.startIso);
        events.push({
          uid: current.uid ?? `ics-${events.length + 1}`,
          summary: current.summary,
          startIso: current.startIso,
          endIso,
          attendeeEmail: current.attendeeEmail,
          attendeeName: current.attendeeName,
          driveDocUrl: current.driveDocUrl,
          driveDocTitle: current.driveDocTitle,
          description: current.description,
        });
      }
      inEvent = false;
      current = {};
      continue;
    }
    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const left = line.slice(0, colonIdx);
    const val = line.slice(colonIdx + 1);
    const propName = left.split(';')[0].toUpperCase();

    if (propName === 'UID') {
      current.uid = val.trim();
    } else if (propName === 'SUMMARY') {
      current.summary = unescapeIcsText(val);
    } else if (propName === 'DTSTART') {
      current.startIso = parseIcsTimestamp(val);
    } else if (propName === 'DTEND') {
      current.endIso = parseIcsTimestamp(val);
    } else if (propName === 'DESCRIPTION') {
      const desc = unescapeIcsText(val);
      current.description = desc;
      const driveMatch = desc.match(/https:\/\/docs\.google\.com\/[^\s]+/i);
      if (driveMatch) {
        current.driveDocUrl = driveMatch[0];
        current.driveDocTitle = 'Linked Google Doc';
      }
    } else if (propName === 'ATTENDEE' && !current.attendeeEmail) {
      const email = val.replace(/^mailto:/i, '').trim();
      if (email.includes('@')) current.attendeeEmail = email;
      const cnMatch = left.match(/CN=([^;]+)/i);
      if (cnMatch) {
        current.attendeeName = cnMatch[1].replace(/^"|"$/g, '').trim();
      }
    }
  }

  const cutoffMs = nowIso ? Date.parse(nowIso) - 30 * 60_000 : 0;
  return events
    .filter((ev) => !nowIso || Date.parse(ev.endIso) >= cutoffMs)
    .sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso));
}
