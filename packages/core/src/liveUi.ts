import { clipLine42, G2_MAX_COLS, sanitizeLvglAscii, wrapLine42 } from './formatter.js';

export type AliveMood =
  | 'neutral'
  | 'focused'
  | 'curious'
  | 'confident'
  | 'amused'
  | 'impressed'
  | 'determined'
  | 'excited'
  | 'sympathetic'
  | 'worried'
  | 'proud'
  | 'surprised';

export type LiveUiFrameKind = 'full' | 'stack' | 'split' | 'plate' | 'rail-plate';

export type LiveUiComponentKind =
  | 'text'
  | 'pages'
  | 'list'
  | 'checklist'
  | 'stepper'
  | 'timer'
  | 'facts'
  | 'table'
  | 'graphic';

export interface LiveUiRow {
  id: string;
  cells: Record<string, string | number>;
  raw: string[];
  checked?: boolean;
}

export interface LiveUiGraphicSlot {
  type: 'metric' | 'sparkline' | 'bars' | 'progress' | 'status';
  label: string;
  value?: number | string;
  unit?: string;
  values?: number[];
  delta?: number;
}

export interface LiveUiTimerState {
  mode: 'countdown' | 'elapsed';
  durationSec: number;
  remainingSec: number;
  status: 'idle' | 'running' | 'paused' | 'done';
  updatedAtMs: number;
}

export interface LiveUiComponent {
  id: string;
  kind: LiveUiComponentKind;
  region: 'main' | 'top' | 'bottom' | 'rail' | 'pane' | 'plate' | 'caption' | 'foot';
  label?: string;
  text?: string;
  cols?: string[];
  rows?: LiveUiRow[];
  pages?: string[];
  pageIndex?: number;
  selectedIndex?: number;
  value?: number;
  min?: number;
  max?: number;
  stepBy?: number;
  fmt?: string;
  options?: Array<{ id: string; label: string }>;
  timer?: LiveUiTimerState;
  facts?: Array<{ label: string; valueExpr: string; fmt?: string }>;
  sortCol?: string;
  sortDesc?: boolean;
  slots?: LiveUiGraphicSlot[];
  actions?: Array<{ id: string; label: string }>;
}

export interface LiveUiSurface {
  id: string;
  title: string;
  frame: LiveUiFrameKind;
  presetKey?: string;
  pinned?: boolean;
  repairedCodes: string[];
  vars: Record<string, number | string | boolean>;
  components: LiveUiComponent[];
  lastActionNotice?: string;
  updatedAtIso: string;
}

export interface PacedSegment {
  text: string;
  mode: 'normal' | 'dwell' | 'skim';
  pauseBeforeMs: number;
  mood?: AliveMood;
}

export interface ParsedDisplayStream {
  plainText: string;
  moods: AliveMood[];
  segments: PacedSegment[];
  totalDurationMs: number;
}

const VALID_MOODS = new Set<AliveMood>([
  'neutral',
  'focused',
  'curious',
  'confident',
  'amused',
  'impressed',
  'determined',
  'excited',
  'sympathetic',
  'worried',
  'proud',
  'surprised',
]);

/**
 * Parses invisible display markup (<dwell>, <skim>, <beat/>, <mood:X/> / <speck:X/>)
 * into plain text plus timed reveal segments for natural reading speed on G2.
 */
export function parseDisplayMarkup(raw: string, baseWpm = 220): ParsedDisplayStream {
  const input = String(raw ?? '').trim();
  const segments: PacedSegment[] = [];
  const moods: AliveMood[] = [];
  const tokenRe = /<(dwell|skim)>([\s\S]*?)<\/\1>|<(beat)\/>|<(?:mood|speck):([a-z]+)\/>/gi;

  let cursor = 0;
  let pendingPause = 0;
  let currentMood: AliveMood | undefined;

  const pushText = (text: string, mode: 'normal' | 'dwell' | 'skim') => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    segments.push({ text: clean, mode, pauseBeforeMs: pendingPause, mood: currentMood });
    pendingPause = 0;
    currentMood = undefined;
  };

  for (const match of input.matchAll(tokenRe)) {
    const idx = match.index ?? 0;
    if (idx > cursor) {
      pushText(input.slice(cursor, idx), 'normal');
    }
    const [full, spanTag, spanBody, beatTag, moodName] = match;
    if (beatTag) {
      pendingPause += 420;
    } else if (moodName) {
      const m = moodName.toLowerCase() as AliveMood;
      if (VALID_MOODS.has(m)) {
        currentMood = m;
        moods.push(m);
      }
    } else if (spanTag && spanBody) {
      pushText(spanBody, spanTag.toLowerCase() === 'dwell' ? 'dwell' : 'skim');
    }
    cursor = idx + full.length;
  }

  if (cursor < input.length) {
    pushText(input.slice(cursor), 'normal');
  }

  if (segments.length === 0 && input) {
    const stripped = input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (stripped) {
      segments.push({ text: stripped, mode: 'normal', pauseBeforeMs: 0 });
    }
  }

  const msPerWord = Math.max(90, Math.round(60_000 / Math.max(120, Math.min(480, baseWpm))));
  let totalDurationMs = 0;
  for (const seg of segments) {
    const words = seg.text.split(/\s+/).filter(Boolean).length;
    const mult = seg.mode === 'dwell' ? 1.65 : seg.mode === 'skim' ? 0.55 : 1.0;
    totalDurationMs += seg.pauseBeforeMs + Math.round(words * msPerWord * mult);
  }

  return {
    plainText: segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim(),
    moods,
    segments,
    totalDurationMs,
  };
}

export function stepPacedReveal(
  parsed: ParsedDisplayStream,
  elapsedMs: number,
  baseWpm = 220,
): { visibleText: string; mood: AliveMood; done: boolean; progress01: number } {
  if (parsed.segments.length === 0) {
    return { visibleText: '', mood: 'neutral', done: true, progress01: 1 };
  }
  const msPerWord = Math.max(90, Math.round(60_000 / Math.max(120, Math.min(480, baseWpm))));
  let acc = 0;
  let mood: AliveMood = 'neutral';
  const out: string[] = [];

  for (const seg of parsed.segments) {
    if (seg.mood) mood = seg.mood;
    acc += seg.pauseBeforeMs;
    if (elapsedMs < acc) {
      return {
        visibleText: out.join(' ').trim(),
        mood,
        done: false,
        progress01: parsed.totalDurationMs > 0 ? Math.min(1, elapsedMs / parsed.totalDurationMs) : 1,
      };
    }
    const words = seg.text.split(/\s+/).filter(Boolean);
    const mult = seg.mode === 'dwell' ? 1.65 : seg.mode === 'skim' ? 0.55 : 1.0;
    const segMs = words.length * msPerWord * mult;
    if (elapsedMs >= acc + segMs) {
      out.push(seg.text);
      acc += segMs;
    } else {
      const ratio = segMs > 0 ? (elapsedMs - acc) / segMs : 1;
      const count = Math.max(1, Math.ceil(words.length * ratio));
      out.push(words.slice(0, count).join(' '));
      return {
        visibleText: out.join(' ').trim(),
        mood,
        done: false,
        progress01: parsed.totalDurationMs > 0 ? Math.min(1, elapsedMs / parsed.totalDurationMs) : 1,
      };
    }
  }

  return { visibleText: parsed.plainText, mood, done: true, progress01: 1 };
}

/**
 * Safe recursive-descent formula parser (numbers, strings, comparisons, min/max/round/fmt).
 * Pure TypeScript tokenizer/AST parser with zero dynamic code execution.
 */
export function evaluateSafeFormula(
  expr: string,
  env: Record<string, number | string | boolean | undefined>,
): number | string | boolean {
  const src = String(expr ?? '').replace(/^=/, '').trim();
  if (!src) return '';

  // Handle fmt(x, style, unit) calls cleanly before general math
  const fmtMatch = src.match(/^fmt\(\s*(.+?)\s*,\s*'([a-zA-Z0-9_]+)'(?:\s*,\s*'([a-zA-Z0-9_]+)')?\s*\)$/);
  if (fmtMatch) {
    const val = Number(evaluateSafeFormula(fmtMatch[1], env));
    return formatFormulaValue(Number.isFinite(val) ? val : 0, fmtMatch[2], fmtMatch[3]);
  }

  // Handle round(x) / min(a,b) / max(a,b)
  const fnMatch = src.match(/^(round|min|max|abs)\((.+)\)$/);
  if (fnMatch) {
    const args = splitTopLevelArgs(fnMatch[2]).map((a) => Number(evaluateSafeFormula(a, env)));
    if (fnMatch[1] === 'round') return Math.round(args[0] ?? 0);
    if (fnMatch[1] === 'abs') return Math.abs(args[0] ?? 0);
    if (fnMatch[1] === 'min') return Math.min(...args);
    if (fnMatch[1] === 'max') return Math.max(...args);
  }

  // Direct string literal
  if ((src.startsWith("'") && src.endsWith("'")) || (src.startsWith('"') && src.endsWith('"'))) {
    return src.slice(1, -1);
  }

  // Tokenize numbers, identifiers, operators, parens
  type Tok =
    | { k: 'num'; v: number }
    | { k: 'id'; v: string }
    | { k: 'op'; v: string };

  const tokens: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
      tokens.push({ k: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/()<>'.includes(ch)) {
      tokens.push({ k: 'op', v: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ k: 'num', v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      const id = src.slice(i, j);
      const bound = env[id];
      if (typeof bound === 'number') {
        tokens.push({ k: 'num', v: bound });
      } else if (typeof bound === 'string' && /^-?\d+(\.\d+)?$/.test(bound.trim())) {
        tokens.push({ k: 'num', v: Number(bound) });
      } else {
        tokens.push({ k: 'id', v: bound !== undefined ? String(bound) : id });
      }
      i = j;
      continue;
    }
    // Unsupported char -> return safe string lookup
    return env[src] !== undefined ? (env[src] as string | number | boolean) : src;
  }

  if (tokens.length === 1 && tokens[0].k === 'id') {
    return tokens[0].v;
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parsePrimary = (): number => {
    const t = peek();
    if (!t) return 0;
    if (t.k === 'op' && t.v === '-') {
      consume();
      return -parsePrimary();
    }
    if (t.k === 'op' && t.v === '(') {
      consume();
      const v = parseAddSub();
      if (peek()?.k === 'op' && peek()?.v === ')') consume();
      return v;
    }
    if (t.k === 'num') {
      consume();
      return Number.isFinite(t.v) ? t.v : 0;
    }
    consume();
    return 0;
  };

  const parseMulDiv = (): number => {
    let left = parsePrimary();
    while (peek()?.k === 'op' && (peek()?.v === '*' || peek()?.v === '/')) {
      const op = consume().v;
      const right = parsePrimary();
      left = op === '*' ? left * right : right === 0 ? 0 : left / right;
    }
    return left;
  };

  const parseAddSub = (): number => {
    let left = parseMulDiv();
    while (peek()?.k === 'op' && (peek()?.v === '+' || peek()?.v === '-')) {
      const op = consume().v;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const leftVal = parseAddSub();
  const nextTok = peek();
  if (nextTok?.k === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(String(nextTok.v))) {
    const cmp = String(consume().v);
    const rightVal = parseAddSub();
    if (cmp === '>') return leftVal > rightVal;
    if (cmp === '<') return leftVal < rightVal;
    if (cmp === '>=') return leftVal >= rightVal;
    if (cmp === '<=') return leftVal <= rightVal;
    if (cmp === '==') return leftVal === rightVal;
    return leftVal !== rightVal;
  }
  return Math.round(leftVal * 1000) / 1000;
}

function splitTopLevelArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth = Math.max(0, depth - 1);
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

export function formatFormulaValue(val: number | string | boolean, fmt?: string, unit?: string): string {
  if (typeof val === 'boolean') return val ? 'YES' : 'NO';
  if (typeof val === 'string') return val;
  if (!Number.isFinite(val)) return '--';
  if (fmt === 'pct') return `${Math.round(val * 100)}%`;
  if (fmt?.startsWith('money')) {
    const cur = unit ?? fmt.split(':')[1] ?? 'USD';
    return `${cur} ${val.toFixed(2)}`;
  }
  if (fmt === 'dur') {
    const totalSec = Math.max(0, Math.round(val));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const decimals = fmt?.startsWith('num:') ? Number(fmt.split(':')[1]) : Number.isInteger(val) ? 0 : 2;
  return val.toFixed(Number.isFinite(decimals) ? Math.min(4, Math.max(0, decimals)) : 2);
}

export function buildSurfaceEnv(surface: LiveUiSurface): Record<string, number | string | boolean | undefined> {
  const env: Record<string, number | string | boolean | undefined> = { ...surface.vars };
  for (const c of surface.components) {
    if (c.kind === 'stepper' && c.value !== undefined) {
      env[c.id] = c.value;
    }
    if (c.kind === 'timer' && c.timer) {
      env[`${c.id}.remaining`] = c.timer.remainingSec;
      env[`${c.id}.status`] = c.timer.status;
    }
    if ((c.kind === 'list' || c.kind === 'table' || c.kind === 'checklist') && c.rows && c.rows.length > 0) {
      const idx = Math.max(0, Math.min(c.rows.length - 1, c.selectedIndex ?? 0));
      const row = c.rows[idx];
      for (const [k, v] of Object.entries(row.cells)) {
        env[k] = v;
        env[`sel.${k}`] = v;
      }
      env[`${c.id}.checked`] = c.rows.filter((r) => r.checked).length;
      env[`${c.id}.count`] = c.rows.length;
    }
  }
  return env;
}

export function buildPresetLiveUi(key: string, nowIso = new Date().toISOString()): LiveUiSurface {
  const k = key.toLowerCase().trim();
  if (k === 'split_bill' || k.includes('split') || k.includes('bill') || k.includes('tip')) {
    return {
      id: 'liveui_split_bill',
      title: 'Split Bill Calculator',
      frame: 'stack',
      presetKey: 'split_bill',
      pinned: true,
      repairedCodes: [],
      vars: { bill: 160, people: 4 },
      updatedAtIso: nowIso,
      components: [
        {
          id: 'tip',
          kind: 'stepper',
          region: 'top',
          label: 'Tip %',
          value: 15,
          min: 0,
          max: 30,
          stepBy: 5,
          fmt: 'num:0',
          actions: [{ id: 'split_equal', label: 'Split 4 ways' }],
        },
        {
          id: 'each',
          kind: 'facts',
          region: 'bottom',
          facts: [
            { label: 'Total w/ Tip', valueExpr: 'bill*(1+tip/100)', fmt: 'money:USD' },
            { label: 'Per Person', valueExpr: '(bill*(1+tip/100))/people', fmt: 'money:USD' },
          ],
        },
      ],
    };
  }

  if (k === 'compare_models' || k.includes('compare') || k.includes('hotel') || k.includes('model')) {
    return {
      id: 'liveui_compare_models',
      title: 'Model Router Matrix',
      frame: 'split',
      presetKey: 'compare_models',
      pinned: true,
      repairedCodes: [],
      vars: {},
      updatedAtIso: nowIso,
      components: [
        {
          id: 'models',
          kind: 'table',
          region: 'rail',
          cols: ['model', 'latency', 'cost', 'note'],
          sortCol: 'latency',
          sortDesc: false,
          selectedIndex: 0,
          rows: [
            {
              id: 'r1',
              raw: ['Claude Sonnet 4', '420ms', '0', 'Complex tool routing'],
              cells: { model: 'Claude Sonnet 4', latency: '420ms', cost: 0, note: 'Complex tool routing' },
            },
            {
              id: 'r2',
              raw: ['OpenRouter Free', '310ms', '0', '24/7 cascade standby'],
              cells: { model: 'OpenRouter Free', latency: '310ms', cost: 0, note: '24/7 cascade standby' },
            },
            {
              id: 'r3',
              raw: ['GPT-4o Mini', '290ms', '0', 'Fast JSON synthesis'],
              cells: { model: 'GPT-4o Mini', latency: '290ms', cost: 0, note: 'Fast JSON synthesis' },
            },
          ],
        },
        {
          id: 'detail',
          kind: 'facts',
          region: 'pane',
          facts: [
            { label: 'Selected', valueExpr: '=sel.model' },
            { label: 'Speed', valueExpr: '=sel.latency' },
            { label: 'Role', valueExpr: '=sel.note' },
          ],
        },
      ],
    };
  }

  if (k === 'reaction_game' || k.includes('game') || k.includes('snake') || k.includes('quiz') || k.includes('play')) {
    return {
      id: 'liveui_reaction_game',
      title: 'G2 Reflex Arena',
      frame: 'stack',
      presetKey: 'reaction_game',
      pinned: true,
      repairedCodes: [],
      vars: { bestMs: 245, round: 1, streak: 0 },
      updatedAtIso: nowIso,
      components: [
        {
          id: 'arena',
          kind: 'list',
          region: 'top',
          cols: ['label', 'score'],
          selectedIndex: 0,
          rows: [
            { id: 'hit', raw: ['Tap on GREEN signal', 'READY'], cells: { label: 'Tap on GREEN signal', score: 'READY' } },
            { id: 'dash', raw: ['Dodge curse wave', '+50 pts'], cells: { label: 'Dodge curse wave', score: '+50 pts' } },
            { id: 'reset', raw: ['New reflex round', 'RESET'], cells: { label: 'New reflex round', score: 'RESET' } },
          ],
          actions: [{ id: 'reflex_tap', label: 'Strike Ring Tap' }],
        },
        {
          id: 'hud',
          kind: 'facts',
          region: 'bottom',
          facts: [
            { label: 'Streak', valueExpr: 'streak', fmt: 'num:0' },
            { label: 'Best Reflex', valueExpr: 'bestMs', fmt: 'num:0' },
          ],
        },
      ],
    };
  }

  if (k === 'launch_checklist' || k.includes('checklist') || k.includes('pack') || k.includes('todo')) {
    return {
      id: 'liveui_launch_checklist',
      title: 'Launch Ship Checklist',
      frame: 'stack',
      presetKey: 'launch_checklist',
      pinned: true,
      repairedCodes: [],
      vars: {},
      updatedAtIso: nowIso,
      components: [
        {
          id: 'ship_items',
          kind: 'checklist',
          region: 'top',
          cols: ['label'],
          selectedIndex: 0,
          rows: [
            { id: 'c1', raw: ['232 Vitest + Security checks'], cells: { label: '232 Vitest + Security checks' }, checked: true },
            { id: 'c2', raw: ['EvenHub 0.9.5 Simulator green'], cells: { label: 'EvenHub 0.9.5 Simulator green' }, checked: true },
            { id: 'c3', raw: ['Telegram Bot Brief push test'], cells: { label: 'Telegram Bot Brief push test' }, checked: false },
            { id: 'c4', raw: ['3m Demo Video + DoraHacks'], cells: { label: '3m Demo Video + DoraHacks' }, checked: false },
          ],
        },
        {
          id: 'progress',
          kind: 'facts',
          region: 'bottom',
          facts: [
            { label: 'Completed', valueExpr: 'ship_items.checked', fmt: 'num:0' },
            { label: 'Total Tasks', valueExpr: 'ship_items.count', fmt: 'num:0' },
          ],
        },
      ],
    };
  }

  // Default: Pomodoro Deep Focus App
  return {
    id: 'liveui_pomodoro',
    title: 'Deep Work Pomodoro',
    frame: 'stack',
    presetKey: 'pomodoro',
    pinned: true,
    repairedCodes: [],
    vars: { sprintsDone: 2 },
    updatedAtIso: nowIso,
    components: [
      {
        id: 'focus_steps',
        kind: 'checklist',
        region: 'top',
        cols: ['label'],
        selectedIndex: 0,
        rows: [
          { id: 'p1', raw: ['Ship JJK Six Eyes Alive Engine'], cells: { label: 'Ship JJK Six Eyes Alive Engine' }, checked: true },
          { id: 'p2', raw: ['Test LiveUI on G2 Waveguide'], cells: { label: 'Test LiveUI on G2 Waveguide' }, checked: false },
          { id: 'p3', raw: ['Review Telegram + Inbox Brief'], cells: { label: 'Review Telegram + Inbox Brief' }, checked: false },
        ],
        actions: [
          { id: 'toggle_timer', label: 'Start/Pause Timer' },
          { id: 'reset_timer', label: 'Reset 25m' },
        ],
      },
      {
        id: 'pomodoro',
        kind: 'timer',
        region: 'bottom',
        label: 'Focus Block',
        timer: {
          mode: 'countdown',
          durationSec: 1500,
          remainingSec: 1500,
          status: 'idle',
          updatedAtMs: Date.now(),
        },
      },
    ],
  };
}

/**
 * Generates an interactive LiveUI micro-app surface from natural language OR parses OcuClaw-compatible <ui .../> markup.
 */
export function synthesizeLiveUiFromPrompt(prompt: string, nowIso = new Date().toISOString()): LiveUiSurface {
  const clean = String(prompt ?? '').trim();
  if (clean.includes('<ui ')) {
    const parsed = parseOrRepairLiveUiXml(clean, nowIso);
    if (parsed) return parsed;
  }
  const preset = buildPresetLiveUi(clean || 'pomodoro', nowIso);
  if (clean && !preset.title.toLowerCase().includes(clean.toLowerCase().slice(0, 8))) {
    preset.title = clipLine42(clean.replace(/^(build|make|create|open|show|run)\s+(me\s+)?(a\s+|an\s+)?/i, ''), 28) || preset.title;
  }
  return preset;
}

/**
 * Parses and auto-repairs <ui frame="..." .../> declarative markup into a safe LiveUiSurface.
 */
export function parseOrRepairLiveUiXml(xml: string, nowIso = new Date().toISOString()): LiveUiSurface | null {
  const frameMatch = xml.match(/<ui\b([^>]*)\bf\w*="([^"]*)"([^>]*)\/?>/i);
  if (!frameMatch) return null;

  const repairedCodes: string[] = [];
  const attrStr = `${frameMatch[1]} frame="${frameMatch[2]}" ${frameMatch[3]}`;
  const rawFrame = (attrStr.match(/\bframe="([^"]+)"/i)?.[1] ?? 'full') as LiveUiFrameKind;
  const frame: LiveUiFrameKind = ['full', 'stack', 'split', 'plate', 'rail-plate'].includes(rawFrame)
    ? rawFrame
    : (repairedCodes.push('frame_repaired'), 'full');
  const title = clipLine42(attrStr.match(/\btitle="([^"]+)"/i)?.[1] ?? 'OnQ LiveUI', 32);

  const vars: Record<string, number | string | boolean> = {};
  const letRe = /<ui\b[^>]*\blet="([^"]+)"[^>]*\bbe="([^"]*)"[^>]*\/?>/gi;
  for (const m of xml.matchAll(letRe)) {
    const num = Number(m[2]);
    vars[m[1]] = Number.isFinite(num) && m[2].trim() !== '' ? num : m[2];
  }

  const components: LiveUiComponent[] = [];
  const compRe = /<ui\b([^>]*)\bc="([^"]+)"([^>]*)(?:\/>|>([\s\S]*?)<\/ui>)/gi;
  let compIdx = 0;
  for (const m of xml.matchAll(compRe)) {
    compIdx++;
    const attrs = `${m[1]} ${m[3]}`;
    const cKindRaw = m[2].toLowerCase();
    const id = attrs.match(/\bid="([^"]+)"/i)?.[1] ?? `comp_${compIdx}`;
    const region = (attrs.match(/\bin="([^"]+)"/i)?.[1] ?? (compIdx === 1 ? 'main' : 'bottom')) as LiveUiComponent['region'];
    const body = (m[4] ?? '').trim();

    if (cKindRaw === 'stepper') {
      const initNum = Number(attrs.match(/\binit="([^"]+)"/i)?.[1] ?? 0);
      const min = Number(attrs.match(/\bmin="([^"]+)"/i)?.[1] ?? 0);
      const max = Number(attrs.match(/\bmax="([^"]+)"/i)?.[1] ?? 100);
      const by = Number(attrs.match(/\bby="([^"]+)"/i)?.[1] ?? 1);
      if (min > max) repairedCodes.push('range_repaired');
      components.push({
        id,
        kind: 'stepper',
        region,
        label: attrs.match(/\blabel="([^"]+)"/i)?.[1] ?? id,
        value: Number.isFinite(initNum) ? initNum : min,
        min: Math.min(min, max),
        max: Math.max(min, max),
        stepBy: Number.isFinite(by) && by > 0 ? by : 1,
        fmt: attrs.match(/\bfmt="([^"]+)"/i)?.[1],
      });
    } else if (cKindRaw === 'checklist' || cKindRaw === 'list' || cKindRaw === 'table') {
      const cols = (attrs.match(/\bcols="([^"]+)"/i)?.[1] ?? 'label')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const lines = body
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 20);
      const rows: LiveUiRow[] = lines.map((line, rIdx) => {
        const parts = line.split('|').map((p) => p.trim());
        const cells: Record<string, string | number> = {};
        cols.forEach((col, cIdx) => {
          const val = parts[cIdx] ?? '';
          const n = Number(val);
          cells[col] = val !== '' && Number.isFinite(n) ? n : val;
        });
        return {
          id: `${id}_r${rIdx}`,
          raw: parts,
          cells,
          checked: cKindRaw === 'checklist' ? false : undefined,
        };
      });
      components.push({
        id,
        kind: cKindRaw as 'checklist' | 'list' | 'table',
        region,
        cols,
        rows,
        selectedIndex: 0,
        sortCol: attrs.match(/\bsort="([^",]+)/i)?.[1],
      });
    } else if (cKindRaw === 'timer') {
      const durStr = attrs.match(/\bfor="([^"]+)"/i)?.[1] ?? '5m';
      const durSec = parseDurationSpec(durStr);
      components.push({
        id,
        kind: 'timer',
        region,
        label: attrs.match(/\blabel="([^"]+)"/i)?.[1] ?? 'Timer',
        timer: {
          mode: attrs.match(/\bmode="([^"]+)"/i)?.[1] === 'elapsed' ? 'elapsed' : 'countdown',
          durationSec: durSec,
          remainingSec: durSec,
          status: 'idle',
          updatedAtMs: Date.now(),
        },
      });
    } else if (cKindRaw === 'facts') {
      const oneLabel = attrs.match(/\blabel="([^"]+)"/i)?.[1];
      const oneVal = attrs.match(/\bvalue="([^"]+)"/i)?.[1];
      const fmt = attrs.match(/\bfmt="([^"]+)"/i)?.[1];
      const facts =
        oneLabel && oneVal
          ? [{ label: oneLabel, valueExpr: oneVal, fmt }]
          : body
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => {
                const [label, valueExpr] = l.split('|').map((p) => p.trim());
                return { label: label || 'Fact', valueExpr: valueExpr || '' };
              });
      components.push({ id, kind: 'facts', region, facts });
    } else {
      const textVal = attrs.match(/\btext="([^"]+)"/i)?.[1] ?? body;
      components.push({ id, kind: 'text', region, text: textVal || 'Ready' });
    }
  }

  if (components.length === 0) return null;
  return {
    id: `liveui_${Date.now().toString(36)}`,
    title,
    frame,
    repairedCodes,
    vars,
    components,
    updatedAtIso: nowIso,
  };
}

function parseDurationSpec(spec: string): number {
  const m = spec.trim().match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m) return 300;
  const sec = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return sec > 0 ? sec : 300;
}

export type LiveUiInteraction =
  | { type: 'next_row' }
  | { type: 'prev_row' }
  | { type: 'tap'; index?: number }
  | { type: 'step'; delta: number }
  | { type: 'timer_toggle' }
  | { type: 'timer_reset' }
  | { type: 'sort_toggle'; col?: string }
  | { type: 'tick'; elapsedSec?: number };

export function reduceLiveUiAction(
  surface: LiveUiSurface,
  action: LiveUiInteraction,
  nowMs = Date.now(),
): LiveUiSurface {
  const next: LiveUiSurface = {
    ...surface,
    vars: { ...surface.vars },
    components: surface.components.map((c) => ({
      ...c,
      rows: c.rows ? c.rows.map((r) => ({ ...r, cells: { ...r.cells } })) : undefined,
      timer: c.timer ? { ...c.timer } : undefined,
    })),
    updatedAtIso: new Date(nowMs).toISOString(),
  };

  const driver = next.components[0];
  const timerComp = next.components.find((c) => c.kind === 'timer' && c.timer);

  if (action.type === 'tick' && timerComp?.timer && timerComp.timer.status === 'running') {
    const dt = Math.max(1, action.elapsedSec ?? 1);
    if (timerComp.timer.mode === 'countdown') {
      timerComp.timer.remainingSec = Math.max(0, timerComp.timer.remainingSec - dt);
      if (timerComp.timer.remainingSec === 0) {
        timerComp.timer.status = 'done';
        next.lastActionNotice = `${timerComp.label ?? 'Timer'} finished`;
      }
    } else {
      timerComp.timer.remainingSec += dt;
    }
    timerComp.timer.updatedAtMs = nowMs;
    return next;
  }

  if (action.type === 'timer_toggle' && timerComp?.timer) {
    timerComp.timer.status = timerComp.timer.status === 'running' ? 'paused' : 'running';
    timerComp.timer.updatedAtMs = nowMs;
    next.lastActionNotice = `Timer ${timerComp.timer.status}`;
    return next;
  }

  if (action.type === 'timer_reset' && timerComp?.timer) {
    timerComp.timer.remainingSec = timerComp.timer.durationSec;
    timerComp.timer.status = 'idle';
    timerComp.timer.updatedAtMs = nowMs;
    next.lastActionNotice = 'Timer reset';
    return next;
  }

  if (!driver) return next;

  if ((action.type === 'next_row' || action.type === 'prev_row') && driver.rows && driver.rows.length > 0) {
    const len = driver.rows.length;
    const cur = driver.selectedIndex ?? 0;
    driver.selectedIndex = action.type === 'next_row' ? (cur + 1) % len : (cur - 1 + len) % len;
    return next;
  }

  if (driver.kind === 'stepper') {
    const delta =
      action.type === 'step'
        ? action.delta
        : action.type === 'prev_row' || action.type === 'next_row'
          ? (action.type === 'next_row' ? 1 : -1) * (driver.stepBy ?? 1)
          : driver.stepBy ?? 1;
    const min = driver.min ?? 0;
    const max = driver.max ?? 100;
    const cur = driver.value ?? min;
    driver.value = Math.min(max, Math.max(min, cur + delta));
    next.lastActionNotice = `${driver.label ?? 'Value'} -> ${driver.value}`;
    return next;
  }

  if (action.type === 'tap' && driver.rows && driver.rows.length > 0) {
    const idx = action.index !== undefined ? Math.max(0, Math.min(driver.rows.length - 1, action.index)) : (driver.selectedIndex ?? 0);
    driver.selectedIndex = idx;
    const row = driver.rows[idx];
    if (driver.kind === 'checklist') {
      row.checked = !row.checked;
      next.lastActionNotice = `${row.checked ? '[x]' : '[ ]'} ${String(row.cells.label ?? row.raw[0] ?? '')}`;
    } else if (next.presetKey === 'reaction_game') {
      const reflexMs = 175 + (nowMs % 130);
      next.vars.streak = Number(next.vars.streak ?? 0) + 1;
      next.vars.bestMs = Math.min(Number(next.vars.bestMs ?? 999), reflexMs);
      row.raw[1] = `${reflexMs}ms`;
      row.cells.score = `${reflexMs}ms`;
      next.lastActionNotice = `Strike ${reflexMs}ms | Streak ${next.vars.streak}`;
    } else {
      next.lastActionNotice = `Selected ${row.raw[0] ?? 'item'}`;
    }
    return next;
  }

  if (action.type === 'sort_toggle' && driver.kind === 'table' && driver.rows) {
    const col = action.col ?? driver.sortCol ?? driver.cols?.[0] ?? 'label';
    const desc = driver.sortCol === col ? !driver.sortDesc : false;
    driver.sortCol = col;
    driver.sortDesc = desc;
    driver.rows.sort((a, b) => {
      const av = String(a.cells[col] ?? '');
      const bv = String(b.cells[col] ?? '');
      return desc ? bv.localeCompare(av, undefined, { numeric: true }) : av.localeCompare(bv, undefined, { numeric: true });
    });
    next.lastActionNotice = `Sorted by ${col} (${desc ? 'desc' : 'asc'})`;
    return next;
  }

  return next;
}

/**
 * Formats any interactive LiveUI micro-app into exact 576x288 G2 ASCII lines (<= 7 lines x 42 cols).
 */
export function formatLiveUiForG2(surface: LiveUiSurface): { header: string; lines: string[]; bodyText: string } {
  const env = buildSurfaceEnv(surface);
  const lines: string[] = [
    clipLine42(`LIVEUI | ${sanitizeLvglAscii(surface.title).toUpperCase()}`, G2_MAX_COLS),
    '------------------------------------------',
  ];

  const driver = surface.components[0];
  if (driver?.kind === 'stepper') {
    const valStr = formatFormulaValue(driver.value ?? 0, driver.fmt);
    lines.push(clipLine42(`> ${driver.label ?? 'Value'}: [ ${valStr} ]  (- / +)`));
  } else if (driver?.rows && driver.rows.length > 0) {
    const idx = driver.selectedIndex ?? 0;
    const start = Math.max(0, Math.min(driver.rows.length - 3, idx));
    for (let i = start; i < Math.min(driver.rows.length, start + 3); i++) {
      const row = driver.rows[i];
      const cur = i === idx ? '>' : ' ';
      const chk = driver.kind === 'checklist' ? (row.checked ? '[x] ' : '[ ] ') : '';
      const label = row.raw[0] ?? '';
      const right = row.raw[1] ? ` | ${row.raw[1]}` : '';
      lines.push(clipLine42(`${cur} ${chk}${label}${right}`));
    }
  } else if (driver?.text) {
    // Keep explicit line breaks (one clipped row per line); only reflow single-line prose.
    const rows = driver.text.split('\n');
    const body = rows.length > 1 ? rows.map((r) => clipLine42(r, G2_MAX_COLS)) : wrapLine42(driver.text, G2_MAX_COLS);
    lines.push(...body.slice(0, 3));
  }

  const follower = surface.components[1];
  if (follower?.kind === 'timer' && follower.timer) {
    const tStr = formatFormulaValue(follower.timer.remainingSec, 'dur');
    lines.push(clipLine42(`${follower.label ?? 'Timer'}: ${tStr} [${follower.timer.status.toUpperCase()}]`));
  } else if (follower?.facts && follower.facts.length > 0) {
    const summary = follower.facts
      .slice(0, 2)
      .map((f) => `${f.label}: ${formatFormulaValue(evaluateSafeFormula(f.valueExpr, env), f.fmt)}`)
      .join(' | ');
    lines.push(clipLine42(summary));
  }

  lines.push('------------------------------------------');
  lines.push(clipLine42('TAP: ACT  SWIPE: MOVE  2xTAP: CORRIDOR'));
  const clipped = lines.slice(0, 7).map((l) => clipLine42(l, G2_MAX_COLS));
  return {
    header: clipped[0] ?? 'LIVEUI',
    lines: clipped,
    bodyText: clipped.join('\n'),
  };
}
