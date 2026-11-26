/**
 * Microphone for the plain-browser client (devices that are not Even glasses). Produces the same 16 kHz mono
 * 16-bit PCM the host speech endpoint expects. Needs https or localhost (browser rule for getUserMedia).
 */

export const TARGET_RATE = 16000;

/** Float samples [-1, 1] at `inRate` to little-endian 16-bit PCM at `outRate` (averaging when downsampling). */
export function floatToPcm16(samples: Float32Array, inRate: number, outRate: number = TARGET_RATE): Uint8Array {
  const ratio = inRate / outRate;
  const outLen = Math.max(0, Math.floor(samples.length / ratio));
  const out = new Uint8Array(outLen * 2);
  const view = new DataView(out.buffer);
  for (let o = 0; o < outLen; o++) {
    const start = Math.floor(o * ratio);
    const end = Math.max(start + 1, Math.min(samples.length, Math.floor((o + 1) * ratio)));
    let sum = 0;
    for (let k = start; k < end; k++) sum += samples[k];
    const v = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(o * 2, v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff), true);
  }
  return out;
}

export interface BrowserMic {
  start: () => Promise<boolean>;
  stop: () => void;
}

export function createBrowserMic(onChunk: (pcm: Uint8Array) => void): BrowserMic {
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let node: ScriptProcessorNode | null = null;
  return {
    async start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return false;
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctx({ sampleRate: TARGET_RATE });
        const src = ctx.createMediaStreamSource(stream);
        node = ctx.createScriptProcessor(4096, 1, 1);
        const rate = ctx.sampleRate;
        node.onaudioprocess = (e) => onChunk(floatToPcm16(e.inputBuffer.getChannelData(0), rate));
        src.connect(node);
        node.connect(ctx.destination);
        return true;
      } catch {
        this.stop();
        return false;
      }
    },
    stop() {
      try {
        node?.disconnect();
        if (node) node.onaudioprocess = null;
        stream?.getTracks().forEach((t) => t.stop());
        void ctx?.close();
      } catch {
        // already closed
      }
      node = null;
      stream = null;
      ctx = null;
    },
  };
}
