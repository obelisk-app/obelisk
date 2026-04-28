import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  postClearChannel,
  postClearDM,
  subscribeBroadcast,
  __resetBroadcastChannelForTests,
  type BroadcastMessage,
} from './notification-broadcast';

// jsdom ships its own BroadcastChannel implementation under Node 20+, but
// it's scoped per-instance: two `new BroadcastChannel(name)` in the same
// process do NOT talk to each other. That means a single-process test for
// "sibling tab receives clear" can't round-trip through the real one. We
// stub it with an in-process fake so we can assert post→listener flow.

class FakeBroadcastChannel {
  static channels: Map<string, Set<FakeBroadcastChannel>> = new Map();
  private listeners: Set<(ev: any) => void> = new Set();

  constructor(public name: string) {
    if (!FakeBroadcastChannel.channels.has(name)) {
      FakeBroadcastChannel.channels.set(name, new Set());
    }
    FakeBroadcastChannel.channels.get(name)!.add(this);
  }

  postMessage(data: unknown) {
    // mimic real BroadcastChannel: other subscribers on the same name get
    // notified, but the sending channel itself does NOT receive its own msg.
    const peers = FakeBroadcastChannel.channels.get(this.name) || new Set();
    for (const peer of peers) {
      if (peer === this) continue;
      for (const listener of peer.listeners) listener({ data });
    }
  }

  addEventListener(_type: 'message', listener: (ev: any) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (ev: any) => void) {
    this.listeners.delete(listener);
  }

  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }

  static reset() {
    FakeBroadcastChannel.channels.clear();
  }
}

describe('notification-broadcast', () => {
  let originalBC: any;

  beforeEach(() => {
    originalBC = (globalThis as any).BroadcastChannel;
    (globalThis as any).BroadcastChannel = FakeBroadcastChannel as any;
    FakeBroadcastChannel.reset();
    __resetBroadcastChannelForTests();
  });

  afterEach(() => {
    (globalThis as any).BroadcastChannel = originalBC;
    __resetBroadcastChannelForTests();
  });

  const ME = 'me'.padEnd(64, '0');
  const OTHER = 'zz'.repeat(32);

  it('delivers clear-channel to a subscriber in another tab', () => {
    const sibling = new FakeBroadcastChannel('obelisk:unreads');
    const received: BroadcastMessage[] = [];
    sibling.addEventListener('message', (ev: any) => received.push(ev.data));

    postClearChannel(ME, 'ch1');

    expect(received).toEqual([{ kind: 'clear-channel', senderPubkey: ME, channelId: 'ch1' }]);
  });

  it('delivers clear-dm to a subscriber in another tab', () => {
    const sibling = new FakeBroadcastChannel('obelisk:unreads');
    const received: BroadcastMessage[] = [];
    sibling.addEventListener('message', (ev: any) => received.push(ev.data));

    postClearDM(ME, 'aa'.repeat(32));

    expect(received).toEqual([{ kind: 'clear-dm', senderPubkey: ME, pubkey: 'aa'.repeat(32) }]);
  });

  it('subscribeBroadcast receives messages posted by siblings', () => {
    const sibling = new FakeBroadcastChannel('obelisk:unreads');
    const received: BroadcastMessage[] = [];
    const unsubscribe = subscribeBroadcast((msg) => received.push(msg));

    sibling.postMessage({ kind: 'clear-channel', senderPubkey: ME, channelId: 'ch9' });

    expect(received).toEqual([{ kind: 'clear-channel', senderPubkey: ME, channelId: 'ch9' }]);

    unsubscribe();
    sibling.postMessage({ kind: 'clear-channel', senderPubkey: ME, channelId: 'ch10' });
    expect(received).toHaveLength(1);
  });

  it('subscribers can filter out messages from a different user (pubkey-scoped)', () => {
    // The library itself is transport-only; pubkey filtering happens at the
    // subscribe callsite. This test documents the intended pattern.
    const sibling = new FakeBroadcastChannel('obelisk:unreads');
    const received: BroadcastMessage[] = [];
    const unsub = subscribeBroadcast((msg) => {
      if (msg.senderPubkey !== ME) return;
      received.push(msg);
    });

    sibling.postMessage({ kind: 'clear-channel', senderPubkey: OTHER, channelId: 'leak' });
    sibling.postMessage({ kind: 'clear-channel', senderPubkey: ME, channelId: 'mine' });

    expect(received).toEqual([{ kind: 'clear-channel', senderPubkey: ME, channelId: 'mine' }]);
    unsub();
  });

  it('is a no-op when BroadcastChannel is unavailable', () => {
    (globalThis as any).BroadcastChannel = undefined;
    __resetBroadcastChannelForTests();

    expect(() => postClearChannel(ME, 'ch1')).not.toThrow();
    expect(() => postClearDM(ME, 'aa'.repeat(32))).not.toThrow();

    const unsub = subscribeBroadcast(() => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});
