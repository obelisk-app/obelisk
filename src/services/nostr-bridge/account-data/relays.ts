import type { BridgeImpl } from '../facade/client';
import { CONCORD_DEFAULT_RELAYS } from '@/constants/nostr-bridge/concord';

const lookups = new WeakMap<BridgeImpl, { generation: number; promise: Promise<string[]> }>();
/** User inbox first, NIP-65 read relays second; shared public defaults only when no list exists. */
export function accountDataRelays(bridge: BridgeImpl): Promise<string[]> {
  const generation = bridge.getSessionGeneration();
  const prior = lookups.get(bridge);
  if (prior?.generation === generation) return prior.promise;
  const guard = bridge.captureSessionGuard();
  const promise = bridge.resolveAccountDataRelays().then(relays => {
    guard();
    return relays.length ? relays.slice(0, 10) : [...CONCORD_DEFAULT_RELAYS];
  });
  lookups.set(bridge, { generation, promise });
  return promise;
}
