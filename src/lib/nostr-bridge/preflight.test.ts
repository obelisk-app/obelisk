/**
 * Whitelist preflight regression tests.
 *
 * Locks in the contract from `the-priority-should-be-snug-brooks.md` Phase 3:
 *   1. A kind:0 `authors:[me]` REQ fires on the active relay during connect.
 *   2. A CLOSED `restricted:` / `auth-required:` reason downgrades
 *      `relayAccess` IMMEDIATELY — no 4s deferred soak.
 *   3. An EOSE on the preflight filter promotes `relayAccess` to 'ok'.
 *
 * The FakePool here is hand-rolled (the one in `login-race.test.ts` auto-
 * EOSEs every sub, which would cancel the rejection path before this file
 * could trigger it).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';

interface CapturedSub {
  filter: Record<string, unknown>;
  relays: string[];
  onevent: (ev: NostrEvent) => void;
  oneose?: () => void;
  onclose?: (reasons: string[]) => void;
  closed: boolean;
}

const fake = vi.hoisted(() => {
  const state = {
    subs: [] as CapturedSub[],
  };

  class FakePool {
    subscribe(
      relays: string[],
      filter: Record<string, unknown>,
      opts: {
        onevent: (ev: NostrEvent) => void;
        oneose?: () => void;
        onclose?: (reasons: string[]) => void;
        onauth?: unknown;
      },
    ) {
      const sub: CapturedSub = {
        filter,
        relays,
        onevent: opts.onevent,
        oneose: opts.oneose,
        onclose: opts.onclose,
        closed: false,
      };
      state.subs.push(sub);
      // Intentionally do NOT auto-EOSE — tests drive the lifecycle explicitly.
      return {
        close: () => {
          sub.closed = true;
        },
      };
    }
    publish(_relays: string[], _event: NostrEvent): Promise<string>[] {
      return [Promise.resolve('ok')];
    }
    close(_relays: string[]): void {
      state.subs.forEach((s) => (s.closed = true));
    }
    async ensureRelay(_url: string, _opts?: { connectionTimeout?: number }) {
      return { connected: true };
    }
    async querySync(_relays: string[], _filter: Record<string, unknown>, _opts?: { maxWait?: number }): Promise<NostrEvent[]> {
      // Preflight tests don't subscribe to messages; the kind-9 querySync
      // fallback path won't fire. Returning empty is safe.
      return [];
    }
  }

  return { state, FakePool };
});

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

function makeKeypair() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const skHex = Array.from(sk).map((x) => x.toString(16).padStart(2, '0')).join('');
  return { skHex, pkHex: pk };
}

function findPreflightSub(myPubkey: string): CapturedSub | undefined {
  return fake.state.subs.find((s) => {
    const kinds = s.filter.kinds as number[] | undefined;
    const authors = s.filter.authors as string[] | undefined;
    const limit = s.filter.limit as number | undefined;
    return (
      Array.isArray(kinds) &&
      kinds.length === 1 &&
      kinds[0] === 0 &&
      Array.isArray(authors) &&
      authors.includes(myPubkey) &&
      limit === 1
    );
  });
}

beforeEach(() => {
  fake.state.subs = [];
  vi.resetModules();
  if (typeof window !== 'undefined') window.localStorage.clear();
});

afterEach(() => {
  fake.state.subs = [];
});

describe('preflight — whitelist detection', () => {
  it('fires a kind:0 authors=[me] REQ during connect', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    // Let the P2 microtask drain.
    await Promise.resolve();
    const preflight = findPreflightSub(pkHex);
    expect(preflight).toBeDefined();
  });

  it('flips relayAccess to "restricted" immediately on CLOSED restricted reason', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();

    const accessSnapshots: Array<{ value: Record<string, string>; at: number }> = [];
    bridge.subscribeRelayAccess((snap) => {
      accessSnapshots.push({ value: { ...snap }, at: performance.now() });
    });

    await bridge.loginWithNsec(skHex, pkHex);
    await Promise.resolve();
    const preflight = findPreflightSub(pkHex);
    expect(preflight).toBeDefined();
    expect(preflight!.relays.length).toBeGreaterThan(0);

    const triggeredAt = performance.now();
    preflight!.onclose?.(preflight!.relays.map(() => 'restricted: not on the whitelist'));

    // State flip should be effectively synchronous with the onclose call.
    const access = bridge.subscribeRelayAccess.bind(bridge);
    void access;
    // Wait one microtask — setRelayAccess updates the StateStore synchronously,
    // but the React-style notify happens via subscribers; the helper above
    // already captured them. Find the first 'restricted' snapshot.
    const restricted = accessSnapshots.find((s) =>
      Object.values(s.value).includes('restricted'),
    );
    expect(restricted).toBeDefined();
    // The flip should have landed within 200ms of the close — orders of
    // magnitude less than RELAY_ACCESS_SOAK_MS (4000ms).
    expect(restricted!.at - triggeredAt).toBeLessThan(200);
  });

  it('flips relayAccess to "auth-required" immediately on CLOSED auth-required', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();

    const accessSnapshots: Array<Record<string, string>> = [];
    bridge.subscribeRelayAccess((snap) => {
      accessSnapshots.push({ ...snap });
    });

    await bridge.loginWithNsec(skHex, pkHex);
    await Promise.resolve();
    const preflight = findPreflightSub(pkHex);
    expect(preflight).toBeDefined();

    preflight!.onclose?.(preflight!.relays.map(() => 'auth-required: must authenticate'));

    const authRequired = accessSnapshots.find((s) =>
      Object.values(s).includes('auth-required'),
    );
    expect(authRequired).toBeDefined();
  });

  it('promotes relayAccess to "ok" on preflight EOSE', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();

    const accessSnapshots: Array<Record<string, string>> = [];
    bridge.subscribeRelayAccess((snap) => {
      accessSnapshots.push({ ...snap });
    });

    await bridge.loginWithNsec(skHex, pkHex);
    await Promise.resolve();
    const preflight = findPreflightSub(pkHex);
    expect(preflight).toBeDefined();

    preflight!.oneose?.();

    const ok = accessSnapshots.find((s) => Object.values(s).includes('ok'));
    expect(ok).toBeDefined();
  });

  it('downgrades preflight EOSE-then-CLOSED auth-required instead of sticking on ok', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();

    const accessSnapshots: Array<Record<string, string>> = [];
    bridge.subscribeRelayAccess((snap) => {
      accessSnapshots.push({ ...snap });
    });

    await bridge.loginWithNsec(skHex, pkHex);
    await Promise.resolve();
    const preflight = findPreflightSub(pkHex);
    expect(preflight).toBeDefined();

    preflight!.oneose?.();
    expect(accessSnapshots.find((s) => Object.values(s).includes('ok'))).toBeDefined();

    preflight!.onclose?.(preflight!.relays.map(() => 'auth-required: this relay only accepts whitelisted pubkeys'));

    const authRequired = accessSnapshots.find((s) =>
      Object.values(s).includes('auth-required'),
    );
    expect(authRequired).toBeDefined();
  });

  it('does not retry preflight after the single attempt (maxAttempts=1)', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await Promise.resolve();

    const before = fake.state.subs.filter((s) => {
      const kinds = s.filter.kinds as number[] | undefined;
      const limit = s.filter.limit as number | undefined;
      return Array.isArray(kinds) && kinds[0] === 0 && limit === 1;
    }).length;
    expect(before).toBe(1);

    // CLOSED with a transient reason → scheduleRetry path. With maxAttempts:1,
    // no fresh REQ should be created.
    const preflight = findPreflightSub(pkHex);
    preflight!.onclose?.(preflight!.relays.map(() => 'restricted: temporary'));

    // Give backoff a fair shot to (incorrectly) re-fire.
    await new Promise((r) => setTimeout(r, 50));
    const after = fake.state.subs.filter((s) => {
      const kinds = s.filter.kinds as number[] | undefined;
      const limit = s.filter.limit as number | undefined;
      return Array.isArray(kinds) && kinds[0] === 0 && limit === 1;
    }).length;
    expect(after).toBe(1);
  });
});
