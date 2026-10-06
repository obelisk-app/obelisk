import { describe, expect, it } from 'vitest';
import { decodeRecord, encodeRecord, recordAad } from '@/services/nostr-bridge/dm/store-record';
import type { IngestDmParams } from '@/services/nostr-bridge/dm/thread';

const base: IngestDmParams = {
  id: 'r'.repeat(64),
  createdAt: 1_700_000_000,
  plaintext: 'hello',
  outgoing: false,
  counterparty: 'c'.repeat(64),
  protocol: 'nip17',
  pq: false,
  notifyId: 'w'.repeat(64),
  tags: [['p', 'c'.repeat(64)], ['emoji', 'wave', 'https://e.example/w.png']],
  raw: {
    rumor: { id: 'r'.repeat(64), pubkey: 'c'.repeat(64), created_at: 1, kind: 14, tags: [], content: 'hello' },
    wire: { id: 'w'.repeat(64), pubkey: 'e'.repeat(64), created_at: 1, kind: 1059, tags: [['p', 'm'.repeat(64)]], content: 'ct', sig: 's' },
  },
};

const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe('stored DM records', () => {
  it('round-trips what rebuilds a thread entry, the file message and the raw events included', () => {
    expect(decodeRecord(encodeRecord(base))).toEqual(base);
    const file = { url: 'https://b.example/x', mimeType: 'image/png', algorithm: 'aes-gcm', key: 'k', nonce: 'n', x: 'h', name: 'cat.png' };
    expect(decodeRecord(encodeRecord({ ...base, file }))?.file).toEqual(file);
  });

  it('binds a box to the account and the wire id', () => {
    expect(recordAad('a', 'w')).toBe('obelisk-dm:v1:a:w');
    expect(recordAad('a', 'w')).not.toBe(recordAad('b', 'w'));
  });

  it('rejects what this build cannot rebuild: another version, a wrong type, a broken file, not JSON', () => {
    expect(decodeRecord(raw({ v: 2, dm: base }))).toBeNull();
    expect(decodeRecord(raw({ v: 1, dm: { ...base, createdAt: 'yesterday' } }))).toBeNull();
    expect(decodeRecord(raw({ v: 1, dm: { ...base, protocol: 'nip99' } }))).toBeNull();
    expect(decodeRecord(raw({ v: 1, dm: { ...base, file: { url: 'x' } } }))).toBeNull();
    expect(decodeRecord(new TextEncoder().encode('{not json'))).toBeNull();
  });
});
