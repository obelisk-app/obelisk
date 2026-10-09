import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeRelayPage } from '@tests/services/nostr-bridge/support/fake-relay-page';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';
import { STORAGE_KEY } from '@/constants/nostr-bridge/session';

warmBridgeModules();
installFakeRelayPage();
afterEach(() => vi.restoreAllMocks());

async function setup() {
  const { getBridge } = await import('@/services/nostr-bridge/facade/client');
  const bridge = await getBridge();
  const { ConnectionModule } = await import('@/services/nostr-bridge/session/connection');
  const connect = vi.spyOn(ConnectionModule.prototype, 'connect').mockResolvedValue();
  const getPublicKey = vi.fn(async () => 'b'.repeat(64));
  Object.defineProperty(window, 'nostr', { configurable: true, value: { getPublicKey } });
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' }));
  return { bridge, connect, getPublicKey };
}

describe('extension identity on reload', () => {
  it('checks the provider once before connecting and replaces the saved account', async () => {
    const { bridge, connect, getPublicKey } = await setup();
    let release!: (key: string) => void;
    getPublicKey.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const restoring = bridge.initialize();
    await vi.waitFor(() => expect(getPublicKey).toHaveBeenCalledOnce());
    expect(connect).not.toHaveBeenCalled();
    expect(bridge.isLoggedIn.get()).toBe(false);
    release('b'.repeat(64));
    await restoring;
    expect(bridge.myPubkey.get()).toBe('b'.repeat(64));
    expect(bridge.getPublicKey()).toBe('b'.repeat(64));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ pubKeyHex: 'b'.repeat(64) });
  });

  it('rechecks a startup key response superseded by an extension account event', async () => {
    const { bridge, getPublicKey } = await setup();
    let release!: (key: string) => void;
    getPublicKey.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const restoring = bridge.initialize();
    await vi.waitFor(() => expect(getPublicKey).toHaveBeenCalledOnce());
    window.dispatchEvent(new CustomEvent('nostr:accountChanged', { detail: { pubkey: 'b'.repeat(64) } }));
    release('a'.repeat(64));
    await restoring;
    expect(getPublicKey).toHaveBeenCalledTimes(2);
    expect(bridge.myPubkey.get()).toBe('b'.repeat(64));
  });

  it('never authenticates as the saved account when extension verification fails', async () => {
    const { bridge, connect, getPublicKey } = await setup();
    getPublicKey.mockRejectedValue(new Error('locked'));
    await bridge.initialize();
    expect(connect).not.toHaveBeenCalled();
    expect(bridge.isLoggedIn.get()).toBe(false);
    expect(bridge.getPublicKey()).toBeNull();
    expect(bridge.isRestoringSession.get()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('does not let a pending key check reinstall an account after logout', async () => {
    const { bridge, getPublicKey } = await setup();
    let release!: (key: string) => void;
    getPublicKey.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const restoring = bridge.initialize();
    await vi.waitFor(() => expect(getPublicKey).toHaveBeenCalledOnce());
    await bridge.logout();
    release('b'.repeat(64));
    await restoring;
    expect(bridge.getPublicKey()).toBeNull();
    expect(bridge.isLoggedIn.get()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not ask an installed extension for an identity on a first visit', async () => {
    const { bridge, connect, getPublicKey } = await setup();
    localStorage.removeItem(STORAGE_KEY);
    await bridge.initialize();
    expect(getPublicKey).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(bridge.isLoggedIn.get()).toBe(false);
  });
});
