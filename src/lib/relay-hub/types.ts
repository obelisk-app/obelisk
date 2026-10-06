/**
 * RelayHub public types.
 *
 * This module imports nothing from the rest of obelisk, only `nostr-tools`,
 * so it can later move to the SDK unchanged. Each module's header documents
 * its own contract (`sockets.ts` the supervisor and budget, `auth.ts` the
 * AUTH state machine, `registry.ts` the refcounted REQs, `canonical.ts` the
 * keys, `query.ts` / `profile-cache.ts` the cache policies, `batch.ts` the
 * one merge); the design is `audits/obelisk/round2/DESIGN-relay-hub.md`
 * as amended by `DECISIONS.md` next to it. The transport seams live in
 * `transport-types.ts` and the configuration in `config-types.ts`; both are
 * re-exported here, so `./types` stays the one import.
 */
import type { Event as NostrEvent, EventTemplate, Filter, VerifiedEvent } from 'nostr-tools';
import type { PoolLike } from './transport-types';

export type {
  PoolLike,
  PoolPublishParams,
  PoolRelayLike,
  PoolSubscribeParams,
  RelayFactory,
  RelayFactoryHooks,
  RelayLike,
  RelaySubscribeParams,
  SimplePoolLike,
  SubCloser,
  SubscriptionLike,
} from './transport-types';
export type { BackoffPolicy, EventTargetLike, HubEnv, RelayHubOptions } from './config-types';

/**
 * A relay URL after nostr-tools `normalizeURL` (scheme fixed, trailing slash
 * dropped, query sorted). Every map in the hub is keyed by this.
 */
export type RelayUrl = string;

export type Signer = (template: EventTemplate) => Promise<VerifiedEvent>;

export type AuthPolicy = 'auth-when-challenged' | 'never-auth';

/**
 * Who a socket speaks for. Sockets are keyed on `(relayUrl, identity.id)`,
 * so two identities never share a connection: a relay cannot link an
 * ephemeral call key to the session pubkey through a NIP-42 AUTH on the
 * same socket (the relay still sees one IP for both; that is a known,
 * documented limit). `'session'` is the logged-in user; a DM call uses
 * `ephemeral:${callId}` with `authPolicy: 'never-auth'`.
 */
export interface Identity {
  readonly id: string;
  readonly pubkey: string | null;
  readonly signer: Signer | null;
  readonly authPolicy: AuthPolicy;
  /**
   * True when `signer` signs locally (nsec). A local signature is not a
   * prompt, so it does not count toward `promptCount`. Default false.
   */
  readonly localSigner?: boolean;
}

export const SESSION_IDENTITY_ID = 'session';

export type ConnectionState =
  | 'idle'          // known socket, nothing wanted or explicitly closed
  | 'connecting'    // first handshake in flight
  | 'connected'
  | 'reconnecting'  // dropped, the hub supervisor has a retry scheduled or in flight
  | 'offline'       // env.isOnline() is false, retries paused until 'online'
  | 'failed';       // gave up (maxAttempts) or URL invalid

export type AuthState =
  | 'none'          // no identity, never-auth identity, or no lease on this relay
  | 'not-required'  // socket up with a signer installed, relay never sent AUTH
  | 'challenged'    // AUTH received, signer not yet called
  | 'signing'       // signer prompt in flight, or AUTH sent and no OK yet
  | 'authenticated' // relay accepted our kind 22242 on this socket generation
  | 'refused'       // relay rejected the AUTH (`restricted:`); that challenge is never re-signed
  | 'failed'        // signer threw / timed out; the next challenge retries
  | 'stale';        // socket dropped after 'authenticated'; the next generation is challenged again

export interface RelayStatus {
  readonly url: RelayUrl;
  readonly identityId: string;
  readonly connection: ConnectionState;
  readonly auth: AuthState;
  /** Incremented on every successful handshake. One AUTH signature per generation is the floor NIP-42 allows. */
  readonly socketGeneration: number;
  /** Signer prompts answered for this (relay, identity). Local signers never increment it. */
  readonly promptCount: number;
  readonly openSubs: number;
  readonly budget: { readonly used: number; readonly max: number; readonly parked: number };
  /** Last connection error. */
  readonly lastError: string | null;
  /** Last AUTH error: the relay's OK reason on refusal, or the signer's message. */
  readonly authError: string | null;
}

/** Slot priority when a socket's REQ budget is full. Lower classes are parked first. */
export type SubPriority = 'voice' | 'active' | 'dm' | 'background';

export type SubStatus =
  | 'pending'   // waiting for the socket
  | 'open'      // REQ sent
  | 'eose'      // the relay answered EOSE at least once on this generation
  | 'parked'    // budget: closed locally, reopens when a slot frees
  | 'closed';   // released by the last holder, terminal relay CLOSED, or identity removed

export interface SubscribeSpec {
  readonly relays: readonly string[];
  /** One REQ per relay carries all of these filters. */
  readonly filters: readonly Filter[];
  /** Default `'session'`. Must name an identity installed with `setIdentity`. */
  readonly identityId?: string;
  readonly priority?: SubPriority;
  /** Debug only, never part of the key. */
  readonly label?: string;
  /**
   * Watchdog: if a REQ gets neither an EVENT nor an EOSE within this many
   * ms of being issued, the hub closes it and re-issues it with backoff
   * (1 s doubling to 30 s). A NIP-42 AUTH race can swallow the first REQ
   * on a fresh socket and a transient blip can drop one silently; EOSE
   * alone proves the REQ is live. While the socket's AUTH prompt is in
   * flight the watchdog waits instead of firing. nostr-tools' synthetic
   * EOSE is kept behind it (`eoseTimeout = watchdogMs + 1000`) so a silent
   * timeout is never mistaken for an authoritative empty REQ. Undefined:
   * no watchdog. When holders disagree the shortest wins.
   */
  readonly watchdogMs?: number;
  /**
   * Issues of the REQ on one socket generation without an EVENT in
   * between, counting the first, before the hub gives up: the watchdog and
   * every retried relay CLOSED count against it. Past it the sub is
   * terminated (`onClosed` with a `hub:` reason), so a later identical
   * subscribe starts fresh instead of attaching to a dead REQ. Default
   * unbounded. When holders disagree the largest wins.
   */
  readonly maxAttempts?: number;
  /** Delivered once per distinct event id per relay (per socket generation set). */
  onEvent(ev: NostrEvent, relay: RelayUrl): void;
  onEose?(relay: RelayUrl): void;
  /**
   * Relay-initiated CLOSED after the hub's retry policy is exhausted, or a
   * terminal reason (`restricted:`). Transport drops are NOT reported here;
   * the hub reopens the REQ on the next socket by itself.
   */
  onClosed?(relay: RelayUrl, reason: string): void;
  /**
   * Every relay CLOSED on this REQ, as it happens and before the hub
   * decides to retry, park or give up. For callers that interpret relay
   * verdicts (an access banner) and must see the first `auth-required:` as
   * well as the last. A holder that releases inside this callback takes the
   * REQ out of the hub's hands: no park, no retry. Transport drops are not
   * reported. `onClosed` is the terminal one.
   */
  onRelayClosed?(relay: RelayUrl, reason: string): void;
  onStatus?(status: SubStatus, relay: RelayUrl): void;
}

export interface SubscriptionHandle {
  /** `${relayUrl}|${canonicalFilters}` per relay; exposed for tests and debug. */
  readonly keys: readonly string[];
  /** True if at least one relay REQ was already open when this handle attached. */
  readonly shared: boolean;
  /** Idempotent. The REQ on each relay closes when its last holder releases. */
  release(): void;
  /**
   * Change this holder's priority. The REQ takes the highest priority among
   * its holders, which decides its place in the reconnect re-issue order
   * and what the budget parks first. A channel coming into view is bumped
   * to `'active'` and the one leaving it back to `'background'`.
   */
  setPriority(priority: SubPriority): void;
}

export type QueryCacheMode = 'cached-ok' | 'fresh' | 'bypass';

export interface QuerySpec {
  readonly relays: readonly string[];
  readonly filters: readonly Filter[];
  readonly identityId?: string;
  /** Hard ceiling. EOSE from every relay settles earlier. Default 4000. */
  readonly maxWaitMs?: number;
  /** Debug only: the label the REQ carries on the wire. Never part of the key. Default `'hub-query'`. */
  readonly label?: string;
  readonly cache?: {
    /** 'cached-ok' (default): serve an unexpired cached result. 'fresh': wire, then overwrite. 'bypass': wire, no read, no write. */
    readonly mode?: QueryCacheMode;
    /** Default 60_000 for a complete result; an incomplete one always uses the short TTL. */
    readonly ttlMs?: number;
  };
}

export type QueryRelayOutcome = 'eose' | 'closed' | 'timeout' | 'unreachable';

export interface QueryResult {
  readonly events: readonly NostrEvent[];
  /** Every relay in the spec reached EOSE. */
  readonly complete: boolean;
  readonly fromCache: boolean;
  readonly perRelay: Readonly<Record<RelayUrl, QueryRelayOutcome>>;
}

export interface PublishSpec {
  readonly relays: readonly string[];
  readonly event: NostrEvent;
  readonly identityId?: string;
  /**
   * 'policy' (default): if the relay answers `auth-required:` and this socket
   * holds a signer, wait for the AUTH verdict and republish once. 'never':
   * report the rejection as is. 'auth-first': authenticate the socket before
   * the one publish (ride the AUTH in flight, or answer the challenge the
   * relay already sent), for a relay that refused the event before AUTH in
   * words other than `auth-required:` (a whitelist's `restricted:`). Without
   * a signer on the socket (no lease), or when AUTH fails, nothing is sent
   * and the result is `rejected` with reason {@link AUTH_UNAVAILABLE}.
   */
  readonly authMode?: PublishAuthMode;
  /** Ephemeral kinds (20000-29999) default to 750 ms; others to 4000 ms. */
  readonly ackTimeoutMs?: number;
  /**
   * Called once per relay as soon as that relay's result is known, before
   * the returned array settles. One dead relay therefore never delays the
   * report for the ones that answered.
   */
  onResult?(result: PublishResult): void;
}

export type PublishAuthMode = 'policy' | 'never' | 'auth-first';

/** The `reason` of an `'auth-first'` publish that could not authenticate, and so sent nothing. */
export const AUTH_UNAVAILABLE = 'hub: auth unavailable';

export interface PublishResult {
  readonly url: RelayUrl;
  readonly status: 'ok' | 'rejected' | 'timeout' | 'unreachable';
  readonly reason: string | null;
}

/**
 * Why a caller holds NIP-42 permission on a relay. `'publish'` is the
 * transient lease a publish takes for one AUTH-then-republish round when the
 * caller explicitly opted into authenticating for that event. `'wallet'` is
 * a wallet connection's own client-key identity, taken only once its relay
 * has asked for AUTH.
 */
export type AuthLeaseReason = 'active' | 'dm' | 'voice' | 'watch' | 'publish' | 'wallet';

export interface AuthLease {
  release(): void;
}

export interface RelayHub {
  // ---- identities and AUTH policy ------------------------------------------
  /**
   * Install or replace an identity. Replacing one whose `pubkey` or
   * `authPolicy` changed closes every socket it owns: a socket the relay has
   * bound to pubkey X must not be reused by Y. Live subscriptions survive
   * and are re-issued on the new sockets.
   */
  setIdentity(identity: Identity): void;
  /** Close the identity's sockets, drop its AUTH records, leases and caches, close its subscriptions. */
  removeIdentity(identityId: string): void;
  getIdentity(identityId: string): Identity | undefined;
  /**
   * Refcounted permission to answer NIP-42 on `url` as `identityId`. With
   * zero leases the socket has no `onauth`, so the relay never learns the
   * pubkey. Never opens a socket by itself.
   */
  acquireAuthLease(url: string, reason: AuthLeaseReason, identityId?: string): AuthLease;
  /** Live leases on `(url, identityId)`; zero means the socket never answers AUTH. */
  leaseCount(url: string, identityId?: string): number;
  /** Total signer prompts answered, summed over relays and identities. */
  promptCount(): number;

  // ---- connections ----------------------------------------------------------
  connect(url: string, opts?: { identityId?: string; timeoutMs?: number }): Promise<void>;
  /**
   * Drop the explicit hold on the socket. With live subscriptions it stays
   * up. Otherwise `graceMs` (default 0) keeps it open that long, so
   * A -> B -> A inside the grace costs zero handshakes and zero prompts.
   */
  disconnect(url: string, opts?: { identityId?: string; graceMs?: number }): void;
  /**
   * Close the socket now even with live subscriptions, keeping the entry:
   * the supervisor reconnects it at once if anything wants it. For a socket
   * the relay has half-closed (its idle cap) that the client has not noticed.
   */
  dropSocket(url: string, identityId?: string): void;
  status(url: string, identityId?: string): RelayStatus;
  statuses(): readonly RelayStatus[];
  onStatus(cb: (status: RelayStatus) => void): () => void;

  // ---- data -----------------------------------------------------------------
  subscribe(spec: SubscribeSpec): SubscriptionHandle;
  query(spec: QuerySpec): Promise<QueryResult>;
  publish(spec: PublishSpec): Promise<readonly PublishResult[]>;

  // ---- adapters -------------------------------------------------------------
  poolLike(): PoolLike;
  dispose(): void;
}
