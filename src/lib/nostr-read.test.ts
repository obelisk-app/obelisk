import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';

// Coalescer mock — `nostr-read.querySigned` now flows through
// `sharedCoalescer.querySync`. Capture the args here so existing assertions
// (relays, filters, maxWait) keep working with one shape change: the
// coalescer pre-verifies signatures, so we filter the mock's returned events
// here to match production semantics.
const querySyncMock = vi.fn();

vi.mock('./nostr-coalescer', async () => {
  const { verifyEvent, verifiedSymbol } = await import('nostr-tools/pure');
  const stripAndVerify = (ev: unknown) => {
    try {
      const { [verifiedSymbol]: _ignored, ...rest } = ev as { [verifiedSymbol]?: boolean };
      return verifyEvent(rest as Parameters<typeof verifyEvent>[0]);
    } catch { return false; }
  };
  return {
    sharedCoalescer: {
      querySync: async (filters: unknown[], opts: { relays: string[]; timeoutMs?: number }) => {
        const events = await querySyncMock(opts.relays, filters, { maxWait: opts.timeoutMs ?? 8000 });
        return (events ?? []).filter(stripAndVerify);
      },
      enqueue: vi.fn(),
    },
  };
});

import { fetchKind0, fetchEventById, fetchFollowers, fetchFollowing, fetchUserNotes, fetchRelayList } from './nostr-read';

beforeEach(() => {
  querySyncMock.mockReset();
});

function signed<T extends { kind: number; tags?: string[][]; content?: string; created_at?: number }>(
  fields: T,
): import('nostr-tools/pure').Event {
  const sk = generateSecretKey();
  return finalizeEvent({
    kind: fields.kind,
    created_at: fields.created_at ?? Math.floor(Date.now() / 1000),
    tags: fields.tags ?? [],
    content: fields.content ?? '',
  }, sk);
}

function authoredBy(sk: Uint8Array, fields: { kind: number; tags?: string[][]; content?: string; created_at?: number }) {
  return finalizeEvent({
    kind: fields.kind,
    created_at: fields.created_at ?? Math.floor(Date.now() / 1000),
    tags: fields.tags ?? [],
    content: fields.content ?? '',
  }, sk);
}

describe('fetchKind0', () => {
  it('returns parsed JSON from the newest verified event', async () => {
    const sk = generateSecretKey();
    const older = authoredBy(sk, { kind: 0, content: '{"name":"old"}', created_at: 1000 });
    const newer = authoredBy(sk, { kind: 0, content: '{"name":"new"}', created_at: 2000 });
    querySyncMock.mockResolvedValue([older, newer]);
    const profile = await fetchKind0(getPublicKey(sk));
    expect(profile).toEqual({ name: 'new' });
  });

  it('drops events with bad signatures', async () => {
    const ev = signed({ kind: 0, content: '{"name":"alice"}' });
    const tampered = { ...ev, content: '{"name":"evil"}' };
    querySyncMock.mockResolvedValue([tampered]);
    const profile = await fetchKind0('a'.repeat(64));
    expect(profile).toEqual({});
  });

  it('returns {} on empty relay response', async () => {
    querySyncMock.mockResolvedValue([]);
    const profile = await fetchKind0('a'.repeat(64));
    expect(profile).toEqual({});
  });

  it('returns {} when content is not valid JSON', async () => {
    const ev = signed({ kind: 0, content: 'not-json' });
    querySyncMock.mockResolvedValue([ev]);
    const profile = await fetchKind0(ev.pubkey);
    expect(profile).toEqual({});
  });
});

describe('fetchEventById', () => {
  it('returns the event when present and signature-valid', async () => {
    const ev = signed({ kind: 1, content: 'hello' });
    querySyncMock.mockResolvedValue([ev]);
    const out = await fetchEventById(ev.id);
    expect(out?.id).toBe(ev.id);
  });

  it('returns null when nothing came back', async () => {
    querySyncMock.mockResolvedValue([]);
    expect(await fetchEventById('deadbeef')).toBeNull();
  });

  it('returns null for tampered events', async () => {
    const ev = signed({ kind: 1, content: 'hello' });
    const tampered = { ...ev, content: 'goodbye' };
    querySyncMock.mockResolvedValue([tampered]);
    expect(await fetchEventById(ev.id)).toBeNull();
  });
});

describe('fetchFollowers', () => {
  it('extracts unique authors from kind-3 events tagged with the target pubkey', async () => {
    const a = signed({ kind: 3, tags: [['p', 'target']] });
    const b = signed({ kind: 3, tags: [['p', 'target']] });
    const dupOfA = a; // same id; should still dedupe
    querySyncMock.mockResolvedValue([a, b, dupOfA]);
    const out = await fetchFollowers('target');
    expect(out.sort()).toEqual([a.pubkey, b.pubkey].sort());
  });
});

describe('fetchFollowing', () => {
  it('returns the p-tag pubkeys from the newest kind-3 by the author', async () => {
    const sk = generateSecretKey();
    const author = getPublicKey(sk);
    const older = authoredBy(sk, {
      kind: 3,
      created_at: 1000,
      tags: [['p', 'a'.repeat(64)]],
    });
    const newer = authoredBy(sk, {
      kind: 3,
      created_at: 2000,
      tags: [['p', 'b'.repeat(64)], ['p', 'c'.repeat(64)]],
    });
    querySyncMock.mockResolvedValue([older, newer]);
    const out = await fetchFollowing(author);
    expect(out.sort()).toEqual(['b'.repeat(64), 'c'.repeat(64)].sort());
  });

  it('ignores p tags whose value is not a 64-char hex pubkey', async () => {
    const sk = generateSecretKey();
    const ev = authoredBy(sk, {
      kind: 3,
      tags: [['p', 'not-a-pubkey'], ['p', 'a'.repeat(64)]],
    });
    querySyncMock.mockResolvedValue([ev]);
    const out = await fetchFollowing(getPublicKey(sk));
    expect(out).toEqual(['a'.repeat(64)]);
  });

  it('returns [] when no kind-3 was returned', async () => {
    querySyncMock.mockResolvedValue([]);
    expect(await fetchFollowing('a'.repeat(64))).toEqual([]);
  });
});

describe('fetchUserNotes', () => {
  it('returns notes sorted newest-first', async () => {
    const sk = generateSecretKey();
    const a = authoredBy(sk, { kind: 1, content: 'old', created_at: 1000 });
    const b = authoredBy(sk, { kind: 1, content: 'new', created_at: 2000 });
    querySyncMock.mockResolvedValue([a, b]);
    const out = await fetchUserNotes(getPublicKey(sk));
    expect(out.map((e) => e.content)).toEqual(['new', 'old']);
  });
});

describe('fetchRelayList', () => {
  it('extracts read/write relays from r tags with markers', async () => {
    const sk = generateSecretKey();
    const ev = authoredBy(sk, {
      kind: 10002,
      tags: [
        ['r', 'wss://both.example'],
        ['r', 'wss://read.only', 'read'],
        ['r', 'wss://write.only', 'write'],
      ],
    });
    querySyncMock.mockResolvedValue([ev]);
    const { read, write } = await fetchRelayList(getPublicKey(sk));
    expect(read.sort()).toEqual(['wss://both.example', 'wss://read.only'].sort());
    expect(write.sort()).toEqual(['wss://both.example', 'wss://write.only'].sort());
  });

  it('returns empty arrays when no kind-10002 was found', async () => {
    querySyncMock.mockResolvedValue([]);
    const { read, write } = await fetchRelayList('a'.repeat(64));
    expect(read).toEqual([]);
    expect(write).toEqual([]);
  });
});

describe('fetch helpers — relay routing + timeout', () => {
  it('uses caller-provided relays when supplied, defaults otherwise', async () => {
    querySyncMock.mockResolvedValue([]);
    await fetchKind0('a'.repeat(64), { relays: ['wss://specific.relay'] });
    expect(querySyncMock).toHaveBeenLastCalledWith(['wss://specific.relay'], expect.any(Object), expect.any(Object));
    await fetchKind0('a'.repeat(64));
    const defaultRelays = querySyncMock.mock.calls.at(-1)?.[0] as string[];
    expect(defaultRelays).toContain('wss://purplepag.es');
    expect(defaultRelays).toContain('wss://relay.damus.io');
  });

  it('forwards the timeoutMs option as maxWait', async () => {
    querySyncMock.mockResolvedValue([]);
    await fetchKind0('a'.repeat(64), { timeoutMs: 1234 });
    expect(querySyncMock).toHaveBeenLastCalledWith(expect.any(Array), expect.any(Object), { maxWait: 1234 });
  });
});
