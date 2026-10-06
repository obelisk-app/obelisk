/**
 * RelayHub configuration types, split out of `types.ts` (which re-exports
 * them): the injectable environment, the backoff policy and the options a
 * hub is built with.
 */
import type { RelayFactory } from './transport-types';

// ---- environment ----------------------------------------------------------

export interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Everything nondeterministic the hub touches, injectable for tests. */
export interface HubEnv {
  now(): number;
  random(): number;
  isOnline(): boolean;
  isHidden(): boolean;
  /** `window` in a browser: `online` and `visibilitychange` are listened for. */
  events: EventTargetLike | null;
}

export interface BackoffPolicy {
  /** First retry delay. Default 1000. */
  readonly baseMs: number;
  /** Cap. Default 30_000. */
  readonly maxMs: number;
  /** +-fraction. Default 0.2. */
  readonly jitter: number;
  /** Default Infinity. */
  readonly maxAttempts: number;
}

export interface RelayHubOptions {
  readonly relayFactory: RelayFactory;
  /**
   * Transport cleanup, called by `removeIdentity` after the identity's
   * sockets are closed: a transport that keeps per-identity state (the
   * pool-backed one holds a `SimplePool` per identity) drops it here, so a
   * finished DM call leaves no pool behind.
   */
  readonly releaseIdentity?: (identityId: string) => void;
  readonly env?: Partial<HubEnv>;
  /** Sockets across all identities. Default 16. See `sockets.ts` for the eviction order. */
  readonly maxSockets?: number;
  /** REQ slots per socket. Default 40. */
  readonly maxSubsPerSocket?: number;
  /** Handshake ceiling for `connect`. Default 8000. */
  readonly connectTimeoutMs?: number;
  readonly backoff?: Partial<BackoffPolicy>;
}
