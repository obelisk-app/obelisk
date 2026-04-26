import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getProfile, setProfileTestRelays, _resetProfileCache } from './profile-cache';

const enqueueMock = vi.fn();
vi.mock('./coalescer', () => ({
  RequestCoalescer: class {
    enqueue(req: any) { enqueueMock(req); }
  },
}));

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  enqueueMock.mockClear();
  _resetProfileCache();
});

describe('profile-cache', () => {
  it('first fetch dispatches a REQ that includes purplepag.es', () => {
    setProfileTestRelays(['wss://my.relay']);
    const p = getProfile(me, partner);
    expect(p.profile).toBeNull();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const call = enqueueMock.mock.calls[0][0];
    expect(call.relays).toContain('wss://purplepag.es');
    expect(call.relays).toContain('wss://my.relay');
    expect(call.filters[0]).toMatchObject({ kinds: [0], authors: [partner] });
  });

  it('second call within 24h does not re-enqueue (cache hit)', () => {
    setProfileTestRelays([]);
    getProfile(me, partner);
    // Force a stored entry: simulate the relay event arrival.
    const onEvent = enqueueMock.mock.calls[0]?.[0]?.onEvent;
    if (onEvent) {
      onEvent({ id: 'e1', kind: 0, pubkey: partner, created_at: Math.floor(Date.now() / 1000), tags: [], content: '{"name":"alice"}', sig: 'x' } as any);
    }
    enqueueMock.mockClear();
    getProfile(me, partner);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('after TTL elapses, returns stale immediately and re-enqueues', () => {
    setProfileTestRelays([]);
    getProfile(me, partner);
    const onEvent1 = enqueueMock.mock.calls[0][0].onEvent;
    onEvent1({ id: 'e1', kind: 0, pubkey: partner, created_at: 1000, tags: [], content: '{"name":"alice"}', sig: 'x' } as any);
    // Tamper with persisted lastCheckedAt to be 25h ago
    const key = `obelisk:profiles:${me}`;
    const blob = JSON.parse(localStorage.getItem(key) ?? '{}');
    blob[partner].lastCheckedAt = Date.now() - 25 * 3600 * 1000;
    localStorage.setItem(key, JSON.stringify(blob));
    enqueueMock.mockClear();
    const r = getProfile(me, partner);
    expect(r.profile).not.toBeNull();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('does not notify subscribers when refresh returns same created_at', () => {
    setProfileTestRelays([]);
    const sub = vi.fn();
    getProfile(me, partner, { onUpdate: sub });
    const onEvent = enqueueMock.mock.calls[0][0].onEvent;
    const ev = { id: 'e1', pubkey: partner, kind: 0, created_at: 1000, tags: [], content: '{"name":"alice"}', sig: 'x' } as any;
    onEvent(ev);
    onEvent(ev); // same created_at — should not re-notify
    expect(sub).toHaveBeenCalledTimes(1);
  });
});
