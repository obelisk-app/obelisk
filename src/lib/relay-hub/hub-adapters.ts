/**
 * Hub wiring kept out of `hub.ts`: the bound `RelayHub` view handed to the
 * `SimplePool`-shaped facade.
 */
import type { RelayHub } from './types';

/** A plain-object `RelayHub` whose methods stay bound to `hub` when spread. */
export function bindHub(hub: RelayHub): RelayHub {
  return {
    setIdentity: (i) => hub.setIdentity(i),
    removeIdentity: (id) => hub.removeIdentity(id),
    getIdentity: (id) => hub.getIdentity(id),
    acquireAuthLease: (u, r, id) => hub.acquireAuthLease(u, r, id),
    leaseCount: (u, id) => hub.leaseCount(u, id),
    promptCount: () => hub.promptCount(),
    connect: (u, o) => hub.connect(u, o),
    disconnect: (u, o) => hub.disconnect(u, o),
    dropSocket: (u, id) => hub.dropSocket(u, id),
    status: (u, id) => hub.status(u, id),
    statuses: () => hub.statuses(),
    onStatus: (cb) => hub.onStatus(cb),
    subscribe: (s) => hub.subscribe(s),
    query: (s) => hub.query(s),
    publish: (s) => hub.publish(s),
    poolLike: () => hub.poolLike(),
    dispose: () => hub.dispose(),
  };
}
