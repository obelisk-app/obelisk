import { afterEach, describe, expect, it, vi } from 'vitest';
import { BunkerSigner } from 'nostr-tools/nip46';
import { BunkerModule } from '@/services/nostr-bridge/session/bunker';
import { BunkerLogin } from '@/services/nostr-bridge/session/bunker-login';
import { SessionState } from '@/services/nostr-bridge/session/state';
import { StateStore } from '@/services/nostr-bridge/common/state-store';

vi.mock('nostr-tools/nip46', () => ({
  BunkerSigner: { fromURI: vi.fn(), fromBunker: vi.fn() },
  parseBunkerInput: async () => ({ pubkey: 'a'.repeat(64), relays: ['wss://relay.example.com'] }),
  createNostrConnectURI: () => 'nostrconnect://test',
}));
afterEach(() => vi.restoreAllMocks());

function setup() {
  let resolve!: (pubkey: string) => void;
  const pending = new Promise<string>((done) => { resolve = done; });
  const signer = { getPublicKey: vi.fn(() => pending), close: vi.fn(), bp: { pubkey: 'a'.repeat(64), relays: [] } };
  vi.mocked(BunkerSigner.fromURI).mockResolvedValue(signer as unknown as BunkerSigner);
  const state = new SessionState();
  const bunker = { signer: null, onAuth: null, openAuthUrl: vi.fn(), ready: new StateStore(false) };
  const finalize = vi.fn(async () => undefined);
  const login = new BunkerLogin(state, bunker, finalize, vi.fn(async () => undefined));
  return { state, signer, bunker, finalize, login, resolve };
}

describe('remote login ownership', () => {
  it('runs a burst through the bunker adapter with ten concurrent operations', async () => {
    const { signer } = setup();
    const bunker = new BunkerModule({ session: () => null });
    bunker.signer = signer as unknown as BunkerSigner;
    let active = 0;
    let peak = 0;
    const results = await Promise.allSettled(Array.from({ length: 100 }, (_, i) => bunker.run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      active -= 1;
      if (i === 3) throw new Error('one request refused');
      return i;
    })));
    expect(peak).toBe(10);
    expect(active).toBe(0);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(99);
    expect(results[3]).toMatchObject({ status: 'rejected' });
    expect(results[99]).toEqual({ status: 'fulfilled', value: 99 });
    bunker.close();
  });

  it('shares one public-key request across prewarm and concurrent relay authentication', async () => {
    const { state, signer, resolve } = setup();
    state.session = { pubKeyHex: 'b'.repeat(64), loginMethod: 'bunker', relayUrl: 'wss://relay.example.com', bunkerUrl: 'bunker://test', bunkerLocalSecretHex: '1'.repeat(64) };
    vi.mocked(BunkerSigner.fromBunker).mockReturnValue(signer as unknown as BunkerSigner);
    const bunker = new BunkerModule({ session: () => state.session });
    const prewarm = bunker.ensure();
    const auth = vi.fn(async () => 'signed');
    const requests = [bunker.run(auth), bunker.run(auth)];
    await Promise.resolve();
    expect(signer.getPublicKey).toHaveBeenCalledOnce();
    expect(auth).not.toHaveBeenCalled();
    resolve('b'.repeat(64));
    expect(await prewarm).toBe(signer);
    expect(await Promise.all(requests)).toEqual(['signed', 'signed']);
    await bunker.ensure();
    expect(signer.getPublicKey).toHaveBeenCalledOnce();
    bunker.close();
  });

  it('rejects a restored signer answering with a different account', async () => {
    const { state, signer, resolve } = setup();
    state.session = { pubKeyHex: 'b'.repeat(64), loginMethod: 'bunker', relayUrl: 'wss://relay.example.com', bunkerUrl: 'bunker://test', bunkerLocalSecretHex: '1'.repeat(64) };
    vi.mocked(BunkerSigner.fromBunker).mockReturnValue(signer as unknown as BunkerSigner);
    const bunker = new BunkerModule({ session: () => state.session });
    const waiting = bunker.ensure();
    const assertion = expect(waiting).rejects.toThrow('different account');
    resolve('c'.repeat(64));
    await assertion;
    expect(bunker.signer).toBeNull();
    expect(bunker.ready.get()).toBe(false);
    expect(signer.close).toHaveBeenCalledOnce();
  });

  it('releases failed restores for one shared retry', async () => {
    const { state, signer, resolve } = setup();
    state.session = { pubKeyHex: 'b'.repeat(64), loginMethod: 'bunker', relayUrl: 'wss://relay.example.com', bunkerUrl: 'bunker://test', bunkerLocalSecretHex: '1'.repeat(64) };
    signer.getPublicKey.mockRejectedValueOnce(new Error('offline'));
    vi.mocked(BunkerSigner.fromBunker).mockReturnValue(signer as unknown as BunkerSigner);
    const bunker = new BunkerModule({ session: () => state.session });
    const failures = await Promise.allSettled([bunker.ensure(), bunker.ensure()]);
    expect(failures.every((result) => result.status === 'rejected')).toBe(true);
    expect(signer.getPublicKey).toHaveBeenCalledTimes(1);
    const retries = [bunker.ensure(), bunker.ensure()];
    resolve('b'.repeat(64)); await Promise.all(retries);
    expect(signer.getPublicKey).toHaveBeenCalledTimes(2);
    bunker.close();
  });

  it('an old restore completion cannot clear a newer pending restore after logout', async () => {
    const old = setup();
    const fresh = setup();
    old.state.session = { pubKeyHex: 'b'.repeat(64), loginMethod: 'bunker', relayUrl: 'wss://relay.example.com', bunkerUrl: 'bunker://test', bunkerLocalSecretHex: '1'.repeat(64) };
    vi.mocked(BunkerSigner.fromBunker)
      .mockReturnValueOnce(old.signer as unknown as BunkerSigner)
      .mockReturnValue(fresh.signer as unknown as BunkerSigner);
    const bunker = new BunkerModule({ session: () => old.state.session });
    const first = bunker.ensure();
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    bunker.close();
    old.state.session = { ...old.state.session, pubKeyHex: 'c'.repeat(64) };
    const second = bunker.ensure();
    old.resolve('b'.repeat(64)); await rejected;
    const third = bunker.ensure();
    await Promise.resolve();
    expect(fresh.signer.getPublicKey).toHaveBeenCalledOnce();
    fresh.resolve('c'.repeat(64));
    expect(await second).toBe(fresh.signer);
    expect(await third).toBe(fresh.signer);
    expect(bunker.signer).toBe(fresh.signer);
    bunker.close();
  });

  it('cancelling a QR during getPublicKey closes the signer and never installs the account', async () => {
    const { login, resolve, signer, state, finalize } = setup();
    const qr = login.createNostrConnectSession();
    const waiting = qr.waitForConnection();
    const result = waiting.then(() => 'logged-in', (error: Error) => error.name);
    await Promise.resolve();
    expect(signer.getPublicKey).toHaveBeenCalled();
    qr.cancel();
    resolve('b'.repeat(64));
    expect(await result).toBe('AbortError');
    expect(signer.close).toHaveBeenCalledOnce();
    expect(state.session).toBeNull();
    expect(finalize).not.toHaveBeenCalled();
  });
  it('a restore prewarm cannot reinstall its signer after logout', async () => {
    const { state, signer, resolve } = setup();
    state.session = { pubKeyHex: 'b'.repeat(64), loginMethod: 'bunker', relayUrl: 'wss://relay.example.com', bunkerUrl: 'bunker://test', bunkerLocalSecretHex: '1'.repeat(64) };
    vi.mocked(BunkerSigner.fromBunker).mockReturnValue(signer as unknown as BunkerSigner);
    const bunker = new BunkerModule({ session: () => state.session });
    const warming = bunker.ensure();
    const result = warming.then(() => 'ready', (error: Error) => error.name);
    await Promise.resolve();
    expect(signer.getPublicKey).toHaveBeenCalled();
    state.session = null;
    bunker.close();
    resolve('b'.repeat(64));
    expect(await result).toBe('AbortError');
    expect(bunker.signer).toBeNull();
    expect(bunker.ready.get()).toBe(false);
    expect(signer.close).toHaveBeenCalledOnce();
  });

  it('ignores an SDK handoff superseded while its public key is resolving', async () => {
    const { state, signer, login, resolve, finalize } = setup();
    const waiting = login.loginWithBunker('bunker://test', { signer: signer as unknown as BunkerSigner, clientSecretHex: '1'.repeat(64) });
    const result = waiting.then(() => 'logged-in', (error: Error) => error.name);
    await Promise.resolve();
    expect(signer.getPublicKey).toHaveBeenCalled();
    state.beginSessionOperation();
    state.session = { pubKeyHex: 'c'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' };
    resolve('b'.repeat(64));
    expect(await result).toBe('AbortError');
    expect(state.session.pubKeyHex).toBe('c'.repeat(64));
    expect(finalize).not.toHaveBeenCalled();
    // The SDK, not the bridge, owns and closes this paired signer.
    expect(signer.close).not.toHaveBeenCalled();
  });

  it('cleaning up a completed QR flow leaves its installed session intact', async () => {
    const { state, login, resolve, signer } = setup();
    const qr = login.createNostrConnectSession();
    const waiting = qr.waitForConnection();
    resolve('b'.repeat(64));
    await waiting;
    const generation = state.sessionGeneration;
    qr.cancel();
    expect(state.sessionGeneration).toBe(generation);
    expect(state.session?.pubKeyHex).toBe('b'.repeat(64));
    expect(signer.close).not.toHaveBeenCalled();
  });

});
