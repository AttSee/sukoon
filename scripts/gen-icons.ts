/**
 * Generates the extension icons (PNG) without any image dependency:
 * a deep-green disc with a single flat "still water" line.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const DISC: [number, number, number] = [31, 95, 74];
const LINE: [number, number, number] = [251, 250, 247];
const SS = 4; // supersampling per axis

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(size: number): Uint8Array {
  const raw = new Uint8Array(size * (size * 4 + 1));
  const r = size / 2;
  const lineHalf = Math.max(0.75, size * 0.055);
  const lineHalfWidth = size * 0.28;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let disc = 0;
      let line = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - r;
          const py = y + (sy + 0.5) / SS - r;
          if (px * px + py * py <= r * r) {
            disc++;
            if (Math.abs(py) <= lineHalf && Math.abs(px) <= lineHalfWidth) line++;
          }
        }
      }
      const n = SS * SS;
      const a = disc / n;
      const t = disc ? line / disc : 0;
      const i = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[i + c] = Math.round(DISC[c]! * (1 - t) + LINE[c]! * t);
      raw[i + 3] = Math.round(a * 255);
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

for (const size of SIZES) writeFileSync(new URL(`../public/icon/${size}.png`, import.meta.url), png(size));
console.log('icons written');
