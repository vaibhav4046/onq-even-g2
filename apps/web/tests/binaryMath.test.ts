import { describe, expect, it } from 'vitest';
import { bitAt, decodeText, loopPoints, makeClosedPath, mulberry32, samplePoints } from '../src/lib/binaryMath';

describe('bitAt', () => {
  it('is deterministic and roughly balanced', () => {
    expect(bitAt(3, 9, 5)).toBe(bitAt(3, 9, 5));
    let ones = 0;
    for (let i = 0; i < 4000; i++) ones += bitAt(i, i * 7, 11);
    expect(ones).toBeGreaterThan(1700);
    expect(ones).toBeLessThan(2300);
  });
});

describe('decodeText', () => {
  it('keeps length and spaces, only 0/1 in the unresolved tail', () => {
    const out = decodeText('Read it back', 0.25, 3);
    expect(out).toHaveLength('Read it back'.length);
    expect(out.slice(0, 3)).toBe('Rea');
    expect(out[4]).toBe(' ');
    expect(/^[01 ]+$/.test(out.slice(3).replace(/ /g, ''))).toBe(true);
  });
  it('returns the real text when fully decoded', () => {
    expect(decodeText('Confirm', 1, 0)).toBe('Confirm');
  });
});

describe('samplePoints', () => {
  it('returns at most max in-bounds points from an opaque block', () => {
    const w = 40;
    const h = 20;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 5; y < 15; y++) for (let x = 10; x < 30; x++) rgba[(y * w + x) * 4 + 3] = 255;
    const { points } = samplePoints(rgba, w, h, 50, mulberry32(1));
    expect(points.length).toBeGreaterThan(20);
    expect(points.length).toBeLessThanOrEqual(50);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(10 / w);
      expect(p.x).toBeLessThanOrEqual(30 / w);
      expect(p.y).toBeGreaterThanOrEqual(5 / h);
      expect(p.y).toBeLessThanOrEqual(15 / h);
    }
  });
  it('returns nothing for an empty mask', () => {
    expect(samplePoints(new Uint8ClampedArray(16 * 16 * 4), 16, 16, 10, mulberry32(1)).points).toHaveLength(0);
  });
});

describe('closed path', () => {
  const path = makeClosedPath(loopPoints(64), 1000, 500);
  it('wraps and starts at the top', () => {
    const a = path.at(0);
    const b = path.at(1);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
    expect(a.y).toBeLessThan(250);
    expect(path.length).toBeGreaterThan(1000);
  });
  it('moves clockwise: a quarter in is on the right half', () => {
    expect(path.at(0.25).x).toBeGreaterThan(500);
  });
});
