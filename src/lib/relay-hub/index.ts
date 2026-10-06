/**
 * RelayHub: Obelisk's single connection owner (design round 2).
 *
 * It depends only on `nostr-tools` and its own files, so it can move to the
 * SDK unchanged. The singleton below runs on the pool-backed transport (one
 * `SimplePool` per identity, see `pool-backed-relay.ts`). Every REQ, query
 * and publish the app makes goes through `hub.subscribe` / `hub.query` /
 * `hub.publish` (migration step 10, round 16). Hub tests build hubs with
 * `createRelayHub({ relayFactory: new FakeRelayFactory().create })`.
 */
export * from './types';
export { canonicalFilter, canonicalFilters, subKey, queryKey, socketKey } from './canonical';
export { BoundedMap, BoundedSet } from './bounded-map';
export type { BoundedMapOptions, EvictionPolicy, EvictReason } from './bounded-map';
export { ProfileCache, documentVisibility } from './profile-cache';
export type { ProfileCacheOptions, VisibilitySource } from './profile-cache';
export { AuthLayer, AuthRefusedError, challengeOf } from './auth';
export type { AuthRecord } from './auth';
export { SocketTable, DEFAULT_BACKOFF } from './sockets';
export type { SocketEntry } from './sockets';
export { SubscriptionRegistry, isQuotaReason } from './registry';
export { QueryPath, DEFAULT_QUERY_OPTIONS } from './query';
export { planAuthorBatches, demuxByFilter, queryAuthorsBatched, DEFAULT_BATCH_OPTIONS } from './batch';
export type { BatchOptions, BatchPlan, BatchedQueryResult } from './batch';
export { createPoolLike } from './pool-like';
export { HubError } from './env';
export { createNostrRelayFactory } from './nostr-relay-factory';
export { createIdentityPool, createPoolBackedRelayFactory, PoolBackedRelay } from './pool-backed-relay';
export type { IdentityPoolOptions, PoolBackedFactoryOptions, PoolBackedRelayFactory } from './pool-backed-relay';
export { FakeRelay, FakeRelayFactory } from './fake-relay';
export type { FakeSub } from './fake-relay';
export {
  RelayHubImpl,
  createRelayHub,
  DEFAULT_MAX_SOCKETS,
  DEFAULT_MAX_SUBS_PER_SOCKET,
  DEFAULT_CONNECT_TIMEOUT_MS,
} from './hub';

import type { RelayHub, RelayHubOptions } from './types';
import { createRelayHub } from './hub';
import { createIdentityPool, createPoolBackedRelayFactory, type IdentityPoolOptions } from './pool-backed-relay';

let singleton: RelayHub | null = null;

export interface GetRelayHubOptions extends Omit<RelayHubOptions, 'relayFactory'> {
  readonly relayFactory?: RelayHubOptions['relayFactory'];
  /** How the default pool-backed transport builds its pools; ignored when `relayFactory` is given. */
  readonly transport?: Omit<IdentityPoolOptions, 'automaticallyAuth'>;
}

/**
 * The page-wide hub. Identity is attached with `setIdentity`, so one
 * instance per page is safe. Options matter only on the first call, which
 * creates the instance; later callers share it.
 */
export function getRelayHub(opts?: GetRelayHubOptions): RelayHub {
  if (!singleton) {
    const { relayFactory, transport, ...rest } = opts ?? {};
    if (relayFactory) {
      singleton = createRelayHub({ ...rest, relayFactory });
    } else {
      const backed = createPoolBackedRelayFactory({
        createPool: (automaticallyAuth) => createIdentityPool({ ...transport, automaticallyAuth }),
      });
      singleton = createRelayHub({ ...rest, relayFactory: backed.factory, releaseIdentity: backed.releaseIdentity });
    }
  }
  return singleton;
}

/**
 * The page-wide hub if something has created it, without creating one. For
 * a caller that must ride the page's hub but must not be the one to create
 * it with default options (a DM call: the bridge always exists first).
 */
export function currentRelayHub(): RelayHub | null {
  return singleton;
}

export function resetRelayHubForTests(): void {
  singleton?.dispose();
  singleton = null;
}
