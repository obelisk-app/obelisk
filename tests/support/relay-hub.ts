/**
 * Shared helpers for the hub's own tests. Imports only nostr-tools, vitest
 * and this directory, like everything else here. Not a test file itself.
 */
import { vi } from 'vitest';
import type { Event as NostrEvent, EventTemplate, VerifiedEvent } from 'nostr-tools';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { normalizeURL } from 'nostr-tools/utils';
import { FakeRelayFactory } from '@nostr-wot/relay/hub';
import { createRelayHub, type RelayHubImpl } from '@nostr-wot/relay/hub';
import type { Identity, RelayHubOptions, RelayStatus, Signer } from '@nostr-wot/relay/hub';

// Already normalized (nostr-tools keeps the trailing slash on a bare host),
// so `status(A).url === A` and relay lookups compare equal.
export const A = normalizeURL('wss://relay-a.example');
export const B = normalizeURL('wss://relay-b.example');
export const C = normalizeURL('wss://relay-c.example');

export interface TestHub {
  hub: RelayHubImpl;
  factory: FakeRelayFactory;
  /** Toggle to simulate going offline; `fireOnline()` resumes. */
  net: { online: boolean };
  events: { fire(type: string): void };
  statuses: RelayStatus[];
}

export function makeHub(opts: Partial<Omit<RelayHubOptions, 'relayFactory'>> = {}): TestHub {
  const factory = new FakeRelayFactory();
  const net = { online: true };
  const listeners = new Map<string, Set<() => void>>();
  const events = {
    addEventListener: (type: string, cb: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(cb);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, cb: () => void) => {
      listeners.get(type)?.delete(cb);
    },
    fire: (type: string) => {
      for (const cb of Array.from(listeners.get(type) ?? [])) cb();
    },
  };
  const hub = createRelayHub({
    relayFactory: factory.create,
    env: {
      now: () => Date.now(),
      random: () => 0.5, // jitter factor 1.0: delays equal the nominal backoff
      isOnline: () => net.online,
      isHidden: () => false,
      events,
    },
    ...opts,
  });
  const statuses: RelayStatus[] = [];
  hub.onStatus((s) => statuses.push(s));
  return { hub, factory, net, events, statuses };
}

export interface TestSigner {
  signer: Signer;
  pubkey: string;
  calls: EventTemplate[];
  /** When set, the next call rejects with this message instead of signing. */
  failNext: string | null;
  /** When true, calls stay pending until `resolvePending()`. */
  manual: boolean;
  resolvePending(): void;
}

/** A real Schnorr signer (microseconds) that records every template it was asked to sign. */
export function makeSigner(): TestSigner {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const calls: EventTemplate[] = [];
  const pending: (() => void)[] = [];
  const state: TestSigner = {
    pubkey,
    calls,
    failNext: null,
    manual: false,
    resolvePending: () => {
      for (const r of pending.splice(0)) r();
    },
    signer: (template: EventTemplate): Promise<VerifiedEvent> => {
      calls.push(template);
      if (state.failNext) {
        const reason = state.failNext;
        state.failNext = null;
        return Promise.reject(new Error(reason));
      }
      const evt = finalizeEvent(template, sk);
      if (!state.manual) return Promise.resolve(evt);
      return new Promise<VerifiedEvent>((resolve) => pending.push(() => resolve(evt)));
    },
  };
  return state;
}

export function sessionIdentity(signer: TestSigner, extra: Partial<Identity> = {}): Identity {
  return { id: 'session', pubkey: signer.pubkey, signer: signer.signer, authPolicy: 'auth-when-challenged', ...extra };
}

export function ephemeralIdentity(callId: string, signer: TestSigner): Identity {
  return { id: `ephemeral:${callId}`, pubkey: signer.pubkey, signer: signer.signer, authPolicy: 'never-auth' };
}

let eventSerial = 0;

/** An unsigned-but-shaped event; `FakeRelay` does not verify signatures. */
export function fakeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  eventSerial += 1;
  return {
    id: overrides.id ?? eventSerial.toString(16).padStart(64, '0'),
    pubkey: overrides.pubkey ?? 'a'.repeat(64),
    created_at: overrides.created_at ?? Math.floor(Date.now() / 1000),
    kind: overrides.kind ?? 9,
    tags: overrides.tags ?? [],
    content: overrides.content ?? `event ${eventSerial}`,
    sig: overrides.sig ?? 'b'.repeat(128),
  };
}

/** Flush microtasks and zero-delay timers without moving the fake clock. */
export async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

export async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}
