import { describe, expect, it } from 'vitest';
import {
  BlePaintQueue,
  computePcmRms,
  encodePcm16ToWav,
  EVEN_OS_EVENT,
  normalizeEvenEvent,
  parseWavToPcm16,
  PcmRingBuffer,
} from '../src/index.js';

describe('evenEvents.ts', () => {
  it('1. normalizes proto3 omitted eventType on sysEvent to CLICK', () => {
    const ev = normalizeEvenEvent({ sysEvent: {} });
    expect(ev.kind).toBe('CLICK');
    expect(ev.rawType).toBe('sysEvent');
  });

  it('2. normalizes explicit CLICK_EVENT (0) on sysEvent', () => {
    const ev = normalizeEvenEvent({ sysEvent: { eventType: EVEN_OS_EVENT.CLICK_EVENT } });
    expect(ev.kind).toBe('CLICK');
  });

  it('3. normalizes proto3 omitted currentSelectItemIndex on listEvent to 0', () => {
    const ev = normalizeEvenEvent({ listEvent: { eventType: 0 } });
    expect(ev.kind).toBe('CLICK');
    expect(ev.listIndex).toBe(0);
  });

  it('4. preserves non-zero listEvent index and protoName keys', () => {
    const ev = normalizeEvenEvent({
      listEvent: { Event_Type: 0, CurrentSelect_ItemIndex: 2 },
    });
    expect(ev.kind).toBe('CLICK');
    expect(ev.listIndex).toBe(2);
  });

  it('5. maps FOREGROUND_ENTER and FOREGROUND_EXIT without triggering CLICK', () => {
    const enter = normalizeEvenEvent({ sysEvent: { eventType: EVEN_OS_EVENT.FOREGROUND_ENTER_EVENT } });
    const exit = normalizeEvenEvent({ sysEvent: { eventType: EVEN_OS_EVENT.FOREGROUND_EXIT_EVENT } });
    expect(enter.kind).toBe('FOREGROUND_ENTER');
    expect(exit.kind).toBe('FOREGROUND_EXIT');
  });

  it('6. maps DOUBLE_CLICK, SCROLL_TOP, SCROLL_BOTTOM, LONG_PRESS, LONG_PRESS_RELEASE', () => {
    expect(normalizeEvenEvent({ sysEvent: { eventType: 3 } }).kind).toBe('DOUBLE_CLICK');
    expect(normalizeEvenEvent({ sysEvent: { eventType: 1 } }).kind).toBe('SCROLL_UP');
    expect(normalizeEvenEvent({ sysEvent: { eventType: 2 } }).kind).toBe('SCROLL_DOWN');
    expect(normalizeEvenEvent({ sysEvent: { eventType: 7 } }).kind).toBe('LONG_PRESS');
    expect(normalizeEvenEvent({ sysEvent: { eventType: 8 } }).kind).toBe('LONG_PRESS_RELEASE');
  });

  it('7. copies audioEvent PCM defensively via slice()', () => {
    const backing = new Uint8Array([1, 2, 3, 4]);
    const ev = normalizeEvenEvent({ audioEvent: { audioPcm: backing } });
    backing[0] = 99;
    expect(ev.kind).toBe('AUDIO_PCM');
    expect(ev.audioPcm?.[0]).toBe(1);
  });

  it('8. maps menuItemClickEvent with itemID', () => {
    const ev = normalizeEvenEvent({ menuItemClickEvent: { itemID: 7 } });
    expect(ev.kind).toBe('MENU_CLICK');
    expect(ev.menuItemId).toBe(7);
  });

  it('9. BlePaintQueue serializes text updates and coalesces bursts', async () => {
    const log: string[] = [];
    const queue = new BlePaintQueue(250, () => 1000);
    const p1 = queue.enqueueText(async () => { log.push('t1'); });
    const p2 = queue.enqueueText(async () => { log.push('t2'); });
    const p3 = queue.enqueueText(async () => { log.push('t3'); });
    await Promise.all([p1, p2, p3]);
    expect(log).toEqual(['t3']);
  });

  it('10. BlePaintQueue throttles image updates above 4 Hz', async () => {
    let clock = 1000;
    let calls = 0;
    const queue = new BlePaintQueue(250, () => clock);
    await queue.enqueueImage(async () => { calls++; });
    clock = 1100; // < 250ms
    await queue.enqueueImage(async () => { calls++; });
    clock = 1300; // >= 250ms
    await queue.enqueueImage(async () => { calls++; });
    expect(calls).toBe(2);
  });

  it('11. PcmRingBuffer defensively copies chunks and caps at 12 seconds', () => {
    const buf = new PcmRingBuffer();
    const shared = new Uint8Array(3200);
    shared.fill(42);
    buf.push(shared);
    shared.fill(0); // mutate source buffer after push
    expect(buf.getPcm16()[0]).toBe(42);

    // Push > 384,000 bytes
    const big = new Uint8Array(400_000);
    buf.push(big);
    expect(buf.getPcm16().byteLength).toBe(384_000);
  });

  it('12. RMS silence gate rejects silent PCM and passes spoken-level PCM + WAV roundtrip', () => {
    const silent = new PcmRingBuffer();
    silent.push(new Uint8Array(16000)); // 500ms zeros
    expect(silent.passesSilenceGate().ok).toBe(false);

    const loud = new PcmRingBuffer();
    const pcm = new Uint8Array(16000); // 500ms @ 16kHz
    const dv = new DataView(pcm.buffer);
    for (let i = 0; i < 8000; i++) {
      dv.setInt16(i * 2, Math.round(Math.sin(i * 0.2) * 8000), true);
    }
    loud.push(pcm);
    expect(loud.passesSilenceGate().ok).toBe(true);
    expect(computePcmRms(pcm)).toBeGreaterThan(0.1);

    const wav = encodePcm16ToWav(pcm, 16000);
    const parsed = parseWavToPcm16(wav);
    expect(parsed.sampleRate).toBe(16000);
    expect(parsed.pcm16.byteLength).toBe(pcm.byteLength);
  });
});
