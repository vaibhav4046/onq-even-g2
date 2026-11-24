import { describe, expect, it } from 'vitest';
import { encodeCountdownRingPng, renderCountdownRing } from '../src/index.js';

function readU32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

describe('pngRing.ts', () => {
  it('1. starts with valid RFC-2083 PNG 8-byte signature', () => {
    const png = encodeCountdownRingPng(0.5);
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('2. encodes 76x76 4-bit grayscale IHDR chunk', () => {
    const png = encodeCountdownRingPng(0.5, 76);
    const chunkLen = readU32BE(png, 8);
    const chunkType = String.fromCharCode(png[12], png[13], png[14], png[15]);
    expect(chunkLen).toBe(13);
    expect(chunkType).toBe('IHDR');
    expect(readU32BE(png, 16)).toBe(76); // width
    expect(readU32BE(png, 20)).toBe(76); // height
    expect(png[24]).toBe(4); // 4-bit grayscale
    expect(png[25]).toBe(0); // color type 0 (grayscale)
  });

  it('3. ends with valid IEND chunk', () => {
    const png = encodeCountdownRingPng(0.25);
    const tail = png.subarray(png.length - 12);
    expect(readU32BE(tail, 0)).toBe(0);
    expect(String.fromCharCode(tail[4], tail[5], tail[6], tail[7])).toBe('IEND');
  });

  it('4. maintains >= 70% dark transparent waveguide pixels at 0%, 50%, 100%', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const stats = renderCountdownRing(p, 76);
      expect(stats.blackPixelRatio).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('5. clamps out-of-range progress values safely', () => {
    const low = encodeCountdownRingPng(-0.5);
    const zero = encodeCountdownRingPng(0);
    expect(Buffer.compare(low, zero)).toBe(0);

    const high = encodeCountdownRingPng(2.0);
    const one = encodeCountdownRingPng(1);
    expect(Buffer.compare(high, one)).toBe(0);
  });

  it('6. handles NaN progress gracefully without throwing', () => {
    const png = encodeCountdownRingPng(Number.NaN);
    expect(png.byteLength).toBeGreaterThan(100);
  });

  it('7. produces distinct IDAT payloads for 0% vs 50% vs 100%', () => {
    const p0 = Buffer.from(encodeCountdownRingPng(0));
    const p50 = Buffer.from(encodeCountdownRingPng(0.5));
    const p100 = Buffer.from(encodeCountdownRingPng(1.0));
    expect(Buffer.compare(p0, p50)).not.toBe(0);
    expect(Buffer.compare(p50, p100)).not.toBe(0);
  });

  it('8. stays compact for BLE updateImageRawData transfer (< 4 KB)', () => {
    const png = encodeCountdownRingPng(0.75, 76);
    expect(png.byteLength).toBeLessThan(4096);
  });
});
