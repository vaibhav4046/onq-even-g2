import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createOnQServer } from '../src/server.js';
import { redactSecrets, registerSecretForRedaction } from '../src/logger.js';
import {
  AssemblyAiRealtimeSession,
  buildAssemblyAiSttUrl,
} from '../src/stt/assemblyaiRealtime.js';
import type { WebSocketLike, WsFactory } from '../src/stt/assemblyaiRealtime.js';
import {
  AssemblyAiTtsSession,
  buildAssemblyAiTtsUrl,
  listAvailableTtsVoices,
  synthesizeTtsUtterance,
} from '../src/tts/assemblyaiTts.js';

class MockSocket extends EventEmitter implements WebSocketLike {
  readyState = 1;
  sent: Array<{ data: string | Buffer | Uint8Array; binary?: boolean }> = [];
  closed = false;

  send(data: string | Buffer | Uint8Array, options?: { binary?: boolean }): void {
    this.sent.push({ data, binary: options?.binary });
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.emit('close', 1000, Buffer.from(''));
  }

  emitOpen(): void {
    this.emit('open');
  }

  emitJson(obj: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(obj)));
  }
}

const closers: Array<() => Promise<void>> = [];
const origAssemblyKey = process.env.ASSEMBLYAI_API_KEY;
const origClonedVoice = process.env.ASSEMBLYAI_CLONED_VOICE_ID;

afterEach(async () => {
  while (closers.length > 0) {
    const fn = closers.pop();
    if (fn) await fn();
  }
  if (origAssemblyKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
  else process.env.ASSEMBLYAI_API_KEY = origAssemblyKey;
  if (origClonedVoice === undefined) delete process.env.ASSEMBLYAI_CLONED_VOICE_ID;
  else process.env.ASSEMBLYAI_CLONED_VOICE_ID = origClonedVoice;
});

async function startServerClean(extra: Parameters<typeof createOnQServer>[0] = {}) {
  delete process.env.ASSEMBLYAI_API_KEY;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-aai-test-'));
  const srv = await createOnQServer({
    port: 0,
    dataDir,
    allowTestFaultControls: true,
    ...extra,
  });
  closers.push(async () => {
    await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return srv;
}

describe('AssemblyAI 2026 voice stack & Meeting Lifecycle server suite', () => {
  it('1. buildAssemblyAiSttUrl selects STT-3.7 agent vs realtime and drops deprecated params', () => {
    const agentUrl = buildAssemblyAiSttUrl({ mode: 'agent', region: 'us' });
    const meetingUrl = buildAssemblyAiSttUrl({ mode: 'meeting', region: 'eu' });

    expect(agentUrl).toContain('wss://streaming.assemblyai.com/v3/ws');
    expect(agentUrl).toContain('speech_model=assemblyai-stt-3-7-realtime-agent');
    expect(agentUrl).toContain('speaker_labels=true');
    expect(agentUrl).toContain('encoding=pcm_s16le');
    expect(agentUrl).not.toContain('end_of_turn_confidence_threshold');
    expect(agentUrl).not.toContain('format_turns');

    expect(meetingUrl).toContain('wss://streaming.eu.assemblyai.com/v3/ws');
    expect(meetingUrl).toContain('speech_model=assemblyai-stt-3-7-realtime');
  });

  it('2. AssemblyAiRealtimeSession streams raw binary PCM16 frames and parses Begin/Turn/Termination', async () => {
    let mockWs!: MockSocket;
    let capturedHeaders: Record<string, string> = {};
    const events: Array<{ type: string; transcript?: string; speakerLabel?: string }> = [];

    const factory: WsFactory = (_url, headers) => {
      capturedHeaders = headers;
      mockWs = new MockSocket();
      setTimeout(() => mockWs.emitOpen(), 5);
      return mockWs;
    };

    const sess = new AssemblyAiRealtimeSession({
      apiKey: 'fake-test-assembly-key-0001',
      mode: 'meeting',
      wsFactory: factory,
      onEvent: (ev) => events.push(ev),
    });

    // Queue a pre-open frame before connect completes
    sess.sendAudioPcm(new Uint8Array([1, 2, 3, 4]));
    await sess.connect();
    expect(capturedHeaders.Authorization).toBe('fake-test-assembly-key-0001');
    expect(mockWs.sent.length).toBe(1);
    expect(mockWs.sent[0].binary).toBe(true);

    sess.sendAudioPcm(new Uint8Array([5, 6, 7, 8]));
    expect(mockWs.sent[1].binary).toBe(true);

    mockWs.emitJson({ type: 'Begin', id: 'sess-1' });
    mockWs.emitJson({ type: 'Turn', transcript: 'Lock Q4 launch', end_of_turn: true, speaker_label: 'Speaker B' });
    mockWs.emitJson({ type: 'Termination' });
    sess.terminate();

    expect(events.map((e) => e.type)).toEqual(['Begin', 'Turn', 'Termination']);
    expect(events[1].speakerLabel).toBe('Speaker B');
    expect(String(mockWs.sent[mockWs.sent.length - 1].data)).toContain('"Terminate"');
  });

  it('3. buildAssemblyAiTtsUrl & listAvailableTtsVoices expose 5 base voices + optional clone', () => {
    delete process.env.ASSEMBLYAI_CLONED_VOICE_ID;
    const base = listAvailableTtsVoices();
    expect(base.map((v) => v.id)).toEqual(['aai-kyla', 'aai-titus', 'aai-audrey', 'aai-sara', 'aai-ewald']);

    process.env.ASSEMBLYAI_CLONED_VOICE_ID = 'clone-voice-test-1';
    const withClone = listAvailableTtsVoices();
    expect(withClone.some((v) => v.id === 'clone-voice-test-1' && v.cloned)).toBe(true);

    expect(buildAssemblyAiTtsUrl('aai-titus', 'eu')).toBe(
      'wss://tts.eu.assemblyai.com/v1/ws?voice_id=aai-titus&language=english',
    );
  });

  it('4. AssemblyAiTtsSession tracks WordBoundaries and sends Cancel on barge-in', async () => {
    let mockWs!: MockSocket;
    const boundaries: string[] = [];
    let audioChunks = 0;

    const factory: WsFactory = () => {
      mockWs = new MockSocket();
      setTimeout(() => mockWs.emitOpen(), 5);
      return mockWs;
    };

    const tts = new AssemblyAiTtsSession({
      apiKey: 'fake-test-assembly-key-0002',
      voiceId: 'aai-kyla',
      wsFactory: factory,
      callbacks: {
        onAudioChunk: () => {
          audioChunks++;
        },
        onWordBoundaries: (words) => {
          boundaries.push(...words.map((w) => w.word));
        },
      },
    });

    await tts.connect();
    tts.generate('Investor approved Q4');
    tts.flush();
    mockWs.emitJson({ type: 'Configuration', configuration: { sample_rate: 24000 } });
    mockWs.emitJson({ type: 'Audio', flush_id: 1, audio: Buffer.from([0, 1]).toString('base64') });
    mockWs.emitJson({
      type: 'WordBoundaries',
      flush_id: 1,
      words: [
        { word: 'Investor', start: 40, end: 220, confidence: 0.99 },
        { word: 'approved', start: 230, end: 520, confidence: 0.98 },
      ],
    });
    tts.cancel();

    expect(audioChunks).toBe(1);
    expect(boundaries).toEqual(['Investor', 'approved']);
    expect(mockWs.sent.some((m) => String(m.data).includes('"Cancel"'))).toBe(true);
    tts.terminate();
  });

  it('5. synthesizeTtsUtterance falls back cleanly to demo-timing when no API key is set', async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    const out = await synthesizeTtsUtterance({ text: 'VC sync moved fifteen minutes' });
    expect(out.engine).toBe('demo-timing');
    expect(out.audioChunksBase64).toEqual([]);
    expect(out.wordBoundaries.length).toBeGreaterThanOrEqual(4);
  });

  it('6. /api/health reports OnQ identity, zero-key voiceEngine, and TTS voices', async () => {
    const srv = await startServerClean();
    const res = await fetch(`${srv.url}/api/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { brand: string; voiceEngine: string; ttsVoices: unknown[] };
    expect(json.brand).toBe('OnQ');
    expect(json.voiceEngine).toBeTruthy();
    expect(json.ttsVoices.length).toBeGreaterThanOrEqual(5);
  });

  it('7. /api/tts/voices lists hardware-honest earbuds note & /api/tts/speak validates body', async () => {
    const srv = await startServerClean();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };

    const voicesRes = await fetch(`${srv.url}/api/tts/voices`);
    const voicesJson = (await voicesRes.json()) as { hardwareNote: string; voices: unknown[] };
    expect(voicesJson.hardwareNote).toContain('no speaker');
    expect(voicesJson.voices.length).toBeGreaterThanOrEqual(5);

    const speakRes = await fetch(`${srv.url}/api/tts/speak`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Ready for Q4 sync', voiceId: 'aai-titus' }),
    });
    expect(speakRes.status).toBe(200);
    const spoken = (await speakRes.json()) as { engine: string; wordBoundaries: unknown[] };
    expect(spoken.engine).toBe('demo-timing');
    expect(spoken.wordBoundaries.length).toBe(4);
  });

  it('8. /api/meeting/start -> /turn -> /ask -> /wrapup -> /wipe completes full lifecycle in RAM', async () => {
    const srv = await startServerClean();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    const startRes = await fetch(`${srv.url}/api/meeting/start`, { method: 'POST', headers, body: '{}' });
    expect(startRes.status).toBe(200);

    const turnRes = await fetch(`${srv.url}/api/meeting/turn`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ speakerLabel: 'Speaker B', text: 'Send Q4 deck to Partner by Thursday 15:00.' }),
    });
    expect(turnRes.status).toBe(200);

    const askRes = await fetch(`${srv.url}/api/meeting/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: 'What did Investor ask about Q4?' }),
    });
    expect(askRes.status).toBe(200);
    const askJson = (await askRes.json()) as { readOnlyAnswer: boolean; lines: string[]; speech: { wordBoundaries: unknown[] } };
    expect(askJson.readOnlyAnswer).toBe(true);
    expect(askJson.lines[0]).toContain('Q4 deck');
    expect(askJson.speech.wordBoundaries.length).toBeGreaterThan(0);

    const wrapRes = await fetch(`${srv.url}/api/meeting/wrapup`, { method: 'POST', headers, body: '{}' });
    expect(wrapRes.status).toBe(200);
    const wrapJson = (await wrapRes.json()) as { preview: { defaultSelection: string; operations: Array<{ provider: string }> } };
    expect(wrapJson.preview.defaultSelection).toBe('NO');
    expect(wrapJson.preview.operations.some((op) => op.provider === 'NOTION')).toBe(true);

    const wipeRes = await fetch(`${srv.url}/api/meeting/wipe`, { method: 'POST', headers, body: '{}' });
    expect(wipeRes.status).toBe(200);
  });

  it('9. /api/meeting/wrapup hard-locks with HTTP 409 when follow-up slot hits busy calendar block', async () => {
    const srv = await startServerClean();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    await fetch(`${srv.url}/api/meeting/demo-run`, { method: 'POST', headers, body: '{}' });
    // Demo sandbox already has a busy block at 14:45..15:15 UTC
    const conflictRes = await fetch(`${srv.url}/api/meeting/wrapup`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ followUpIso: '2026-11-24T14:45:00.000Z' }),
    });
    expect(conflictRes.status).toBe(409);
  });

  it('10. /api/meeting/turn audits CODE_GUARD when non-wearer attempts voice confirmation', async () => {
    const srv = await startServerClean();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    await fetch(`${srv.url}/api/meeting/start`, { method: 'POST', headers, body: '{}' });
    await fetch(`${srv.url}/api/meeting/turn`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ speakerLabel: 'Speaker B', text: 'OnQ, confirm action', rms: 0.08 }),
    });

    const stateRes = await fetch(`${srv.url}/api/workspace/state`, { headers: { Authorization: `Bearer ${sessionToken}` } });
    const stateJson = (await stateRes.json()) as { auditLog: Array<{ kind: string; detail: string }> };
    expect(stateJson.auditLog.some((a) => a.kind === 'CODE_GUARD' && a.detail.includes('NON_WEARER_SPEAKER'))).toBe(true);
  });

  it('11. WS /api/voice/stream rejects missing token cleanly', async () => {
    const srv = await startServerClean();
    const wsUrl = srv.url.replace(/^http/, 'ws') + '/api/voice/stream';
    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.once('error', () => resolve());
        ws.once('close', () => resolve());
        ws.once('open', () => reject(new Error('Should not open without token')));
      }),
    ).resolves.toBeUndefined();
  });

  it('12. WS /api/voice/stream measures binary PCM RMS, handles barge_in, and wipes RAM on close', async () => {
    const srv = await startServerClean();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const wsUrl = `${srv.url.replace(/^http/, 'ws')}/api/voice/stream?token=${encodeURIComponent(sessionToken)}`;
    const received: Array<{ type?: string; rms?: number }> = [];

    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.on('message', (raw) => {
      received.push(JSON.parse(raw.toString()) as { type?: string; rms?: number });
    });

    ws.send(JSON.stringify({ type: 'mode', mode: 'meeting' }));
    const pcm = Buffer.alloc(640);
    pcm.writeInt16LE(9000, 0);
    pcm.writeInt16LE(-9000, 2);
    ws.send(pcm, { binary: true });
    ws.send(JSON.stringify({ type: 'barge_in' }));

    await new Promise((r) => setTimeout(r, 120));
    ws.close();
    await new Promise((r) => setTimeout(r, 80));

    expect(received.some((m) => m.type === 'orb_rms' && (m.rms ?? 0) > 0)).toBe(true);
    expect(received.some((m) => m.type === 'tts_cancelled')).toBe(true);

    const stateRes = await fetch(`${srv.url}/api/workspace/state`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const stateJson = (await stateRes.json()) as { auditLog: Array<{ kind: string }> };
    expect(stateJson.auditLog.some((a) => a.kind === 'MEETING_WIPE')).toBe(true);
  });

  it('13. logger redactSecrets scrubs registered 32-hex API keys from all telemetry', () => {
    const syntheticKey = 'deadbeefcafebabe0011223344556677';
    registerSecretForRedaction(syntheticKey);
    const scrubbed = redactSecrets(`Authorization=${syntheticKey} url=wss://example?k=${syntheticKey}`);
    expect(scrubbed).not.toContain(syntheticKey);
    expect(scrubbed).toContain('[REDACTED]');
  });

  it('14. /api/meeting/demo-run populates 2 diarized speakers, decision, and action item', async () => {
    const srv = await startServerClean();
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as {
      sessionToken: string;
    };
    const res = await fetch(`${srv.url}/api/meeting/demo-run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { speakerCount: number; decisions: unknown[]; actions: unknown[] };
    expect(json.speakerCount).toBe(2);
    expect(json.decisions.length).toBeGreaterThanOrEqual(1);
    expect(json.actions.length).toBeGreaterThanOrEqual(1);
  });
});
