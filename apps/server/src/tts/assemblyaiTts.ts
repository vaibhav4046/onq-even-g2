import WebSocket from 'ws';
import type { TtsWordBoundary } from '@onq/core';
import { registerSecretForRedaction } from '../logger.js';
import type { AssemblyAiRegion, WebSocketLike, WsFactory } from '../stt/assemblyaiRealtime.js';

export interface TtsVoiceProfile {
  id: string;
  label: string;
  role: string;
  cloned?: boolean;
}

const BASE_VOICES: TtsVoiceProfile[] = [
  { id: 'aai-kyla', label: 'Kyla', role: 'Fast & crisp companion voice' },
  { id: 'aai-titus', label: 'Titus (Default)', role: 'Calm male voice that matches the OnQ avatar' },
  { id: 'aai-audrey', label: 'Audrey', role: 'Clear balanced brief tone' },
  { id: 'aai-sara', label: 'Sara', role: 'Concise executive voice' },
  { id: 'aai-ewald', label: 'Ewald', role: 'Warm deliberate narrator' },
];

export function listAvailableTtsVoices(): TtsVoiceProfile[] {
  const custom = process.env.ASSEMBLYAI_CLONED_VOICE_ID?.trim();
  if (custom) {
    registerSecretForRedaction(custom);
    return [
      ...BASE_VOICES,
      { id: custom, label: 'Custom 30s Clone', role: 'Matched regional voice clone', cloned: true },
    ];
  }
  return BASE_VOICES;
}

export function buildAssemblyAiTtsUrl(voiceId = 'aai-titus', region: AssemblyAiRegion = 'us'): string {
  const host = region === 'eu' ? 'wss://tts.eu.assemblyai.com/v1/ws' : 'wss://tts.us.assemblyai.com/v1/ws';
  const params = new URLSearchParams({
    voice_id: voiceId || 'aai-titus',
    language: 'english',
  });
  return `${host}?${params.toString()}`;
}

export interface TtsStreamCallbacks {
  onAudioChunk?: (audioBase64: string, flushId: number) => void;
  onWordBoundaries?: (words: TtsWordBoundary[], flushId: number, audioStartMs: number) => void;
  onFlushDone?: (flushId: number, audioDurationMs: number) => void;
  onError?: (msg: string) => void;
}

/**
 * Full-duplex AssemblyAI-TTS-1 streaming session with dynamic flush_id tracking,
 * WordBoundaries lip/orb sync, and instant barge-in cancel().
 */
export class AssemblyAiTtsSession {
  private ws: WebSocketLike | null = null;
  private isOpen = false;
  private sampleRate = 24000;
  private activeFlushId: number | null = null;

  constructor(
    private readonly options: {
      apiKey: string;
      voiceId?: string;
      region?: AssemblyAiRegion;
      callbacks?: TtsStreamCallbacks;
      wsFactory?: WsFactory;
    },
  ) {
    registerSecretForRedaction(options.apiKey);
  }

  async connect(): Promise<void> {
    const url = buildAssemblyAiTtsUrl(this.options.voiceId ?? 'aai-titus', this.options.region ?? 'us');
    const headers = { Authorization: this.options.apiKey };
    const ws = this.options.wsFactory
      ? this.options.wsFactory(url, headers)
      : (new WebSocket(url, { headers }) as unknown as WebSocketLike);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      ws.on('open', () => {
        this.isOpen = true;
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            type?: string;
            flush_id?: number;
            audio?: string;
            audio_duration_ms?: number;
            audio_start_ms?: number;
            words?: Array<{ word: string; start: number; end: number; confidence?: number }>;
            configuration?: { sample_rate?: number };
            error?: string;
          };

          if (msg.type === 'Configuration' && msg.configuration?.sample_rate) {
            this.sampleRate = msg.configuration.sample_rate;
          } else if (msg.type === 'Audio' && msg.audio) {
            const fid = Number(msg.flush_id ?? 0);
            this.activeFlushId = fid;
            this.options.callbacks?.onAudioChunk?.(msg.audio, fid);
          } else if (msg.type === 'FlushDone') {
            const fid = Number(msg.flush_id ?? 0);
            this.options.callbacks?.onFlushDone?.(fid, Number(msg.audio_duration_ms ?? 0));
          } else if (msg.type === 'WordBoundaries' && Array.isArray(msg.words)) {
            const fid = Number(msg.flush_id ?? 0);
            this.options.callbacks?.onWordBoundaries?.(
              msg.words,
              fid,
              Number(msg.audio_start_ms ?? 0),
            );
          } else if (msg.type === 'Error') {
            this.options.callbacks?.onError?.(msg.error ?? 'AssemblyAI TTS error');
          }
        } catch {
          // ignore
        }
      });

      ws.on('error', (err) => {
        this.options.callbacks?.onError?.(err.message);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      ws.on('close', () => {
        this.isOpen = false;
      });
    });
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  getActiveFlushId(): number | null {
    return this.activeFlushId;
  }

  generate(text: string): void {
    if (!this.isOpen || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type: 'Generate', text }));
  }

  flush(): void {
    if (!this.isOpen || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type: 'Flush' }));
  }

  /** Instant barge-in cancellation without tearing down the WebSocket connection. */
  cancel(): void {
    if (!this.isOpen || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type: 'Cancel' }));
  }

  terminate(): void {
    if (this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(JSON.stringify({ type: 'Terminate' }));
      } catch {
        // ignore
      }
      this.ws.close();
    }
    this.isOpen = false;
  }
}

export interface SynthesizedSpeechResult {
  engine: 'assemblyai-tts-1' | 'demo-timing';
  voiceId: string;
  sampleRate: number;
  audioChunksBase64: string[];
  wordBoundaries: TtsWordBoundary[];
  durationMs: number;
}

export function buildDemoWordBoundaries(text: string): {
  words: TtsWordBoundary[];
  durationMs: number;
} {
  const tokens = (text ?? '').trim().split(/\s+/).filter(Boolean);
  let cursor = 40;
  const words: TtsWordBoundary[] = tokens.map((word) => {
    const dur = Math.max(180, Math.min(480, word.length * 48));
    const entry = { word, start: cursor, end: cursor + dur, confidence: 1 };
    cursor += dur + 35;
    return entry;
  });
  return { words, durationMs: cursor };
}

/**
 * High-level single-turn speech synthesizer: uses live AssemblyAI-TTS-1 WebSocket when
 * ASSEMBLYAI_API_KEY is configured, or falls back cleanly to offline word timings.
 */
export async function synthesizeTtsUtterance(opts: {
  text: string;
  voiceId?: string;
  apiKey?: string;
  region?: AssemblyAiRegion;
  wsFactory?: WsFactory;
  timeoutMs?: number;
}): Promise<SynthesizedSpeechResult> {
  const voiceId = opts.voiceId ?? 'aai-titus';
  const apiKey = opts.apiKey ?? process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    const demo = buildDemoWordBoundaries(opts.text);
    return {
      engine: 'demo-timing',
      voiceId,
      sampleRate: 24000,
      audioChunksBase64: [],
      wordBoundaries: demo.words,
      durationMs: demo.durationMs,
    };
  }

  const chunks: string[] = [];
  let words: TtsWordBoundary[] = [];
  let durationMs = 0;

  let resolveDone: (() => void) | null = null;
  const donePromise = new Promise<void>((res) => {
    resolveDone = res;
  });

  const session = new AssemblyAiTtsSession({
    apiKey,
    voiceId,
    region: opts.region ?? (process.env.ASSEMBLYAI_REGION === 'eu' ? 'eu' : 'us'),
    wsFactory: opts.wsFactory,
    callbacks: {
      onAudioChunk: (b64) => chunks.push(b64),
      onWordBoundaries: (wb) => {
        words = wb;
        if (durationMs > 0) resolveDone?.();
      },
      onFlushDone: (_fid, dur) => {
        durationMs = dur;
        // Wait briefly for WordBoundaries frame that arrives right after FlushDone
        setTimeout(() => resolveDone?.(), 180);
      },
      onError: () => resolveDone?.(),
    },
  });

  try {
    await session.connect();
    session.generate(opts.text);
    session.flush();
    await Promise.race([
      donePromise,
      new Promise<void>((r) => setTimeout(r, opts.timeoutMs ?? 8000)),
    ]);
    session.terminate();
  } catch {
    session.terminate();
  }

  if (chunks.length === 0) {
    const demo = buildDemoWordBoundaries(opts.text);
    return {
      engine: 'demo-timing',
      voiceId,
      sampleRate: 24000,
      audioChunksBase64: [],
      wordBoundaries: demo.words,
      durationMs: demo.durationMs,
    };
  }

  return {
    engine: 'assemblyai-tts-1',
    voiceId,
    sampleRate: session.getSampleRate(),
    audioChunksBase64: chunks,
    wordBoundaries: words.length > 0 ? words : buildDemoWordBoundaries(opts.text).words,
    durationMs: durationMs || buildDemoWordBoundaries(opts.text).durationMs,
  };
}
