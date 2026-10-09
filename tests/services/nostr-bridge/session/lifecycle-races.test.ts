import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeRelayPage } from '@tests/services/nostr-bridge/support/fake-relay-page';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';

warmBridgeModules();
installFakeRelayPage();
afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function prepare() {
  Object.defineProperty(window, 'nostr', { configurable: true, value: { getPublicKey: vi.fn(async () => 'a'.repeat(64)) } });
  const { ConnectionModule } = await import('@/services/nostr-bridge/session/connection');
  const { getBridge } = await import('@/services/nostr-bridge/facade/client');
  const bridge = await getBridge();
  const connect = vi.spyOn(ConnectionModule.prototype, 'connect');
  return { bridge, connect };
}

describe('session operation ownership', () => {
  it('logout invalidates a login waiting for its relay handshake', async () => {
    const { bridge, connect } = await prepare();
    const handshake = deferred<void>();
    connect.mockReturnValueOnce(handshake.promise);
    const login = bridge.loginWithNip07('a'.repeat(64));
    const result = login.then(() => 'logged-in', (error: Error) => error.name);
    await bridge.logout();
    handshake.resolve();
    expect(await result).toBe('AbortError');
    expect(bridge.isLoggedIn.get()).toBe(false);
    expect(bridge.myPubkey.get()).toBeNull();
  });

  it('an older login cannot open the gate while the newer account is connecting', async () => {
    const { bridge, connect } = await prepare();
    const first = deferred<void>();
    const second = deferred<void>();
    connect.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const older = bridge.loginWithNip07('a'.repeat(64));
    const result = older.then(() => 'logged-in', (error: Error) => error.name);
    const newer = bridge.loginWithNip07('b'.repeat(64));
    first.resolve();
    expect(await result).toBe('AbortError');
    expect(bridge.isLoggedIn.get()).toBe(false);
    second.resolve();
    await newer;
    expect(bridge.myPubkey.get()).toBe('b'.repeat(64));
    expect(bridge.isLoggedIn.get()).toBe(true);
  });
  it('logout wins against a delayed vault restore', async () => {
    const { bridge, connect } = await prepare();
    connect.mockResolvedValue();
    const { SessionPersistence } = await import('@/services/nostr-bridge/session/persistence');
    const opened = deferred<import('@/services/nostr-bridge/session/session-storage').PersistedSession>();
    vi.spyOn(SessionPersistence.prototype, 'load').mockReturnValueOnce(opened.promise);
    localStorage.setItem('obelisk-dex/session', '{}');
    const restoring = bridge.initialize();
    await bridge.logout();
    opened.resolve({ pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' });
    await restoring;
    expect(bridge.getPublicKey()).toBeNull();
    expect(bridge.isLoggedIn.get()).toBe(false);
  });

  it('an older restore cannot replace a newer account after its handshake resolves', async () => {
    const { bridge, connect } = await prepare();
    const first = deferred<void>();
    connect.mockReturnValueOnce(first.promise).mockResolvedValueOnce();
    localStorage.setItem('obelisk-dex/session', JSON.stringify({ v: 2, pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' }));
    const restoring = bridge.initialize();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    await bridge.loginWithNip07('b'.repeat(64));
    first.resolve();
    await restoring;
    expect(bridge.myPubkey.get()).toBe('b'.repeat(64));
    expect(bridge.getPublicKey()).toBe('b'.repeat(64));
  });

  it('keeps an uncached restored account rehydrating after the first connection fails', async () => {
    const { bridge, connect } = await prepare();
    connect.mockRejectedValueOnce(new Error('offline'));
    localStorage.setItem('obelisk-dex/session', JSON.stringify({ v: 2, pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' }));
    await bridge.initialize();
    expect(bridge.isRestoringSession.get()).toBe(true);
    expect(bridge.isLoggedIn.get()).toBe(false);
    await bridge.logout();
    expect(bridge.isRestoringSession.get()).toBe(false);
  });

  it('does not leave corrupt storage behind a permanent restoring gate', async () => {
    const { bridge } = await prepare();
    localStorage.setItem('obelisk-dex/session', '{}');
    await bridge.initialize();
    expect(bridge.isRestoringSession.get()).toBe(false);
  });

  it('cold logout removes a saved account without connecting it first', async () => {
    const { ConnectionModule } = await import('@/services/nostr-bridge/session/connection');
    const connect = vi.spyOn(ConnectionModule.prototype, 'connect');
    const { logoutPageSession, getBridge } = await import('@/services/nostr-bridge/facade/client');
    localStorage.setItem('obelisk-dex/session', JSON.stringify({ v: 2, pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' }));
    await logoutPageSession();
    expect(connect).not.toHaveBeenCalled();
    expect(localStorage.getItem('obelisk-dex/session')).toBeNull();
    expect((await getBridge()).isLoggedIn.get()).toBe(false);
  });

  it('logout does not wait for an in-flight restoration handshake', async () => {
    const { ConnectionModule } = await import('@/services/nostr-bridge/session/connection');
    const handshake = deferred<void>();
    vi.spyOn(ConnectionModule.prototype, 'connect').mockReturnValueOnce(handshake.promise);
    const { logoutPageSession, getBridge } = await import('@/services/nostr-bridge/facade/client');
    localStorage.setItem('obelisk-dex/session', JSON.stringify({ v: 2, pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' }));
    const restoring = getBridge();
    await logoutPageSession();
    const bridge = await getBridge();
    expect(bridge.isLoggedIn.get()).toBe(false);
    handshake.resolve();
    await restoring;
    expect(bridge.getPublicKey()).toBeNull();
  });

  it('announces same-key login generations and closes the old signer gate during replacement', async () => {
    const { bridge, connect } = await prepare();
    connect.mockResolvedValue();
    const generations: number[] = [];
    const stop = bridge.subscribeSessionGeneration((generation) => generations.push(generation));
    await bridge.loginWithNip07('a'.repeat(64));
    const previous = bridge.getSessionGeneration();
    const replacing = bridge.loginWithNip07('a'.repeat(64));
    expect(bridge.isLoggedIn.get()).toBe(false);
    expect(generations.at(-1)).toBeGreaterThan(previous);
    await replacing;
    expect(bridge.isLoggedIn.get()).toBe(true);
    stop();
  });

  it.each(['logout', 'same-key-login'] as const)('retires a facade signer adapter after %s', async (change) => {
    const { bridge, connect } = await prepare();
    connect.mockResolvedValue();
    await bridge.loginWithNip07('a'.repeat(64));
    const signer = bridge.getNipSigner()!;
    if (change === 'logout') await bridge.logout();
    else await bridge.loginWithNip07('a'.repeat(64));
    await expect(signer.signEvent({ kind: 1, content: '', tags: [], created_at: 1 })).rejects.toMatchObject({ name: 'AbortError' });
  });

});
