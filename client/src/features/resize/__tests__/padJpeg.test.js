import { describe, it, expect } from 'vitest';
import { padJpegBytes } from '../canvasUtils.js';

// A minimal "JPEG": start marker, a little data, end marker.
const tinyJpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x01, 0x02, 0xff, 0xd9]);

describe('padJpegBytes', () => {
  it('pads a small JPEG to at least the minimum, keeping the start and the original data', () => {
    const src = tinyJpeg();
    const out = padJpegBytes(src, 20 * 1024);
    expect(out.length).toBeGreaterThanOrEqual(20 * 1024);
    expect([out[0], out[1]]).toEqual([0xff, 0xd8]);
    // The first added segment is a comment with a valid length field.
    expect([out[2], out[3]]).toEqual([0xff, 0xfe]);
    const len = (out[4] << 8) | out[5];
    expect(len).toBeGreaterThan(2);
    // The original bytes after the start marker follow the comments, unchanged.
    expect(Array.from(out.slice(-8))).toEqual(Array.from(src.slice(2)));
  });

  it('splits big padding into several valid comment segments', () => {
    const out = padJpegBytes(tinyJpeg(), 150 * 1024);
    let at = 2;
    let segments = 0;
    while (out[at] === 0xff && out[at + 1] === 0xfe) {
      const len = (out[at + 2] << 8) | out[at + 3];
      expect(len).toBeLessThanOrEqual(65535);
      at += 2 + len;
      segments += 1;
    }
    expect(segments).toBeGreaterThan(1);
    expect([out[at], out[at + 1]]).toEqual([0xff, 0xdb]);
  });

  it('leaves big-enough files and non-JPEGs alone', () => {
    const src = tinyJpeg();
    expect(padJpegBytes(src, 5)).toBe(src);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(padJpegBytes(png, 1024)).toBe(png);
  });
});
