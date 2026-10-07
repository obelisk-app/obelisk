/**
 * Logging out must leave the bridge exactly as a fresh page load would.
 *
 * The bridge instance survives logout on purpose (one instance per page;
 * see the round 16 provider design), so everything a session wrote has to be
 * reset by hand in `session/reset.ts`, and a store missing from those lists
 * has shipped before (`login-race.test.ts`, "Fix E"). This turns that class
 * of bug into a failing test: it reads every store the facade exposes, found
 * by walking the instance rather than from a list kept here, so a store
 * added later is covered without anyone remembering this file.
 */
import { describe, expect, it } from 'vitest';
import { installFakeRelayPage, loginWithNip07Spy, settle } from '@/services/nostr-bridge/common/test-support';
import { unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';

warmBridgeModules();
installFakeRelayPage();

interface StoreLike {
  get(): unknown;
  set(value: unknown): void;
  subscribe(cb: (value: unknown) => void): () => void;
}

function isStore(value: unknown): value is StoreLike {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.get === 'function' && typeof v.set === 'function' && typeof v.subscribe === 'function';
}

/** Every getter on the instance's prototype chain that returns a StateStore, by name. */
function stores(bridge: object): Record<string, StoreLike> {
  const out: Record<string, StoreLike> = {};
  for (let proto = Object.getPrototypeOf(bridge); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const [name, desc] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
      if (!desc.get || name in out) continue;
      let value: unknown;
      try {
        value = desc.get.call(bridge);
      } catch {
        continue;
      }
      if (isStore(value)) out[name] = value;
    }
  }
  return out;
}

/**
 * Stores that mirror what the device keeps in localStorage, which logout
 * leaves alone on purpose: the relay rail (`RELAYS_KEY`) and the active
 * relay. Every change to them is written through, so the test leaves them
 * with their real values and still checks that logout matches a fresh load.
 */
const DEVICE_STATE = new Set(['configuredRelays', 'currentRelayUrl']);

/**
 * Stores logout keeps in memory, each with the reason. The list only
 * shrinks: an entry for a store logout now resets fails below.
 */
const KEPT_ON_LOGOUT: Readonly<Record<string, string>> = {
  userMetadata:
    'other people\'s public kind 0 profiles, LRU-backed in profiles.ts; logout wipes their disk ' +
    'copy (cacheClearAll) but keeps the in-memory map. Not the account\'s own data; an open question ' +
    'for the owner, not a decision this test makes',
};

function storeSnapshot(bridge: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(stores(bridge)).map(([name, store]) => [name, store.get()]));
}

/**
 * A value the session could have left in a store, shaped after the store's
 * current value: a record gains a key, a list an entry, a flag flips, a
 * string or an empty slot gets a marker. Not realistic data, only different
 * data, so a store that logout forgets to reset still holds it afterwards.
 */
function sessionValue(value: unknown): unknown {
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'string') return `${value}#session`;
  if (value === null) return { id: 'session', pubkey: 'session', kind: 3, tags: [], content: '', created_at: 1, sig: '' };
  if (Array.isArray(value)) return [...value, 'session'];
  if (typeof value === 'object') return { ...(value as object), session: [] };
  return value;
}

describe('logout', () => {
  it('leaves every store on the facade equal to a fresh logged-out bridge', async () => {
    const { bridge, pk } = await loginWithNip07Spy();
    const loggedIn = storeSnapshot(bridge);
    expect(loggedIn.isLoggedIn).toBe(true);
    expect(loggedIn.myPubkey).toBe(pk);
    // Leave something in every store, as a long session would have.
    for (const [name, store] of Object.entries(stores(bridge))) {
      if (!DEVICE_STATE.has(name)) store.set(sessionValue(store.get()));
    }

    await bridge.logout();
    await settle();
    const afterLogout = storeSnapshot(bridge);

    bridge.dispose();
    unregisterBridge();
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const fresh = await getBridge();
    await settle();
    expect(fresh).not.toBe(bridge);
    const freshValues = storeSnapshot(fresh);

    // The walk found the facade's stores (26 on 2026-10-06), not nothing.
    expect(Object.keys(freshValues).length).toBeGreaterThanOrEqual(26);
    expect(Object.keys(afterLogout).sort()).toEqual(Object.keys(freshValues).sort());
    for (const name of Object.keys(KEPT_ON_LOGOUT)) {
      expect(afterLogout[name], `${name} is reset now: drop it from KEPT_ON_LOGOUT`).not.toEqual(freshValues[name]);
      delete afterLogout[name];
      delete freshValues[name];
    }
    expect(afterLogout).toEqual(freshValues);
  });
});
