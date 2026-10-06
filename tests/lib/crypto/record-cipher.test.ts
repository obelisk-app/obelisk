import { describe, expect, it } from 'vitest';
import {
  RECORD_KEY_BYTES,
  RecordCipherError,
  importRecordKey,
  newRecordKeyBytes,
  openRecord,
  sealRecord,
} from '@/lib/crypto/record-cipher';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(RecordCipherError);
    return (err as RecordCipherError).code;
  }
  throw new Error('did not throw');
}

describe('record cipher', () => {
  it('makes 32 fresh random bytes each time', () => {
    const a = newRecordKeyBytes();
    expect(a.byteLength).toBe(RECORD_KEY_BYTES);
    expect(Array.from(a)).not.toEqual(Array.from(newRecordKeyBytes()));
  });

  it('imports a key that can seal and open but never be read back', async () => {
    const key = await importRecordKey(newRecordKeyBytes());
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('refuses key bytes that are not 32 long', async () => {
    expect(await codeOf(importRecordKey(new Uint8Array(16)))).toBe('bad-key');
  });

  it('round-trips, with a fresh IV per box and no plaintext in it', async () => {
    const key = await importRecordKey(newRecordKeyBytes());
    const a = await sealRecord(key, bytes('hello there'), 'slot-1');
    const b = await sealRecord(key, bytes('hello there'), 'slot-1');
    expect(a.iv).not.toBe(b.iv);
    expect(JSON.stringify(a)).not.toContain('hello');
    expect(text(await openRecord(key, a, 'slot-1'))).toBe('hello there');
  });

  it('will not open under another slot, another key, a flipped byte or a malformed box', async () => {
    const key = await importRecordKey(newRecordKeyBytes());
    const box = await sealRecord(key, bytes('bound'), 'slot-1');
    expect(await codeOf(openRecord(key, box, 'slot-2'))).toBe('unopenable');
    expect(await codeOf(openRecord(await importRecordKey(newRecordKeyBytes()), box, 'slot-1'))).toBe('unopenable');
    const flipped = { ...box, ct: (box.ct[0] === 'A' ? 'B' : 'A') + box.ct.slice(1) };
    expect(await codeOf(openRecord(key, flipped, 'slot-1'))).toBe('unopenable');
    expect(await codeOf(openRecord(key, { v: 1, iv: 'short', ct: box.ct }, 'slot-1'))).toBe('unopenable');
    expect(await codeOf(openRecord(key, 'not a box', 'slot-1'))).toBe('unopenable');
  });
});
