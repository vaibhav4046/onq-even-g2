import { describe, expect, it } from 'vitest';
import { encodeQr, formatBits, qrPath, rsRemainder } from '../src/components/connect/qr';

// Reference matrices were produced by an independent encoder (Python qrcode, same version, level L, same mask)
// and both decode back to the text with OpenCV's QR detector.
const REF_V1 = {
  text: "onq pair",
  version: 1,
  mask: 4,
  rows: [
    '111111101000101111111',
    '100000101101001000001',
    '101110101111101011101',
    '101110101010101011101',
    '101110100111101011101',
    '100000101010101000001',
    '111111101010101111111',
    '000000000000000000000',
    '110011100000100101111',
    '011001000000111111010',
    '110010111100101011110',
    '010101000111100010011',
    '001111110111011011000',
    '000000001011100010110',
    '111111100001001010010',
    '100000101010011011000',
    '101110101000111000010',
    '101110100110111010111',
    '101110100110110011000',
    '100000101011100110000',
    '111111101101001001001',
  ],
};

const REF_V2 = {
  text: "http://192.168.1.20:8787/pair",
  version: 2,
  mask: 1,
  rows: [
    '1111111010111100101111111',
    '1000001011100100001000001',
    '1011101000101110001011101',
    '1011101000101101001011101',
    '1011101011100100101011101',
    '1000001010001000101000001',
    '1111111010101010101111111',
    '0000000010100000000000000',
    '1110011011101011011110011',
    '0101010001111111011001011',
    '1010101000010011111011101',
    '1000110011000001101011000',
    '0000001001011010111000001',
    '0111100000011111001000011',
    '1100001100011111100011101',
    '0000100000100000001000000',
    '1110111001010010111110010',
    '0000000011011011100010101',
    '1111111000010000101011001',
    '1000001011011010100010010',
    '1011101001001011111111000',
    '1011101000110110100111110',
    '1011101010010110100110011',
    '1000001010111001100110000',
    '1111111011110011101001001',
  ],
};

const toRows = (m: boolean[][]) => m.map((r) => r.map((x) => (x ? '1' : '0')).join(''));

describe('rsRemainder', () => {
  it('matches the published HELLO WORLD 1-M example (10 error-correction codewords)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
});

describe('formatBits', () => {
  it('matches the standard format strings for level L', () => {
    expect(formatBits(0).toString(2).padStart(15, '0')).toBe('111011111000100');
    expect(formatBits(1).toString(2).padStart(15, '0')).toBe('111001011110011');
    expect(formatBits(7).toString(2).padStart(15, '0')).toBe('110100101110110');
  });
});

describe('encodeQr', () => {
  it.each([REF_V1, REF_V2])('matches the reference matrix for %o', (ref) => {
    const q = encodeQr(ref.text, ref.mask);
    expect(q.version).toBe(ref.version);
    expect(toRows(q.modules)).toEqual(ref.rows);
  });

  it('picks a valid mask on its own and keeps the finder patterns', () => {
    const q = encodeQr(REF_V2.text);
    expect(q.size).toBe(25);
    expect(q.mask).toBeGreaterThanOrEqual(0);
    expect(q.mask).toBeLessThanOrEqual(7);
    expect(q.modules[0].slice(0, 7).every(Boolean)).toBe(true);
    expect(q.modules[3][3]).toBe(true);
  });

  it('refuses text that does not fit version 5', () => {
    expect(() => encodeQr('x'.repeat(107))).toThrow(/longer than 106/);
    expect(encodeQr('x'.repeat(106)).version).toBe(5);
  });
});

describe('qrPath', () => {
  it('draws horizontal runs of dark modules', () => {
    expect(qrPath([[true, true, false, true], [false, false, false, false]])).toBe('M0 0h2v1h-2zM3 0h1v1h-1z');
  });
});
