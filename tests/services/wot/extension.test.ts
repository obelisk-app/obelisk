import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { fakeBridge } from '@tests/support/fake-bridge';
import { wotBatch, wotProbe } from '@/services/wot/extension';

afterEach(() => { unregisterBridge(); delete window.nostr; });

it.each(['bunker', 'nsec'] as const)('never queries extension trust for a %s identity', async (method) => {
  registerBridge(fakeBridge({ myLoginMethod: method }));
  const getDistanceBatch = vi.fn(async () => ({ peer: 1 }));
  Object.assign(window, { nostr: { wot: { getDistanceBatch } } });
  expect(await wotProbe()).toEqual({ status: 'absent' });
  expect(await wotBatch(['peer'], 2, 1)).toBeNull();
  expect(getDistanceBatch).not.toHaveBeenCalled();
});

describe('extension account ownership', () => {
  it('drops answers after the active session changes', async () => {
    const bridge = fakeBridge({ myLoginMethod: 'nip07' });
    registerBridge(bridge);
    Object.assign(window, { nostr: { wot: { getDistanceBatch: async () => {
      bridge.stores.myLoginMethod.set('bunker');
      return { peer: 1 };
    } } } });
    expect(await wotBatch(['peer'], 2, 1)).toBeNull();
  });
  it('rejects a probe identifying another extension account', async () => {
    registerBridge(fakeBridge({ myLoginMethod: 'nip07', myPubkey: 'alice' }));
    Object.assign(window, { nostr: { wot: {
      getStatus: async () => ({ user: 'bob', configured: true }),
      getDistanceBatch: async () => ({}),
    } } });
    expect(await wotProbe()).toEqual({ status: 'absent' });
  });
});
