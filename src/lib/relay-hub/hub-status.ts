/**
 * How the hub reports one socket: the `RelayStatus` row built from the
 * socket table, the AUTH layer and the subscription registry.
 */
import type { RelayStatus } from './types';
import type { AuthLayer } from './auth';
import type { SubscriptionRegistry } from './registry';
import type { SocketEntry } from './sockets';
import { normalizeURL } from './canonical';

export function socketStatus(entry: SocketEntry, auth: AuthLayer, registry: SubscriptionRegistry): RelayStatus {
  return {
    url: entry.url,
    identityId: entry.identity.id,
    connection: entry.connection,
    auth: auth.stateFor(entry),
    socketGeneration: entry.generation,
    promptCount: auth.promptCountFor(entry),
    openSubs: registry.openCount(entry),
    budget: registry.budgetFor(entry),
    lastError: entry.lastError,
    authError: auth.recordFor(entry)?.lastError ?? null,
  };
}

/** The row for a relay the hub holds no socket for. */
export function idleStatus(url: string, identityId: string, maxSubsPerSocket: number): RelayStatus {
  return {
    url: normalizeURL(url),
    identityId,
    connection: 'idle',
    auth: 'none',
    socketGeneration: 0,
    promptCount: 0,
    openSubs: 0,
    budget: { used: 0, max: maxSubsPerSocket, parked: 0 },
    lastError: null,
    authError: null,
  };
}

/** The hub's `onStatus` listeners. Builds a row only when someone is listening. */
export class StatusFeed {
  private readonly listeners = new Set<(status: RelayStatus) => void>();

  constructor(private readonly statusOf: (entry: SocketEntry) => RelayStatus) {}

  subscribe(cb: (status: RelayStatus) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(entry: SocketEntry): void {
    if (this.listeners.size === 0) return;
    const status = this.statusOf(entry);
    for (const cb of Array.from(this.listeners)) cb(status);
  }

  clear(): void {
    this.listeners.clear();
  }
}
