// Pure-TS 4-bit Gray8 PNG encoder for Even G2 76x76 Countdown Ring.
// Zero external dependencies; identical output in Browser and Node 24.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let s1 = 1;
  let s2 = 0;
  const MOD = 65521;
  for (let i = 0; i < bytes.length; i++) {
    s1 = (s1 + bytes[i]) % MOD;
    s2 = (s2 + s1) % MOD;
  }
  return ((s2 << 16) | s1) >>> 0;
}

function writeU32BE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeU32BE(out, 0, data.length);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  writeU32BE(out, 8 + data.length, crc);
  return out;
}

function zlibStore(rawScanlines: Uint8Array): Uint8Array {
  // Single uncompressed DEFLATE block when <= 65535 bytes (76x76x4bit is 2964 bytes)
  const blocks: Uint8Array[] = [];
  blocks.push(new Uint8Array([0x78, 0x01])); // CMF=0x78, FLG=0x01
  let offset = 0;
  while (offset < rawScanlines.length) {
    const chunkLen = Math.min(65535, rawScanlines.length - offset);
    const isFinal = offset + chunkLen >= rawScanlines.length ? 1 : 0;
    const hdr = new Uint8Array(5);
    hdr[0] = isFinal;
    hdr[1] = chunkLen & 0xff;
    hdr[2] = (chunkLen >>> 8) & 0xff;
    const nlen = (~chunkLen) & 0xffff;
    hdr[3] = nlen & 0xff;
    hdr[4] = (nlen >>> 8) & 0xff;
    blocks.push(hdr);
    blocks.push(rawScanlines.subarray(offset, offset + chunkLen));
    offset += chunkLen;
  }
  const adler = new Uint8Array(4);
  writeU32BE(adler, 0, adler32(rawScanlines));
  blocks.push(adler);

  const totalLen = blocks.reduce((acc, b) => acc + b.length, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const b of blocks) {
    out.set(b, pos);
    pos += b.length;
  }
  return out;
}

export interface RingRenderStats {
  pngBytes: Uint8Array;
  blackPixelRatio: number;
  width: number;
  height: number;
}

export function encodeGray4Png(
  raw: Uint8Array,
  width: number,
  height: number,
  blackPixels: number,
): RingRenderStats {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 4; // bit depth 4
  ihdr[9] = 0; // grayscale
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlibStore(raw);
  const ihdrChunk = makePngChunk('IHDR', ihdr);
  const idatChunk = makePngChunk('IDAT', idat);
  const iendChunk = makePngChunk('IEND', new Uint8Array(0));

  const pngBytes = new Uint8Array(
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length,
  );
  let pos = 0;
  for (const part of [signature, ihdrChunk, idatChunk, iendChunk]) {
    pngBytes.set(part, pos);
    pos += part.length;
  }

  return {
    pngBytes,
    blackPixelRatio: blackPixels / (width * height),
    width,
    height,
  };
}

/**
 * Generates a 76x76 4-bit grayscale PNG countdown ring.
 * Pure black (0x0) background ensures >= 75% transparent waveguide budget.
 */
export function renderCountdownRing(progress01: number, size = 76): RingRenderStats {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress01) ? progress01 : 0));
  const width = size;
  const height = size;
  const rowBytes = 1 + Math.ceil(width / 2); // filter byte + 2 nibbles/byte
  const raw = new Uint8Array(rowBytes * height);

  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const outerR = width * 0.42;
  const innerR = width * 0.32;
  const targetAngle = clamped * Math.PI * 2;
  let blackPixels = 0;

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // PNG filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      let nibble = 0; // pure black transparent glass

      if (dist >= innerR && dist <= outerR) {
        // Angle clockwise from 12 o'clock (-PI/2)
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += Math.PI * 2;
        if (angle <= targetAngle) {
          nibble = 15; // full phosphor bright
        } else {
          // Sparse dim track keeps >= 75% pure black waveguide transparency
          nibble = (x + y) % 4 === 0 ? 2 : 0;
        }
      } else if (dist <= width * 0.07) {
        // Center lock pip
        nibble = clamped >= 0.99 ? 15 : 8;
      }

      if (nibble === 0) blackPixels++;
      const byteIdx = rowStart + 1 + (x >> 1);
      if ((x & 1) === 0) {
        raw[byteIdx] |= (nibble & 0x0f) << 4;
      } else {
        raw[byteIdx] |= nibble & 0x0f;
      }
    }
  }

  return encodeGray4Png(raw, width, height, blackPixels);
}

export function encodeCountdownRingPng(progress01: number, size = 76): Uint8Array {
  return renderCountdownRing(progress01, size).pngBytes;
}
