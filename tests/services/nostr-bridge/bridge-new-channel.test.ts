/**
 * A channel this session just created, on the pool-level fake: its first
 * empty EOSE is final, so the pane goes straight to the channel's welcome
 * instead of holding "Loading messages..." through the empty-EOSE retry
 * ladder (1.5 + 3 + 5 s plus three REQ round trips).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  deliver,
  fakeRelayMessage,
  flush,
  installBridgeHarness,
  makeKeypair,
} from '@tests/services/nostr-bridge/support/bridge-harness';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

installBridgeHarness(fake);

describe('a channel created in this session', () => {
  it('is confirmed empty on its first empty EOSE, with no retry ladder', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();
    const impl = getBridgeImpl()!;

    const id = await bridge.createGroup({ name: 'Brand new', isPublic: true, isOpen: true });
    bridge.setActiveGroup(id);
    await flush();

    expect(impl.messagesStatusByGroup.get()[id]).toBe('empty-confirmed');
    expect(impl.messagesRetryAttempts(id)).toBeNull();
  });

  it('re-opening it stays on the welcome, and its first message still lands', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();
    const impl = getBridgeImpl()!;

    const id = await bridge.createGroup({ name: 'Brand new', isPublic: true, isOpen: true });
    bridge.setActiveGroup(id);
    await flush();
    bridge.setActiveGroup(null);
    bridge.setActiveGroup(id);
    await flush();
    expect(impl.messagesStatusByGroup.get()[id]).toBe('empty-confirmed');

    deliver(await fakeRelayMessage({ groupId: id, content: 'first!' }));
    await flush();
    expect(impl.messagesStatusByGroup.get()[id]).toBe('has-messages');
  });

  it('a channel someone else made still runs the ladder before saying empty', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();
    const impl = getBridgeImpl()!;

    bridge.setActiveGroup('someone-elses-channel');
    await flush();
    expect(impl.messagesStatusByGroup.get()['someone-elses-channel']).toBe('empty-unconfirmed');
  });
});
