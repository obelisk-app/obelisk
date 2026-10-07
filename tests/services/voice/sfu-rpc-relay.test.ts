import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter } from 'nostr-tools';

const subs = vi.hoisted(() => [] as Array<{ filter: Filter; onEvent: (ev: NostrEvent) => void; opts: Record<string, unknown> }>);
vi.mock('@/services/nostr-bridge/facade/client', () => {
  const bridge = {
    subscribeFilterWatched: (filter: Filter, onEvent: (ev: NostrEvent) => void, opts: Record<string, unknown>) => {
      subs.push({ filter, onEvent, opts });
      return () => {};
    },
  };
  return { getBridge: vi.fn(async () => bridge), getBridgeImpl: vi.fn(() => bridge) };
});

import { subscribeRelayRpc } from '@/services/voice/sfu-rpc-relay';

const CHANNEL = 'c'.repeat(64);
const SFU = 's'.repeat(64);
const ME = 'm'.repeat(64);

function ev(pubkey: string, content: string, p: string[] = [ME]): NostrEvent {
  return { id: 'id', pubkey, created_at: 1, kind: 25050, content, sig: 'sig', tags: p.map((pk) => ['p', pk]) };
}

afterEach(() => {
  subs.length = 0;
  vi.useRealTimers();
});

describe('subscribeRelayRpc', () => {
  it('hands over the unsubscribe before the settle delay, then resolves', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const done = subscribeRelayRpc({
      channelId: CHANNEL, sfuPubkey: SFU, selfPubkey: ME, publishRelays: [],
      attach: () => log.push('attach'), onInbound: () => {},
    }).then(() => log.push('settled'));
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['attach']);
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(log).toEqual(['attach', 'settled']);
    expect(subs[0].filter).toMatchObject({ kinds: [25050], '#e': [CHANNEL] });
    expect(subs[0].opts).not.toHaveProperty('relays');
  });

  it('only the SFU, addressing us, with an object body gets through', async () => {
    vi.useFakeTimers();
    const inbound: unknown[] = [];
    const done = subscribeRelayRpc({
      channelId: CHANNEL, sfuPubkey: SFU, selfPubkey: ME, publishRelays: ['wss://trusted.example'],
      attach: () => {}, onInbound: (m) => inbound.push(m),
    });
    await vi.advanceTimersByTimeAsync(100);
    await done;
    const { onEvent, opts } = subs[0];
    expect(opts.relays).toEqual(['wss://trusted.example']);
    onEvent(ev('x'.repeat(64), '{"type":"response"}'));
    onEvent(ev(SFU, '{"type":"response"}', ['o'.repeat(64)]));
    onEvent(ev(SFU, 'not json'));
    onEvent(ev(SFU, '"a string"'));
    onEvent(ev(SFU, '{"type":"notification","method":"newProducer"}'));
    onEvent(ev(SFU, '{"type":"response","requestId":"r"}', []));
    expect(inbound).toEqual([
      { type: 'notification', method: 'newProducer' },
      { type: 'response', requestId: 'r' },
    ]);
  });
});
