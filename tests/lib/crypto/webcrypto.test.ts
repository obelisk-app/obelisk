import { describe, expect, it } from 'vitest';
import { exact, fromBase64Url, toBase64Url } from '@/lib/crypto/webcrypto';

describe('webcrypto helpers', () => {
  it('base64url round-trips every byte value without padding or + /', () => {
    const all = new Uint8Array(256).map((_, i) => i);
    const encoded = toBase64Url(all);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(Array.from(fromBase64Url(encoded))).toEqual(Array.from(all));
    for (let n = 0; n < 5; n++) {
      const slice = all.slice(0, n);
      expect(Array.from(fromBase64Url(toBase64Url(slice)))).toEqual(Array.from(slice));
    }
  });

  it('rejects text that is not base64url', () => {
    expect(() => fromBase64Url('a+b/')).toThrow();
    expect(() => fromBase64Url('abcde')).toThrow();
    expect(() => fromBase64Url('ab cd')).toThrow();
  });

  it('exact copies a view into a buffer of exactly its size', () => {
    const pool = new Uint8Array([9, 1, 2, 3, 9]);
    const copy = exact(pool.subarray(1, 4));
    expect(copy.buffer.byteLength).toBe(3);
    expect(Array.from(copy)).toEqual([1, 2, 3]);
  });
});
