/**
 * Pure helpers for the Connect section: tolerant parsing of the host profile / sources / outbox payloads and the
 * honest wording for routes, speed, age and the pairing countdown. No React, no fetch, no clock reads (callers pass `now`).
 */

export type SourceId = 'calendar' | 'gmail' | 'notion' | 'telegram';
export type SourceMode = 'auto' | 'computer' | 'api';
export type Effective = 'api' | 'browser' | 'sample' | 'off';

export const SOURCE_IDS: readonly SourceId[] = ['calendar', 'gmail', 'notion', 'telegram'];
export const SOURCE_NAME: Record<SourceId, string> = { calendar: 'Calendar', gmail: 'Mail', notion: 'Notion', telegram: 'Telegram' };

export interface SourceRow {
  id: SourceId;
  /** null when the server does not report a chosen mode (profile fallback). */
  mode: SourceMode | null;
  effective: Effective;
  reason: string;
  p50Ms: number | null;
  lastSyncAt: string | null;
  stale: boolean;
  staleReason: string;
  breakerOpen: boolean;
}

export interface HarnessView {
  id: string;
  kind: string;
  status: string;
  models: string[];
  probeMs: number | null;
}

export interface HostView {
  name: string | null;
  platform: string | null;
  uptimeSec: number | null;
  routing: { preferredLlm: string; preferredModel: string | null } | null;
  harnesses: HarnessView[];
  dataSources: Array<{ id: SourceId; effective: Effective; reason: string }>;
}

export interface DeviceRow {
  id: string;
  label: string;
  createdAt: string | null;
  lastSeen: string | null;
}

export type OutboxStatus = 'queued' | 'running' | 'done' | 'failed' | 'undone';
export interface OutboxRow {
  id: string;
  label: string;
  status: OutboxStatus;
  attempts: number;
  error: string;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isSourceId = (v: unknown): v is SourceId => SOURCE_IDS.includes(v as SourceId);
const isEffective = (v: unknown): v is Effective => v === 'api' || v === 'browser' || v === 'sample' || v === 'off';
const asList = (v: unknown, key: string): unknown[] => (Array.isArray(v) ? v : isRec(v) && Array.isArray(v[key]) ? (v[key] as unknown[]) : []);

/** Reads /api/host/profile. The server nests harnesses as { items: [...] }; a bare array is accepted too. */
export function normalizeProfile(raw: unknown): HostView | null {
  if (!isRec(raw) || raw.unchanged === true) return null;
  const host = isRec(raw.host) ? raw.host : {};
  const routing = isRec(raw.routing) ? raw.routing : null;
  const harnesses = asList(raw.harnesses, 'items')
    .filter(isRec)
    .map((h): HarnessView | null => {
      const id = str(h.id);
      if (!id) return null;
      const models = Array.isArray(h.models) ? h.models.filter((m): m is string => typeof m === 'string') : [];
      return { id, kind: str(h.kind) ?? 'cli', status: str(h.status) ?? 'error', models, probeMs: num(h.lastProbeMs) ?? num(h.probeMs) };
    })
    .filter((h): h is HarnessView => h !== null);
  const dataSources = asList(raw.dataSources, 'items')
    .filter(isRec)
    .flatMap((d) => {
      const id = d.source ?? d.id;
      const effective = d.mode ?? d.effective;
      return isSourceId(id) && isEffective(effective) ? [{ id, effective, reason: str(d.evidence) ?? str(d.reason) ?? '' }] : [];
    });
  return {
    name: str(host.name),
    platform: str(host.platform),
    uptimeSec: num(host.uptimeSec),
    routing: routing ? { preferredLlm: str(routing.preferredLlm) ?? 'auto', preferredModel: str(routing.preferredModel) } : null,
    harnesses,
    dataSources,
  };
}

/** Reads GET /api/sources: the server sends { revision, sources: [{ source, ... }] }; a bare array with `id` is accepted too. */
export function normalizeSources(raw: unknown): SourceRow[] {
  return asList(raw, 'sources')
    .filter(isRec)
    .flatMap((s): SourceRow[] => {
      const id = s.source ?? s.id;
      if (!isSourceId(id) || !isEffective(s.effective)) return [];
      const mode = s.mode === 'auto' || s.mode === 'computer' || s.mode === 'api' ? s.mode : null;
      return [{
        id,
        mode,
        effective: s.effective,
        reason: str(s.reason) ?? str(s.evidence) ?? '',
        p50Ms: num(s.p50Ms),
        lastSyncAt: str(s.lastSyncAt),
        stale: s.stale === true,
        staleReason: str(s.staleReason) ?? '',
        breakerOpen: s.breaker === 'open',
      }];
    });
}

/** When /api/sources is missing, show only what the profile really says: route and evidence, nothing measured. */
export function sourcesFromProfile(view: HostView | null): SourceRow[] {
  return (view?.dataSources ?? []).map((d) => ({
    id: d.id, mode: null, effective: d.effective, reason: d.reason, p50Ms: null, lastSyncAt: null, stale: false, staleReason: '', breakerOpen: false,
  }));
}

export function normalizeDevices(raw: unknown): DeviceRow[] {
  return asList(raw, 'devices')
    .filter(isRec)
    .flatMap((d) => (str(d.id) ? [{ id: str(d.id) as string, label: str(d.label) ?? 'device', createdAt: str(d.createdAt), lastSeen: str(d.lastSeen) }] : []));
}

const OUTBOX_STATUS: readonly OutboxStatus[] = ['queued', 'running', 'done', 'failed', 'undone'];
/** Reads GET /api/outbox: { items: [{ id, title, status, attempts, reason }] }; `label` and `error` are accepted as aliases. */
export function normalizeOutbox(raw: unknown): OutboxRow[] {
  return asList(raw, 'items')
    .filter(isRec)
    .flatMap((o): OutboxRow[] => {
      const id = str(o.id);
      const status = OUTBOX_STATUS.find((s) => s === o.status);
      return id && status ? [{ id, label: str(o.title) ?? str(o.label) ?? id, status, attempts: num(o.attempts) ?? 0, error: str(o.reason) ?? str(o.error) ?? '' }] : [];
    });
}

const ROUTE_LABEL: Record<Effective, string> = { api: 'API', browser: 'Computer', sample: 'Sample', off: 'Off' };
export const routeLabel = (e: Effective): string => ROUTE_LABEL[e];

export const MODE_LABEL: Record<SourceMode, string> = { auto: 'Auto', computer: 'This computer', api: 'API' };

/** "about 0.6 s" only from a real measured p50. Anything else is "not measured". */
export function speedLabel(p50Ms: number | null): string {
  if (p50Ms === null || !Number.isFinite(p50Ms) || p50Ms < 0) return 'not measured';
  if (p50Ms >= 60_000) return `about ${Math.round(p50Ms / 60_000)} min`;
  const s = Math.round(p50Ms / 100) / 10;
  return s === 0 ? 'under 0.1 s' : `about ${s.toFixed(1)} s`;
}

/** Age of a timestamp as short plain text. `never` is what to say for a missing timestamp. */
export function ageLabel(iso: string | null, nowMs: number, never = 'never'): string {
  if (!iso) return never;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  const sec = Math.floor((nowMs - t) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec} s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)} h ago`;
  return `${Math.floor(sec / 86_400)} d ago`;
}

/** m:ss for the pairing code countdown. Never negative. */
export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const groupCode = (code: string): string => (/^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code);

export function formatUptime(sec: number | null): string {
  if (sec === null || sec < 0) return '';
  if (sec < 3600) return `up ${Math.max(1, Math.round(sec / 60))} min`;
  if (sec < 86_400) return `up ${Math.round(sec / 3600)} h`;
  return `up ${Math.round(sec / 86_400)} d`;
}

export function sourceWarnings(row: SourceRow): string[] {
  const out: string[] = [];
  if (row.breakerOpen) out.push('Paused after repeated failures. It will retry on its own.');
  if (row.stale) out.push(row.staleReason ? `Data may be out of date: ${row.staleReason}` : 'Data may be out of date.');
  return out;
}

export function isLoopbackUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h);
  } catch {
    return false;
  }
}

const HARNESS_NAME: Record<string, string> = {
  claude_cli: 'Claude Code',
  codex_cli: 'Codex',
  opencode_cli: 'OpenCode',
  gemini_cli: 'Gemini CLI',
  cursor_cli: 'Cursor',
  cline_cli: 'Cline',
  hermes_cli: 'Hermes',
  openbot_cli: 'OpenBot',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  omniroute: 'OmniRoute',
};
export const harnessName = (id: string): string =>
  HARNESS_NAME[id] ?? id.replace(/_cli$/, '').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

const HARNESS_STATUS: Record<string, string> = {
  connected: 'Found, not tested',
  needs_auth: 'Needs sign-in',
  needs_check: 'Needs a check',
  not_installed: 'Not installed',
  error: 'Error',
};
export const harnessStatusLabel = (s: string): string => HARNESS_STATUS[s] ?? s;
