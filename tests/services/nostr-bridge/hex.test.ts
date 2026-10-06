import { describe, expect, it } from 'vitest';
import { bytesToHex, generateClientTag, generateGroupId, hexToBytes } from '@/services/nostr-bridge/hex';

describe('bytesToHex / hexToBytes', () => {
  it('round-trips and zero-pads single-digit bytes', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    expect(bytesToHex(bytes)).toBe('00010f10ff');
    expect(Array.from(hexToBytes('00010f10ff'))).toEqual([0, 1, 15, 16, 255]);
  });

  it('rejects odd-length input', () => {
    expect(() => hexToBytes('abc')).toThrow(/invalid hex/);
  });

  it('is lenient on invalid digits (parses as 0), which callers rely on', () => {
    // Documented in hex.ts: @noble/hashes would throw here, so swapping it in is a behaviour change.
    expect(Array.from(hexToBytes('zz'))).toEqual([0]);
  });
});

describe('generateGroupId / generateClientTag', () => {
  it('produce 16 lowercase hex chars and do not repeat', () => {
    for (const gen of [generateGroupId, generateClientTag]) {
      const a = gen();
      const b = gen();
      expect(a).toMatch(/^[0-9a-f]{16}$/);
      expect(b).toMatch(/^[0-9a-f]{16}$/);
      expect(a).not.toBe(b);
    }
  });
});
