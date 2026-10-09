import { afterEach, describe, expect, it, vi } from 'vitest';
import { readExtensionPubkey } from '@/services/nostr-bridge/session/extension-identity';
import { ExtensionAccountEvents } from '@/services/nostr-bridge/session/extension-account-events';
import { SessionState } from '@/services/nostr-bridge/session/state';
import { BrowserConnectionEvents } from '@/services/nostr-bridge/session/browser-events';
import { resetSignerQueue } from '@/services/nostr-bridge/session/signer-queue';

const alice = 'a'.repeat(64);
const bob = 'b'.repeat(64);
const carol = 'c'.repeat(64);
const disposers: (() => void)[] = [];
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const changed = (pubkey = carol) => window.dispatchEvent(new CustomEvent('nostr:accountChanged', { detail: { pubkey } }));
function deferred() {
  let resolve!: (key: string) => void;
  const promise = new Promise<string>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture(method: 'nip07' | 'bunker' | 'nsec' = 'nip07') {
  const state = new SessionState();
  state.session = { pubKeyHex: alice, loginMethod: method, relayUrl: 'wss://relay.test' };
  state.isLoggedIn.set(true);
  const login = vi.fn(async (pubkey: string) => {
    state.beginSessionOperation();
    state.session = { ...state.session!, pubKeyHex: pubkey };
    state.myPubkey.set(pubkey);
    state.isLoggedIn.set(true);
  });
  const controller = new ExtensionAccountEvents(state, login);
  controller.wire();
  disposers.push(() => controller.unwire());
  return { state, login, controller };
}
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  delete window.nostr;
  resetSignerQueue();
});

describe('extension account changes', () => {
  it('verifies the provider key instead of trusting the event and updates once', async () => {
    const getPublicKey = vi.fn().mockResolvedValue(bob);
    window.nostr = { getPublicKey } as typeof window.nostr;
    const { login, controller } = fixture();
    controller.wire();
    changed();
    await flush();
    expect(login).toHaveBeenCalledExactlyOnceWith(bob);
    changed();
    await flush();
    expect(login).toHaveBeenCalledTimes(1);
  });
  it.each(['bunker', 'nsec', null] as const)('ignores the event for %s sessions', async (method) => {
    const getPublicKey = vi.fn().mockResolvedValue(bob);
    window.nostr = { getPublicKey } as typeof window.nostr;
    const { state, login } = fixture(method ?? 'nip07');
    if (!method) state.session = null;
    changed();
    await flush();
    expect(getPublicKey).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });
  it('coalesces bursts and drops a superseded response', async () => {
    const first = deferred();
    const getPublicKey = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(carol);
    window.nostr = { getPublicKey } as typeof window.nostr;
    const { login, state } = fixture();
    changed();
    expect(state.extensionIdentityPending).toBe(true);
    await flush();
    changed(); changed(); changed();
    first.resolve(bob);
    await flush();
    expect(getPublicKey).toHaveBeenCalledTimes(2);
    expect(login).toHaveBeenCalledExactlyOnceWith(carol);
    expect(state.extensionIdentityPending).toBe(false);
  });
  it.each(['logout', 'login', 'dispose'] as const)('drops pending results after %s', async (action) => {
    const first = deferred();
    window.nostr = { getPublicKey: () => first.promise } as typeof window.nostr;
    const { state, login, controller } = fixture();
    changed();
    await flush();
    if (action === 'dispose') controller.unwire();
    else {
      state.beginSessionOperation();
      state.session = action === 'logout' ? null : { ...state.session!, loginMethod: 'bunker' };
    }
    first.resolve(bob);
    await flush();
    expect(login).not.toHaveBeenCalled();
  });
  it('removes its listener and permits a fresh lifecycle', async () => {
    const getPublicKey = vi.fn().mockResolvedValue(bob);
    window.nostr = { getPublicKey } as typeof window.nostr;
    const { controller, login } = fixture();
    controller.unwire();
    changed();
    await flush();
    expect(getPublicKey).not.toHaveBeenCalled();
    controller.wire();
    changed();
    await flush();
    expect(login).toHaveBeenCalledExactlyOnceWith(bob);
  });
  it('does not install malformed keys or leak rejected lookups', async () => {
    const getPublicKey = vi.fn().mockRejectedValueOnce(new Error('locked')).mockResolvedValue('invalid');
    window.nostr = { getPublicKey } as typeof window.nostr;
    const { login, state } = fixture();
    changed(); await flush();
    changed(); await flush();
    expect(login).not.toHaveBeenCalled();
    expect(state.extensionIdentityPending).toBe(true);
  });
});

it('validates and normalizes public keys for startup and event reads', async () => {
  window.nostr = { getPublicKey: vi.fn().mockResolvedValue(alice.toUpperCase()) } as typeof window.nostr;
  await expect(readExtensionPubkey()).resolves.toBe(alice);
});

it('connects account listener ownership to the browser lifecycle', async () => {
  const state = new SessionState();
  state.session = { pubKeyHex: alice, loginMethod: 'nip07', relayUrl: 'wss://relay.test' };
  const login = vi.fn(async () => {});
  const getPublicKey = vi.fn().mockResolvedValue(bob);
  window.nostr = { getPublicKey } as typeof window.nostr;
  const browser = new BrowserConnectionEvents(state, vi.fn(), new ExtensionAccountEvents(state, login));
  disposers.push(() => browser.unwire());
  browser.wire();
  changed(); await flush();
  expect(login).toHaveBeenCalledExactlyOnceWith(bob);
  browser.unwire();
  changed(); await flush();
  expect(getPublicKey).toHaveBeenCalledTimes(1);
});

it('rechecks an event received while installing an account', async () => {
  const installing = deferred();
  const getPublicKey = vi.fn().mockResolvedValueOnce(bob).mockResolvedValue(carol);
  window.nostr = { getPublicKey } as typeof window.nostr;
  const { state, login } = fixture();
  login.mockImplementationOnce(async (pubkey) => {
    state.beginSessionOperation();
    state.session = { ...state.session!, pubKeyHex: pubkey };
    await installing.promise;
  });
  changed(); await flush();
  changed();
  installing.resolve(''); await flush();
  expect(login.mock.calls.map(([key]) => key)).toEqual([bob, carol]);
});

it('does not lose a new event when a prior account lookup becomes stale', async () => {
  const first = deferred();
  window.nostr = { getPublicKey: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(carol) } as typeof window.nostr;
  const { state, login } = fixture();
  changed(); await flush();
  state.beginSessionOperation();
  state.session = { ...state.session!, pubKeyHex: bob };
  changed();
  first.resolve(bob); await flush();
  expect(login).toHaveBeenCalledExactlyOnceWith(carol);
});
