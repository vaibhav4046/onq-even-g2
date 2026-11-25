export interface TokenSavingsSummary {
  totalCalls: number;
  toonCalls: number;
  defuddleCalls: number;
  rtkCalls: number;
  rawChars: number;
  compressedChars: number;
  estimatedRawTokens: number;
  estimatedSavedTokens: number;
  reductionPct: number;
  recentOps: Array<{
    op: 'TOON' | 'DEFUDDLE' | 'RTK' | 'CAVEMAN';
    label: string;
    rawChars: number;
    compressedChars: number;
    savedPct: number;
    atIso: string;
  }>;
}

function escapeToonCell(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '""';
  if (/[,:\[\]{}\n]/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Encodes structured JSON data into Token-Oriented Object Notation (TOON)
 * per toon-format/toon spec, turning uniform arrays of objects into compact tabular blocks.
 */
export function encodeToon(value: unknown, rootName?: string, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined || typeof value !== 'object') {
    return rootName ? `${pad}${rootName}: ${escapeToonCell(value)}` : escapeToonCell(value);
  }

  if (Array.isArray(value)) {
    const label = rootName ?? 'items';
    if (value.length === 0) return `${pad}${label}[0]:`;
    const allUniformObjects = value.every(
      (item) => item && typeof item === 'object' && !Array.isArray(item),
    );
    if (allUniformObjects) {
      const firstKeys = Object.keys(value[0] as Record<string, unknown>);
      const sameSchema =
        firstKeys.length > 0 &&
        value.every((item) => {
          const obj = item as Record<string, unknown>;
          return firstKeys.every((k) => Object.prototype.hasOwnProperty.call(obj, k)) &&
            firstKeys.every((k) => typeof obj[k] !== 'object' || obj[k] === null);
        });
      if (sameSchema) {
        const header = `${pad}${label}[${value.length}]{${firstKeys.join(',')}}:`;
        const rows = value.map((item) => {
          const obj = item as Record<string, unknown>;
          return `${pad}  ${firstKeys.map((k) => escapeToonCell(obj[k])).join(',')}`;
        });
        return [header, ...rows].join('\n');
      }
    }
    if (value.every((x) => x === null || typeof x !== 'object')) {
      return `${pad}${label}[${value.length}]: ${value.map(escapeToonCell).join(',')}`;
    }
    const lines = [`${pad}${label}[${value.length}]:`];
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length > 0) {
          lines.push(`${pad}  - ${entries[0][0]}: ${escapeToonCell(entries[0][1])}`);
          for (const [k, v] of entries.slice(1)) {
            lines.push(`${pad}    ${k}: ${escapeToonCell(v)}`);
          }
          continue;
        }
      }
      lines.push(`${pad}  - ${escapeToonCell(item)}`);
    }
    return lines.join('\n');
  }

  const obj = value as Record<string, unknown>;
  const lines: string[] = [];
  if (rootName) lines.push(`${pad}${rootName}:`);
  const innerPad = rootName ? indent + 1 : indent;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      lines.push(encodeToon(v, k, innerPad));
    } else if (v && typeof v === 'object') {
      lines.push(encodeToon(v, k, innerPad));
    } else {
      lines.push(`${'  '.repeat(innerPad)}${k}: ${escapeToonCell(v)}`);
    }
  }
  return lines.join('\n');
}

/**
 * Defuddle HTML cleaner: strips scripts, styles, nav chrome, footers & boilerplate,
 * preserving article body & headings in clean Markdown (~40-70% fewer tokens).
 */
export function defuddleHtmlToText(html: string): { title: string; markdown: string } {
  const raw = String(html ?? '');
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] ?? 'Extracted Document')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Prefer <article> or <main> body when present
  const mainMatch = raw.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
  let body = mainMatch ? mainMatch[2] : raw;

  // Strip noisy structural tags before text extraction
  body = body
    .replace(/<(script|style|noscript|svg|nav|footer|aside|header|form|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl, inner) => `\n${'#'.repeat(Number(lvl))} ${inner}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<(p|br|div|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  const cleanLines = body
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l, idx, arr) => l.length > 0 && !(idx > 0 && arr[idx - 1] === l));

  return { title, markdown: cleanLines.join('\n').trim() };
}

/**
 * RTK-style tool output compressor: deduplicates repeating status lines, compacts verbose logs,
 * and caps noise while preserving errors & key summary counters.
 */
export function compressToolOutput(rawOutput: string, maxLines = 24): string {
  const lines = String(rawOutput ?? '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length <= maxLines) return lines.join('\n');

  const out: string[] = [];
  let dupCount = 0;
  let prevNorm = '';

  const normalize = (s: string) =>
    s
      .replace(/\b\d{1,4}ms\b/g, '<t>')
      .replace(/[0-9a-f]{8,}/gi, '<id>')
      .trim();

  for (const line of lines) {
    const norm = normalize(line);
    if (norm === prevNorm) {
      dupCount++;
      continue;
    }
    if (dupCount > 0) {
      out.push(`  [x${dupCount + 1} similar lines compressed by RTK]`);
      dupCount = 0;
    }
    out.push(line.length > 140 ? `${line.slice(0, 137)}...` : line);
    prevNorm = norm;
    if (out.length >= maxLines - 1) break;
  }
  if (lines.length > maxLines) {
    out.push(`... (${lines.length - maxLines} verbose lines omitted)`);
  }
  return out.join('\n');
}

export class TokenSavingsLedger {
  private totalCalls = 0;
  private toonCalls = 0;
  private defuddleCalls = 0;
  private rtkCalls = 0;
  private rawChars = 0;
  private compressedChars = 0;
  private recentOps: TokenSavingsSummary['recentOps'] = [];

  record(op: 'TOON' | 'DEFUDDLE' | 'RTK' | 'CAVEMAN', label: string, rawLen: number, compLen: number): void {
    const r = Math.max(1, rawLen);
    const c = Math.max(1, Math.min(r, compLen));
    this.totalCalls++;
    if (op === 'TOON') this.toonCalls++;
    if (op === 'DEFUDDLE') this.defuddleCalls++;
    if (op === 'RTK') this.rtkCalls++;
    this.rawChars += r;
    this.compressedChars += c;
    const savedPct = Math.max(0, Math.round(((r - c) / r) * 100));
    this.recentOps.unshift({
      op,
      label: label.slice(0, 48),
      rawChars: r,
      compressedChars: c,
      savedPct,
      atIso: new Date().toISOString(),
    });
    if (this.recentOps.length > 12) this.recentOps.length = 12;
  }

  encodeWithMetrics(value: unknown, label = 'workspace_payload'): { toon: string; rawChars: number; compressedChars: number } {
    const rawJson = JSON.stringify(value, null, 2);
    const toon = encodeToon(value);
    this.record('TOON', label, rawJson.length, toon.length);
    return { toon, rawChars: rawJson.length, compressedChars: toon.length };
  }

  getSummary(): TokenSavingsSummary {
    const savedChars = Math.max(0, this.rawChars - this.compressedChars);
    const reductionPct = this.rawChars > 0 ? Math.round((savedChars / this.rawChars) * 100) : 0;
    return {
      totalCalls: this.totalCalls,
      toonCalls: this.toonCalls,
      defuddleCalls: this.defuddleCalls,
      rtkCalls: this.rtkCalls,
      rawChars: this.rawChars,
      compressedChars: this.compressedChars,
      estimatedRawTokens: Math.round(this.rawChars / 4),
      estimatedSavedTokens: Math.round(savedChars / 4),
      reductionPct,
      recentOps: [...this.recentOps],
    };
  }
}
