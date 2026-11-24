import fs from 'node:fs';
import { encodePcm16ToWav } from '../packages/core/dist/index.js';
import { loadLocalEnvFile } from '../apps/server/dist/env.js';
import { synthesizeTtsUtterance } from '../apps/server/dist/tts/assemblyaiTts.js';

function getArg(flag, fallback = '') {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

loadLocalEnvFile();

const text = getArg('--text');
const voiceId = getArg('--voice', 'aai-titus');
const outWav = getArg('--out');

if (!text || !outWav) {
  console.error('Usage: node scripts/tts-vo-helper.mjs --text "..." --out path.wav [--voice aai-titus]');
  process.exit(1);
}

if (!process.env.ASSEMBLYAI_API_KEY) {
  console.error('ASSEMBLYAI_API_KEY missing');
  process.exit(2);
}

const result = await synthesizeTtsUtterance({
  text,
  voiceId,
  timeoutMs: 20000,
});

if (result.engine !== 'assemblyai-tts-1' || result.audioChunksBase64.length === 0) {
  console.error(`TTS-1 returned engine=${result.engine} chunks=${result.audioChunksBase64.length}`);
  process.exit(3);
}

const parts = result.audioChunksBase64.map((b64) => Buffer.from(b64, 'base64'));
const pcm = Buffer.concat(parts);
const wav = encodePcm16ToWav(new Uint8Array(pcm), result.sampleRate || 24000);
fs.writeFileSync(outWav, wav);
console.log(`[tts-vo] Synthesized ${outWav} via ${result.engine} (${voiceId}, ${result.durationMs}ms, ${result.wordBoundaries.length} words)`);
