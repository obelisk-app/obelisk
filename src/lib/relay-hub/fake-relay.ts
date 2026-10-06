/**
 * Deterministic relay harness. Mirrors the `AbstractRelay` behaviours the
 * hub depends on, in the same order nostr-tools performs them:
 *
 *  - `connect()` resolves on a microtask (or waits for `completeConnect()` in
 *    manual mode); a new connection clears the challenge and the AUTH memo
 *  - an `AUTH` frame (`challenge(c)`) stores the challenge and, if `onauth`
 *    is installed, runs the memoized `auth()` exactly like nostr-tools
 *  - `drop()` marks the socket down, fires `onclose`, then closes every
 *    open subscription with `'relay connection closed'` (handleHardClose order)
 *  - `close()` closes subscriptions with `'relay connection closed by us'`,
 *    marks down, then fires `onclose`
 *  - `emit()` delivers through `alreadyHaveEvent` and `matchFilters`
 *
 * Nothing here sleeps; every test drives it with explicit calls and fake
 * timers.
 */
import type { Event as NostrEvent, EventTemplate, Filter, VerifiedEvent } from 'nostr-tools';
import { matchFilters } from 'nostr-tools/filter';
import { normalizeURL } from 'nostr-tools/utils';
import type { Identity, RelayLike, RelaySubscribeParams, Signer, SubscriptionLike } from './types';

export interface FakeSub extends SubscriptionLike {
  readonly filters: Filter[];
  readonly params: RelaySubscribeParams;
  closed: boolean;
  eosed: boolean;
}

interface PendingPublish {
  resolve(reason: string): void;
  reject(err: Error): void;
}

export class FakeRelay implements RelayLike {
  connected = false;
  onclose: (() => void) | null = null;
  onauth: undefined | Signer = undefined;

  connectMode: 'auto' | 'manual' = 'auto';
  /** When set, the next `connect()` rejects with this message. */
  failNextConnect: string | null = null;
  /** When false, `publish()` waits for `ok()` / `rejectPublish()`. */
  autoAck = true;

  connectCalls = 0;
  closeCalls = 0;
  /** Every REQ ever sent, in order. */
  readonly reqLog: { id: string; filters: Filter[] }[] = [];
  readonly closeLog: string[] = [];
  readonly sentAuth: VerifiedEvent[] = [];
  readonly published: NostrEvent[] = [];
  readonly subs = new Map<string, FakeSub>();

  private serial = 0;
  private challengeValue: string | undefined;
  private authPromise: Promise<string> | undefined;
  private authResolvers: { resolve(v: string): void; reject(e: Error): void } | null = null;
  private pendingConnect: { resolve(): void; reject(e: Error): void } | null = null;
  private readonly pendingPublishes = new Map<string, PendingPublish>();

  constructor(readonly url: string, readonly identityId: string) {}

  // ---- RelayLike ------------------------------------------------------------

  connect(): Promise<void> {
    this.connectCalls += 1;
    this.challengeValue = undefined;
    this.authPromise = undefined;
    this.authResolvers = null;
    if (this.failNextConnect) {
      const reason = this.failNextConnect;
      this.failNextConnect = null;
      return Promise.reject(new Error(reason));
    }
    if (this.connectMode === 'manual') {
      return new Promise<void>((resolve, reject) => {
        this.pendingConnect = {
          resolve: () => {
            this.pendingConnect = null;
            this.connected = true;
            resolve();
          },
          reject: (e) => {
            this.pendingConnect = null;
            reject(e);
          },
        };
      });
    }
    return Promise.resolve().then(() => {
      this.connected = true;
    });
  }

  close(): void {
    this.closeCalls += 1;
    this.closeAllSubs('relay connection closed by us');
    this.connected = false;
    this.onclose?.();
  }

  subscribe(filters: Filter[], params: RelaySubscribeParams): SubscriptionLike {
    const id = params.id ?? `sub:${++this.serial}`;
    const sub: FakeSub = {
      id,
      filters: filters.map((f) => ({ ...f })),
      params,
      closed: false,
      eosed: false,
      close: (reason = 'closed by caller') => {
        if (sub.closed) return;
        sub.closed = true;
        if (this.connected) this.closeLog.push(id);
        this.subs.delete(id);
        params.onclose?.(reason);
      },
    };
    this.subs.set(id, sub);
    this.reqLog.push({ id, filters: sub.filters });
    return sub;
  }

  publish(event: NostrEvent): Promise<string> {
    this.published.push(event);
    if (this.autoAck) return Promise.resolve('');
    return new Promise<string>((resolve, reject) => {
      this.pendingPublishes.set(event.id, { resolve, reject });
    });
  }

  auth(sign: Signer): Promise<string> {
    const challenge = this.challengeValue;
    if (!challenge) return Promise.reject(new Error("can't perform auth, no challenge was received"));
    if (this.authPromise) return this.authPromise;
    this.authPromise = new Promise<string>((resolve, reject) => {
      this.authResolvers = { resolve, reject };
      const template: EventTemplate = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['relay', this.url], ['challenge', challenge]],
        content: '',
      };
      void sign(template).then(
        (evt) => {
          this.sentAuth.push(evt);
        },
        () => {
          // nostr-tools only warns here; the promise stays pending.
        },
      );
    });
    return this.authPromise;
  }

  // ---- test drivers -----------------------------------------------------------

  completeConnect(): void {
    this.pendingConnect?.resolve();
  }

  failConnect(reason = 'connection failed'): void {
    this.pendingConnect?.reject(new Error(reason));
  }

  /** The relay sends `["AUTH", challenge]`. */
  challenge(value: string): void {
    this.challengeValue = value;
    if (this.onauth) void this.auth(this.onauth).catch(() => undefined);
  }

  get currentChallenge(): string | undefined {
    return this.challengeValue;
  }

  /** `["OK", id, true]` for the pending AUTH. */
  acceptAuth(): void {
    this.authResolvers?.resolve('');
    this.authResolvers = null;
  }

  /** `["OK", id, false, reason]` for the pending AUTH. */
  refuseAuth(reason = 'restricted: not whitelisted'): void {
    this.authResolvers?.reject(new Error(reason));
    this.authResolvers = null;
  }

  openSubs(): FakeSub[] {
    return Array.from(this.subs.values());
  }

  /** Deliver an EVENT to every open sub whose filters match (or to one sub by id). */
  emit(event: NostrEvent, subId?: string): number {
    let delivered = 0;
    for (const sub of this.openSubs()) {
      if (subId && sub.id !== subId) continue;
      if (sub.params.alreadyHaveEvent?.(event.id)) continue;
      if (!matchFilters(sub.filters, event)) continue;
      sub.params.onevent?.(event);
      delivered += 1;
    }
    return delivered;
  }

  eose(subId?: string): void {
    for (const sub of this.openSubs()) {
      if (subId && sub.id !== subId) continue;
      if (sub.eosed) continue;
      sub.eosed = true;
      sub.params.oneose?.();
    }
  }

  /** The relay sends `["CLOSED", id, reason]`. */
  closed(subId: string, reason: string): void {
    const sub = this.subs.get(subId);
    if (!sub) return;
    sub.closed = true;
    this.subs.delete(subId);
    sub.params.onclose?.(reason);
  }

  ok(eventId: string, reason = ''): void {
    const p = this.pendingPublishes.get(eventId);
    if (!p) return;
    this.pendingPublishes.delete(eventId);
    p.resolve(reason);
  }

  rejectPublish(eventId: string, reason: string): void {
    const p = this.pendingPublishes.get(eventId);
    if (!p) return;
    this.pendingPublishes.delete(eventId);
    p.reject(new Error(reason));
  }

  /** Transport drop, in nostr-tools' handleHardClose order. */
  drop(): void {
    this.connected = false;
    this.pendingConnect = null;
    this.onclose?.();
    this.closeAllSubs('relay connection closed');
  }

  private closeAllSubs(reason: string): void {
    for (const sub of this.openSubs()) {
      sub.closed = true;
      this.subs.delete(sub.id);
      sub.params.onclose?.(reason);
    }
  }
}

export class FakeRelayFactory {
  readonly relays: FakeRelay[] = [];
  readonly calls: { url: string; identityId: string }[] = [];

  /** Pass as `relayFactory`. */
  readonly create = (url: string, identity: Identity): FakeRelay => {
    this.calls.push({ url, identityId: identity.id });
    const relay = new FakeRelay(url, identity.id);
    this.relays.push(relay);
    return relay;
  };

  get(url: string, identityId = 'session'): FakeRelay | undefined {
    const normalized = normalizeURL(url);
    return this.relays.find((r) => r.url === normalized && r.identityId === identityId);
  }

  /** Every relay created for `url`, across identities. */
  allFor(url: string): FakeRelay[] {
    const normalized = normalizeURL(url);
    return this.relays.filter((r) => r.url === normalized);
  }
}
