import type { NormalizedEvenEvent } from './types.js';

// Mirrors Even Hub SDK OsEventTypeList numeric values
export const EVEN_OS_EVENT = {
  CLICK_EVENT: 0,
  SCROLL_TOP_EVENT: 1,
  SCROLL_BOTTOM_EVENT: 2,
  DOUBLE_CLICK_EVENT: 3,
  FOREGROUND_ENTER_EVENT: 4,
  FOREGROUND_EXIT_EVENT: 5,
  ABNORMAL_EXIT_EVENT: 6,
  LONG_PRESS_EVENT: 7,
  LONG_PRESS_RELEASE_EVENT: 8,
} as const;

function asRecord(val: unknown): Record<string, unknown> | undefined {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return undefined;
}

function readNum(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

function readStr(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

function mapOsEventType(
  eventType: number | string | undefined,
  defaultZeroAsClick: boolean,
): NormalizedEvenEvent['kind'] {
  if (eventType === undefined || eventType === null) {
    return defaultZeroAsClick ? 'CLICK' : 'UNKNOWN';
  }
  if (typeof eventType === 'string') {
    const upper = eventType.toUpperCase();
    if (upper.includes('DOUBLE')) return 'DOUBLE_CLICK';
    if (upper.includes('LONG_PRESS_RELEASE') || upper.includes('LONGPRESS_RELEASE')) {
      return 'LONG_PRESS_RELEASE';
    }
    if (upper.includes('LONG_PRESS') || upper.includes('LONGPRESS')) return 'LONG_PRESS';
    if (upper.includes('SCROLL_TOP') || upper === 'UP') return 'SCROLL_UP';
    if (upper.includes('SCROLL_BOTTOM') || upper === 'DOWN') return 'SCROLL_DOWN';
    if (upper.includes('FOREGROUND_ENTER')) return 'FOREGROUND_ENTER';
    if (upper.includes('FOREGROUND_EXIT') || upper.includes('ABNORMAL_EXIT')) {
      return 'FOREGROUND_EXIT';
    }
    if (upper.includes('CLICK')) return 'CLICK';
  }
  const num = typeof eventType === 'number' ? eventType : Number(eventType);
  switch (num) {
    case EVEN_OS_EVENT.CLICK_EVENT:
      return 'CLICK';
    case EVEN_OS_EVENT.SCROLL_TOP_EVENT:
      return 'SCROLL_UP';
    case EVEN_OS_EVENT.SCROLL_BOTTOM_EVENT:
      return 'SCROLL_DOWN';
    case EVEN_OS_EVENT.DOUBLE_CLICK_EVENT:
      return 'DOUBLE_CLICK';
    case EVEN_OS_EVENT.FOREGROUND_ENTER_EVENT:
      return 'FOREGROUND_ENTER';
    case EVEN_OS_EVENT.FOREGROUND_EXIT_EVENT:
    case EVEN_OS_EVENT.ABNORMAL_EXIT_EVENT:
      return 'FOREGROUND_EXIT';
    case EVEN_OS_EVENT.LONG_PRESS_EVENT:
      return 'LONG_PRESS';
    case EVEN_OS_EVENT.LONG_PRESS_RELEASE_EVENT:
      return 'LONG_PRESS_RELEASE';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Proto3-safe normalizer for Even Hub SDK 0.0.16 events.
 * - Omitted eventType on sysEvent / textEvent / listEvent -> CLICK (0)
 * - Omitted currentSelectItemIndex on listEvent -> 0
 * - FOREGROUND_ENTER / FOREGROUND_EXIT never map to CLICK
 */
export function normalizeEvenEvent(raw: unknown): NormalizedEvenEvent {
  const root = asRecord(raw);
  if (!root) return { kind: 'UNKNOWN' };

  const audio = asRecord(root.audioEvent);
  if (audio && audio.audioPcm) {
    const rawPcm = audio.audioPcm;
    const pcm =
      rawPcm instanceof Uint8Array
        ? rawPcm.slice()
        : Array.isArray(rawPcm)
          ? Uint8Array.from(rawPcm as number[])
          : new Uint8Array(0);
    return { kind: 'AUDIO_PCM', audioPcm: pcm, rawType: 'audioEvent' };
  }

  const menu = asRecord(root.menuItemClickEvent);
  if (menu) {
    const itemId = readNum(menu, 'itemID', 'itemId', 'Item_ID');
    return { kind: 'MENU_CLICK', menuItemId: itemId, rawType: 'menuItemClickEvent' };
  }

  const list = asRecord(root.listEvent);
  if (list) {
    const et =
      readNum(list, 'eventType', 'Event_Type') ??
      readStr(list, 'eventType', 'Event_Type');
    const idx = readNum(list, 'currentSelectItemIndex', 'CurrentSelect_ItemIndex') ?? 0;
    const kind = mapOsEventType(et, true);
    return { kind, listIndex: idx, rawType: 'listEvent' };
  }

  const text = asRecord(root.textEvent);
  if (text) {
    const et =
      readNum(text, 'eventType', 'Event_Type') ??
      readStr(text, 'eventType', 'Event_Type');
    return { kind: mapOsEventType(et, true), rawType: 'textEvent' };
  }

  const sys = asRecord(root.sysEvent);
  if (sys) {
    const et =
      readNum(sys, 'eventType', 'Event_Type') ??
      readStr(sys, 'eventType', 'Event_Type');
    return { kind: mapOsEventType(et, true), rawType: 'sysEvent' };
  }

  return { kind: 'UNKNOWN' };
}

/**
 * Serializes BLE updates in a single FIFO queue and throttles image frames to <= 4 Hz.
 */
export class BlePaintQueue {
  private chain: Promise<void> = Promise.resolve();
  private lastImageAt = 0;
  private pendingTextTask: (() => Promise<void>) | null = null;
  private textScheduled = false;

  constructor(
    private readonly minImageIntervalMs = 250,
    private readonly nowFn: () => number = () => Date.now(),
  ) {}

  enqueueText(fn: () => Promise<void>): Promise<void> {
    this.pendingTextTask = fn;
    if (!this.textScheduled) {
      this.textScheduled = true;
      this.chain = this.chain.then(async () => {
        this.textScheduled = false;
        const task = this.pendingTextTask;
        this.pendingTextTask = null;
        if (task) await task();
      });
    }
    return this.chain;
  }

  enqueueImage(fn: () => Promise<void>, force = false): Promise<void> {
    this.chain = this.chain.then(async () => {
      const now = this.nowFn();
      if (!force && now - this.lastImageAt < this.minImageIntervalMs) {
        return;
      }
      this.lastImageAt = now;
      await fn();
    });
    return this.chain;
  }

  enqueueOp(fn: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(fn);
    return this.chain;
  }
}

export const PCM_SAMPLE_RATE = 16000;
export const PCM_MAX_SECONDS = 12;
export const PCM_MAX_BYTES = PCM_SAMPLE_RATE * 2 * PCM_MAX_SECONDS; // 384,000 bytes
export const MIN_VOICE_MS = 350;
export const MIN_VOICE_RMS = 0.012;

export function computePcmRms(pcm16Le: Uint8Array): number {
  const sampleCount = Math.floor(pcm16Le.byteLength / 2);
  if (sampleCount === 0) return 0;
  const view = new DataView(pcm16Le.buffer, pcm16Le.byteOffset, sampleCount * 2);
  let sumSq = 0;
  for (let i = 0; i < sampleCount; i++) {
    const s = view.getInt16(i * 2, true) / 32768;
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / sampleCount);
}

export function encodePcm16ToWav(pcm16Le: Uint8Array, sampleRate = PCM_SAMPLE_RATE): Uint8Array {
  const dataLen = pcm16Le.byteLength;
  const out = new Uint8Array(44 + dataLen);
  const view = new DataView(out.buffer);
  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataLen, true);
  out.set(pcm16Le, 44);
  return out;
}

export function parseWavToPcm16(wav: Uint8Array): { pcm16: Uint8Array; sampleRate: number } {
  if (wav.byteLength < 44) {
    throw new Error('Invalid WAV: shorter than 44-byte header');
  }
  const tag = String.fromCharCode(wav[0], wav[1], wav[2], wav[3]);
  const wave = String.fromCharCode(wav[8], wav[9], wav[10], wav[11]);
  if (tag !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Invalid WAV header');
  }
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const sampleRate = view.getUint32(24, true);
  let offset = 12;
  while (offset + 8 <= wav.byteLength) {
    const id = String.fromCharCode(
      wav[offset],
      wav[offset + 1],
      wav[offset + 2],
      wav[offset + 3],
    );
    const size = view.getUint32(offset + 4, true);
    if (id === 'data') {
      const start = offset + 8;
      const end = Math.min(wav.byteLength, start + size);
      return { pcm16: wav.slice(start, end), sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV missing data chunk');
}

export class PcmRingBuffer {
  private chunks: Uint8Array[] = [];
  private totalBytes = 0;

  push(chunk: Uint8Array): void {
    if (!chunk || chunk.byteLength === 0) return;
    if (this.totalBytes >= PCM_MAX_BYTES) return;
    const remaining = PCM_MAX_BYTES - this.totalBytes;
    // Defensive slice() so host buffer reuse never mutates buffered audio
    const copy = chunk.byteLength > remaining ? chunk.slice(0, remaining) : chunk.slice();
    this.chunks.push(copy);
    this.totalBytes += copy.byteLength;
  }

  getPcm16(): Uint8Array {
    const merged = new Uint8Array(this.totalBytes);
    let pos = 0;
    for (const c of this.chunks) {
      merged.set(c, pos);
      pos += c.byteLength;
    }
    return merged;
  }

  getDurationMs(): number {
    const samples = Math.floor(this.totalBytes / 2);
    return (samples / PCM_SAMPLE_RATE) * 1000;
  }

  getRms(): number {
    return computePcmRms(this.getPcm16());
  }

  passesSilenceGate(): { ok: boolean; rms: number; durationMs: number } {
    const durationMs = this.getDurationMs();
    const rms = this.getRms();
    return {
      ok: durationMs >= MIN_VOICE_MS && rms >= MIN_VOICE_RMS,
      rms,
      durationMs,
    };
  }

  toWav(): Uint8Array {
    return encodePcm16ToWav(this.getPcm16(), PCM_SAMPLE_RATE);
  }

  reset(): void {
    this.chunks = [];
    this.totalBytes = 0;
  }
}
