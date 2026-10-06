/**
 * The test fake (`tests/support/fake-bridge.ts`) keeps the facade's shape:
 * every store and every `subscribeX` the real read half has. A store missing
 * from the fake already fails `tsc` there; a subscribe method cannot, so it
 * is checked here against `BridgeReads.prototype`.
 */
import { describe, expect, it } from 'vitest';
import { BridgeReads } from '@/services/nostr-bridge/facade-reads';
import { FAKE_BRIDGE_STORES, fakeBridge } from '@tests/support/fake-bridge';

const own = Object.getOwnPropertyDescriptors(BridgeReads.prototype);

describe('fakeBridge', () => {
  it('implements every subscribe the facade has', () => {
    const fake = fakeBridge() as unknown as Record<string, unknown>;
    const subscribes = Object.keys(own).filter((name) => name.startsWith('subscribe'));
    expect(subscribes.length).toBeGreaterThan(25);
    expect(subscribes.filter((name) => typeof fake[name] !== 'function')).toEqual([]);
  });

  it('has a store for every store getter on the facade', () => {
    const getters = Object.entries(own).filter(([, d]) => d.get).map(([name]) => name).sort();
    expect([...FAKE_BRIDGE_STORES].sort()).toEqual(getters);
  });
});
