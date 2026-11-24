import { computePcmRms, encodePcm16ToWav, PCM_SAMPLE_RATE } from '@onq/core';

export interface MicRecordingHandle {
  stop: () => Promise<{ wavBlob: Blob; rms: number; durationMs: number }>;
}

/**
 * Downsamples a Float32 audio chunk into 16 kHz mono PCM16 bytes.
 */
function downsampleTo16kPcm16(samples: Float32Array, inputRate: number): Uint8Array {
  const ratio = inputRate / PCM_SAMPLE_RATE;
  const outLen = Math.max(1, Math.floor(samples.length / ratio));
  const pcm = new Uint8Array(outLen * 2);
  const dv = new DataView(pcm.buffer);
  for (let i = 0; i < outLen; i++) {
    const idx = Math.min(samples.length - 1, Math.floor(i * ratio));
    const clamped = Math.max(-1, Math.min(1, samples[idx]));
    dv.setInt16(i * 2, Math.round(clamped * 32767), true);
  }
  return pcm;
}

/**
 * Captures real microphone audio via Web Audio API, resamples to 16 kHz mono PCM16,
 * emits live binary PCM16 frames for streaming WebSocket STT, and builds final WAV.
 */
export async function startBrowserMicCapture(
  onRmsLevel: (rms: number) => void,
  onPcmFrame?: (pcm16: Uint8Array, rms: number) => void,
): Promise<MicRecordingHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(2048, 1, 1);
  const chunks: Float32Array[] = [];
  const inputRate = ctx.sampleRate;

  processor.onaudioprocess = (ev) => {
    const channel = ev.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(channel));
    let sumSq = 0;
    for (let i = 0; i < channel.length; i++) {
      sumSq += channel[i] * channel[i];
    }
    const rmsNorm = Math.min(1, Math.sqrt(sumSq / channel.length) * 4);
    onRmsLevel(rmsNorm);
    if (onPcmFrame) {
      onPcmFrame(downsampleTo16kPcm16(channel, inputRate), rmsNorm);
    }
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  return {
    stop: async () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();

      const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Float32Array(totalSamples);
      let pos = 0;
      for (const c of chunks) {
        merged.set(c, pos);
        pos += c.length;
      }

      const pcm = downsampleTo16kPcm16(merged, inputRate);
      const rms = computePcmRms(pcm);
      const durationMs = ((pcm.byteLength / 2) / PCM_SAMPLE_RATE) * 1000;
      const wavBlob = new Blob([new Uint8Array(encodePcm16ToWav(pcm, PCM_SAMPLE_RATE))], {
        type: 'audio/wav',
      });
      return { wavBlob, rms, durationMs };
    },
  };
}
