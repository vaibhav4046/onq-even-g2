import { computePcmRms, encodePcm16ToWav, PCM_SAMPLE_RATE } from '@oncue/core';

export interface MicRecordingHandle {
  stop: () => Promise<{ wavBlob: Blob; rms: number; durationMs: number }>;
}

/**
 * Captures real microphone audio via Web Audio API, resamples to 16 kHz mono PCM16 WAV,
 * and streams live RMS loudness levels for the G2 lens audio bar.
 */
export async function startBrowserMicCapture(
  onRmsLevel: (rms: number) => void,
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
    onRmsLevel(Math.min(1, Math.sqrt(sumSq / channel.length) * 4));
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

      // Linear downsample to 16 kHz mono PCM16
      const ratio = inputRate / PCM_SAMPLE_RATE;
      const outLen = Math.max(1, Math.floor(merged.length / ratio));
      const pcm = new Uint8Array(outLen * 2);
      const dv = new DataView(pcm.buffer);
      for (let i = 0; i < outLen; i++) {
        const idx = Math.min(merged.length - 1, Math.floor(i * ratio));
        const clamped = Math.max(-1, Math.min(1, merged[idx]));
        dv.setInt16(i * 2, Math.round(clamped * 32767), true);
      }

      const rms = computePcmRms(pcm);
      const durationMs = (outLen / PCM_SAMPLE_RATE) * 1000;
      const wavBlob = new Blob([new Uint8Array(encodePcm16ToWav(pcm, PCM_SAMPLE_RATE))], {
        type: 'audio/wav',
      });
      return { wavBlob, rms, durationMs };
    },
  };
}
