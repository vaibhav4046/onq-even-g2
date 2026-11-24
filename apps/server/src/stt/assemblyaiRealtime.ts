import WebSocket from 'ws';
import { registerSecretForRedaction } from '../logger.js';

export type AssemblyAiSttMode = 'agent' | 'meeting';
export type AssemblyAiRegion = 'us' | 'eu';

export interface StreamingTurnEvent {
  type: 'Begin' | 'Turn' | 'Termination' | 'Error';
  sessionId?: string;
  transcript?: string;
  endOfTurn?: boolean;
  speakerLabel?: string;
  error?: string;
}

export interface WebSocketLike {
  readyState: number;
  send(data: string | Buffer | Uint8Array, options?: { binary?: boolean }): void;
  close(): void;
  on(event: 'open', cb: () => void): void;
  on(event: 'message', cb: (data: WebSocket.RawData) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'close', cb: (code: number, reason: Buffer) => void): void;
}

export type WsFactory = (url: string, headers: Record<string, string>) => WebSocketLike;

export function buildAssemblyAiSttUrl(opts: {
  mode: AssemblyAiSttMode;
  region?: AssemblyAiRegion;
  sampleRate?: number;
}): string {
  const host =
    opts.region === 'eu'
      ? 'wss://streaming.eu.assemblyai.com/v3/ws'
      : 'wss://streaming.assemblyai.com/v3/ws';
  const speechModel =
    opts.mode === 'agent'
      ? 'assemblyai-stt-3-7-realtime-agent'
      : 'assemblyai-stt-3-7-realtime';
  // NOTE: Do not pass deprecated Universal-Streaming params (end_of_turn_confidence_threshold / format_turns) on 3.7 models.
  const params = new URLSearchParams({
    speech_model: speechModel,
    speaker_labels: 'true',
    sample_rate: String(opts.sampleRate ?? 16000),
    encoding: 'pcm_s16le',
  });
  return `${host}?${params.toString()}`;
}

/**
 * Dual-mode AssemblyAI Streaming v3 STT client (STT-3.7 realtime-agent & realtime).
 * Streams raw binary 16 kHz mono pcm_s16le frames (never base64 JSON).
 */
export class AssemblyAiRealtimeSession {
  private ws: WebSocketLike | null = null;
  private isOpen = false;
  private pendingFrames: Uint8Array[] = [];
  private closed = false;

  constructor(
    private readonly options: {
      apiKey: string;
      mode: AssemblyAiSttMode;
      region?: AssemblyAiRegion;
      sampleRate?: number;
      onEvent: (ev: StreamingTurnEvent) => void;
      wsFactory?: WsFactory;
    },
  ) {
    registerSecretForRedaction(options.apiKey);
  }

  async connect(): Promise<void> {
    if (this.closed) return;
    const url = buildAssemblyAiSttUrl({
      mode: this.options.mode,
      region: this.options.region,
      sampleRate: this.options.sampleRate,
    });
    const headers = { Authorization: this.options.apiKey };
    const ws = this.options.wsFactory
      ? this.options.wsFactory(url, headers)
      : (new WebSocket(url, { headers }) as unknown as WebSocketLike);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      ws.on('open', () => {
        this.isOpen = true;
        while (this.pendingFrames.length > 0 && this.isOpen) {
          const frame = this.pendingFrames.shift()!;
          ws.send(Buffer.from(frame), { binary: true });
        }
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString()) as {
            type?: string;
            id?: string;
            transcript?: string;
            end_of_turn?: boolean;
            speaker_label?: string;
            speaker?: string;
            error?: string;
          };
          if (parsed.type === 'Begin') {
            this.options.onEvent({ type: 'Begin', sessionId: parsed.id });
          } else if (parsed.type === 'Turn') {
            this.options.onEvent({
              type: 'Turn',
              transcript: parsed.transcript ?? '',
              endOfTurn: Boolean(parsed.end_of_turn),
              speakerLabel: parsed.speaker_label ?? parsed.speaker ?? 'PENDING',
            });
          } else if (parsed.type === 'Termination') {
            this.options.onEvent({ type: 'Termination' });
          } else if (parsed.type === 'Error') {
            this.options.onEvent({ type: 'Error', error: parsed.error ?? 'AssemblyAI STT error' });
          }
        } catch {
          // ignore malformed keepalive
        }
      });

      ws.on('error', (err) => {
        this.options.onEvent({ type: 'Error', error: err.message });
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

  /** Streams raw 16 kHz mono pcm_s16le binary frame directly over WebSocket. */
  sendAudioPcm(pcm16: Uint8Array): void {
    if (this.closed) return;
    if (!this.isOpen || !this.ws || this.ws.readyState !== 1) {
      if (this.pendingFrames.length < 40) {
        this.pendingFrames.push(pcm16.slice());
      }
      return;
    }
    this.ws.send(Buffer.from(pcm16), { binary: true });
  }

  terminate(): void {
    this.closed = true;
    this.pendingFrames = [];
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
