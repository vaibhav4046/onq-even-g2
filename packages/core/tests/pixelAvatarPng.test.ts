import { describe, expect, it } from 'vitest';
import { encodePixelAvatarPng, renderPixelAvatar } from '../src/index.js';

describe('4-bit Pixelated Voice Avatar PNG (Anime Dots / Duet / Dots)', () => {
  it('generates valid 76x76 4-bit grayscale PNG across all avatar styles, states, and animation ticks with >= 75% optical black transparency', () => {
    const styles = ['muse', 'duet', 'dots'] as const;
    const states = ['idle', 'listening', 'thinking', 'speaking', 'armed', 'conflict'] as const;
    const ticks = [0, 5, 11] as const;

    for (const style of styles) {
      for (const state of states) {
        for (const tick of ticks) {
          const stats = renderPixelAvatar(state, {
            style,
            tick,
            rmsLevel: 0.45,
            armProgress01: 0.65,
            size: 76,
          });
          expect(stats.width).toBe(76);
          expect(stats.height).toBe(76);
          // PNG magic bytes
          expect(Array.from(stats.pngBytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
          // Optical field must preserve >= 75% pure-black transparency
          expect(stats.blackPixelRatio).toBeGreaterThanOrEqual(0.75);
        }
      }
    }
  });

  it('encodePixelAvatarPng returns crisp Uint8Array identical to renderPixelAvatar', () => {
    const a = encodePixelAvatarPng('speaking', { style: 'muse', tick: 2, rmsLevel: 0.6 });
    const b = renderPixelAvatar('speaking', { style: 'muse', tick: 2, rmsLevel: 0.6 }).pngBytes;
    expect(a.byteLength).toBe(b.byteLength);
    expect(a.byteLength).toBeGreaterThan(200);
  });
});
