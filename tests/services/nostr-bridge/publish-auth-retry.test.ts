/**
 * `authRetryOnRestricted`: a whitelist relay refuses an EVENT that beats
 * AUTH with `restricted:` (not `auth-required:`), and nostr-tools only
 * retries the latter. Every beacon and signal on a fresh socket to a pinned
 * voice relay was lost to it. The publish path AUTHs that socket explicitly
 * and republishes once (`publish.ts`, `authAndRepublish`).
 *
 * Moved verbatim from `voice-auth.test.ts` at RelayHub step 5: these cases
 * drive the relay's refusal through a pool-level fake (`refuseBeforeAuth`),
 * which the socket-level harness the voice tests now run on does not
 * model. Nothing here changed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';
import { generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';
import { unregisterBridge } from '@/services/nostr-bridge/bridge-slot';

const fake = vi.hoisted(() => {
  interface FakeRelay {
    url: string;
    connected: boolean;
    onclose?: () => void;
    challenge?: string;
    authed: boolean;
    authCalls: number;
    /** nostr-tools memoizes `auth()` per socket challenge; a new challenge means a new socket. */
    authPromise: Promise<string> | null;
    authPromiseChallenge: string | undefined;
    /** Reason to refuse with before / after AUTH; null accepts. */
    refuseBeforeAuth: string | null;
    refuseAfterAuth: string | null;
    publishes: NostrEvent[];
    auth(signer: (evt: unknown) => Promise<unknown>): Promise<string>;
    publish(ev: NostrEvent): Promise<string>;
  }

  const state = {
    pools: [] as Array<{ authHandler: ((url: string) => unknown) | null }>,
    relays: new Map<string, FakeRelay>(),
  };

  function relay(rawUrl: string): FakeRelay {
    // A real pool keys its relays by nostr-tools' normalizeURL, so
    // `wss://voice.example` and `wss://voice.example/` are one socket.
    const url = rawUrl.replace(/\/+$/, '');
    let r = state.relays.get(url);
    if (!r) {
      r = {
        url,
        connected: true,
        challenge: 'challenge-1',
        authed: false,
        authCalls: 0,
        authPromise: null,
        authPromiseChallenge: undefined,
        refuseBeforeAuth: null,
        refuseAfterAuth: null,
        publishes: [],
        auth(signer) {
          // Like nostr-tools: concurrent `auth()` calls on one socket share
          // one promise, the template carries the relay and the challenge,
          // and a fresh challenge (a reconnect) starts over unauthenticated.
          if (!this.challenge) return Promise.reject(new Error("can't perform auth, no challenge was received"));
          if (this.authPromise && this.authPromiseChallenge === this.challenge) return this.authPromise;
          this.authCalls += 1;
          this.authed = false;
          this.authPromiseChallenge = this.challenge;
          this.authPromise = (async () => {
            await signer({ kind: 22242, tags: [['relay', url], ['challenge', this.challenge ?? '']], content: '', created_at: 0 });
            this.authed = true;
            return 'ok';
          })();
          return this.authPromise;
        },
        async publish(ev) {
          this.publishes.push(ev);
          const reason = this.authed ? this.refuseAfterAuth : this.refuseBeforeAuth;
          if (reason) throw new Error(reason);
          return 'ok';
        },
      };
      state.relays.set(url, r);
    }
    return r;
  }

  class FakePool {
    authHandler: ((url: string) => unknown) | null;
    constructor(opts?: { automaticallyAuth?: (url: string) => unknown }) {
      this.authHandler = opts?.automaticallyAuth ?? null;
      state.pools.push(this);
    }
    subscribe() { return { close: () => {} }; }
    publish(relays: string[], ev: NostrEvent): Promise<string>[] {
      return relays.map((u) => relay(u).publish(ev));
    }
    close() {}
    async ensureRelay(url: string) { return relay(url); }
    async querySync() { return []; }
  }

  return { state, FakePool, relay };
});

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

const VOICE_RELAY = 'wss://voice.example';

async function loggedInBridge() {
  const clientMod = await import('@/services/nostr-bridge/client');
  const sk = generateSecretKey();
  const skHex = Array.from(sk).map((x) => x.toString(16).padStart(2, '0')).join('');
  const bridge = await clientMod.getBridge();
  await bridge.loginWithNsec(skHex, getPublicKey(sk));
  return clientMod.getBridgeImpl()!;
}

const signal = { kind: 25050, content: '{}', tags: [['p', 'x'.repeat(64)]] };
const toVoiceRelay = { extraRelays: [VOICE_RELAY], mode: 'replace' as const };

warmBridgeModules();

beforeEach(() => {
  fake.state.pools = [];
  fake.state.relays.clear();
  // A fresh bridge per test: its globalThis slot survives the module reset,
  // so it is emptied here. The reset stays for the page RelayHub singleton and
  // the module-level stores the bridge writes to.
  unregisterBridge();
  vi.resetModules();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('authRetryOnRestricted', () => {
  it('AUTHs and republishes once when a pre-AUTH EVENT is refused `restricted:`', async () => {
    const impl = await loggedInBridge();
    const relay = fake.relay(VOICE_RELAY);
    relay.refuseBeforeAuth = 'restricted: Access denied: your pubkey is not whitelisted';

    await expect(
      impl.publishEvent(signal, { ...toVoiceRelay, authRetryOnRestricted: true }),
    ).resolves.toMatchObject({ kind: 25050 });
    expect(relay.authCalls).toBe(1);
    expect(relay.publishes).toHaveLength(2);
  });

  it('does not retry without the option', async () => {
    const impl = await loggedInBridge();
    const relay = fake.relay(VOICE_RELAY);
    relay.refuseBeforeAuth = 'restricted: Access denied: your pubkey is not whitelisted';

    const refused = impl.publishEvent(signal, toVoiceRelay);
    await expect(refused).rejects.toThrow(/restricted/);
    // The relay's words stay in the message; the reader gets the code.
    await expect(refused).rejects.toMatchObject({ code: 'publish-rejected' });
    expect(relay.authCalls).toBe(0);
  });

  it('stops retrying on a socket that still refuses after AUTH', async () => {
    const impl = await loggedInBridge();
    const relay = fake.relay(VOICE_RELAY);
    relay.refuseBeforeAuth = 'restricted: not whitelisted';
    relay.refuseAfterAuth = 'restricted: not whitelisted';
    const opts = { ...toVoiceRelay, authRetryOnRestricted: true };

    await expect(impl.publishEvent(signal, opts)).rejects.toThrow(/restricted/);
    expect(relay.publishes).toHaveLength(2);

    // Same socket, same challenge: the key just isn't whitelisted. One
    // attempt per publish, not two.
    await expect(impl.publishEvent(signal, opts)).rejects.toThrow(/restricted/);
    expect(relay.publishes).toHaveLength(3);

    // A reconnect brings a fresh challenge: the pre-AUTH race is back. The
    // socket drops (the hub sees it through `onclose`) and the next publish
    // reconnects it with the relay's new challenge.
    relay.challenge = 'challenge-2';
    relay.onclose?.();
    await expect(impl.publishEvent(signal, opts)).rejects.toThrow(/restricted/);
    expect(relay.publishes).toHaveLength(5);
  });

  it('does not AUTH a relay that never sent a challenge', async () => {
    const impl = await loggedInBridge();
    const relay = fake.relay(VOICE_RELAY);
    relay.challenge = undefined;
    relay.refuseBeforeAuth = 'restricted: not whitelisted';

    await expect(
      impl.publishEvent(signal, { ...toVoiceRelay, authRetryOnRestricted: true }),
    ).rejects.toThrow(/restricted/);
    expect(relay.authCalls).toBe(0);
  });

  it('ignores refusals that AUTH cannot fix', async () => {
    const impl = await loggedInBridge();
    const relay = fake.relay(VOICE_RELAY);
    relay.refuseBeforeAuth = 'invalid: bad signature';

    await expect(
      impl.publishEvent(signal, { ...toVoiceRelay, authRetryOnRestricted: true }),
    ).rejects.toThrow(/invalid/);
    expect(relay.authCalls).toBe(0);
  });
});
