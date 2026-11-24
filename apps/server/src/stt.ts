import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  computePcmRms,
  MIN_VOICE_MS,
  MIN_VOICE_RMS,
  parseWavToPcm16,
  PCM_MAX_BYTES,
} from '@oncue/core';
import { registerSecretForRedaction } from './logger.js';

const execFileAsync = promisify(execFile);

export const MAX_WAV_UPLOAD_BYTES = 512 * 1024; // 512 KB cap

export interface SttResult {
  transcript: string;
  rms: number;
  durationMs: number;
  rejectedSilent: boolean;
  sttEngine: string;
}

export interface SttOptions {
  presetTranscript?: string;
  whisperCppBin?: string;
  whisperModelPath?: string;
  openAiKey?: string;
  enableLocalFasterWhisper?: boolean;
  fasterWhisperScriptPath?: string;
  pythonBin?: string;
  fetchImpl?: typeof fetch;
}

function resolveDefaultFasterWhisperScript(): string {
  const candidates = [
    path.resolve(process.cwd(), 'scripts', 'local-whisper-stt.py'),
    path.resolve(process.cwd(), '..', '..', 'scripts', 'local-whisper-stt.py'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

/**
 * Accepts 16 kHz mono PCM16 WAV, enforces size & RMS silence gate, and routes to:
 * 1) Explicit demo preset clip (when X-OnCue-Preset header is sent in sandbox/CI)
 * 2) Local whisper.cpp binary (WHISPER_CPP_BIN + WHISPER_MODEL_PATH)
 * 3) Local faster-whisper Python runtime (scripts/local-whisper-stt.py)
 * 4) Optional OpenAI Whisper endpoint (OPENAI_API_KEY)
 * Never fabricates a hardcoded phrase if no engine is available (returns HTTP 503).
 */
export async function transcribeWavBuffer(
  wavBytes: Uint8Array,
  opts: SttOptions = {},
): Promise<SttResult> {
  if (wavBytes.byteLength > MAX_WAV_UPLOAD_BYTES) {
    throw Object.assign(new Error(`Audio payload ${wavBytes.byteLength} exceeds 512 KB limit`), {
      statusCode: 413,
    });
  }

  const { pcm16, sampleRate } = parseWavToPcm16(wavBytes);
  if (pcm16.byteLength > PCM_MAX_BYTES) {
    throw Object.assign(new Error('Audio exceeds 12-second recording limit'), { statusCode: 413 });
  }

  const sampleCount = Math.floor(pcm16.byteLength / 2);
  const durationMs = (sampleCount / (sampleRate || 16000)) * 1000;
  const rms = computePcmRms(pcm16);

  if (durationMs < MIN_VOICE_MS || rms < MIN_VOICE_RMS) {
    return {
      transcript: '',
      rms,
      durationMs,
      rejectedSilent: true,
      sttEngine: 'rms-silence-gate',
    };
  }

  // 1. Explicit demo preset clip (for browser preset WAV buttons & deterministic CI)
  if (opts.presetTranscript && opts.presetTranscript.trim().length > 0) {
    return {
      transcript: opts.presetTranscript.trim(),
      rms,
      durationMs,
      rejectedSilent: false,
      sttEngine: 'local-wav-demo-decoder',
    };
  }

  // 2. Local whisper.cpp binary if installed & configured (safe execFile array args, zero shell)
  const whisperBin = opts.whisperCppBin ?? process.env.WHISPER_CPP_BIN;
  const whisperModel = opts.whisperModelPath ?? process.env.WHISPER_MODEL_PATH;
  if (whisperBin && whisperModel && fs.existsSync(whisperBin) && fs.existsSync(whisperModel)) {
    const tmpFile = path.join(os.tmpdir(), `oncue-stt-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);
    fs.writeFileSync(tmpFile, wavBytes);
    try {
      const { stdout } = await execFileAsync(
        whisperBin,
        ['-m', whisperModel, '-f', tmpFile, '-nt', '-np'],
        { timeout: 15_000 },
      );
      const cleaned = stdout.trim();
      if (cleaned) {
        return {
          transcript: cleaned,
          rms,
          durationMs,
          rejectedSilent: false,
          sttEngine: 'whisper.cpp-local',
        };
      }
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
  }

  // 3. Local faster-whisper Python runtime (for real browser microphone recordings)
  const allowFasterWhisper =
    opts.enableLocalFasterWhisper ?? process.env.NODE_ENV !== 'test';
  const fwScript = opts.fasterWhisperScriptPath ?? resolveDefaultFasterWhisperScript();
  if (allowFasterWhisper && fs.existsSync(fwScript)) {
    const tmpFile = path.join(os.tmpdir(), `oncue-fw-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);
    fs.writeFileSync(tmpFile, wavBytes);
    try {
      const { stdout } = await execFileAsync(
        opts.pythonBin ?? 'python',
        [fwScript, tmpFile],
        { timeout: 30_000 },
      );
      const parsed = JSON.parse(stdout.trim()) as { transcript?: string };
      if (parsed.transcript && parsed.transcript.trim()) {
        return {
          transcript: parsed.transcript.trim(),
          rms,
          durationMs,
          rejectedSilent: false,
          sttEngine: 'faster-whisper-local',
        };
      }
    } catch {
      // fall through to OpenAI or honest 503
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
  }

  // 4. Optional OpenAI Whisper endpoint if user supplied OPENAI_API_KEY
  const openAiKey = opts.openAiKey ?? process.env.OPENAI_API_KEY;
  if (openAiKey) {
    registerSecretForRedaction(openAiKey);
    const f = opts.fetchImpl ?? fetch;
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(wavBytes)], { type: 'audio/wav' }), 'audio.wav');
    form.append('model', 'whisper-1');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await f('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: form,
        signal: controller.signal,
      });
      if (resp.ok) {
        const json = (await resp.json()) as { text?: string };
        return {
          transcript: (json.text ?? '').trim(),
          rms,
          durationMs,
          rejectedSilent: false,
          sttEngine: 'openai-whisper',
        };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw Object.assign(
    new Error('STT_ENGINE_UNAVAILABLE: Configure local faster-whisper, whisper.cpp, or OPENAI_API_KEY'),
    { statusCode: 503 },
  );
}
