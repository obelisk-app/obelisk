/**
 * The row store behind the social relay indicator: snapshot identity,
 * no-op patches, the failure soak and the watched-set sync.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addListener,
  clearPendingFailure,
  patch,
  resetStore,
  snapshot,
  soakFailure,
  statuses,
  syncEntries,
} from '@/services/social/relay-status-store';
import { relayStatusSummary } from '@/services/social/relay-summary';
import * as relayStatus from '@/services/social/relay-status';

const A = 'wss://a.example';
const B = 'wss://b.example';

describe('relay status store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
  });
  afterEach(() => {
    resetStore();
    vi.useRealTimers();
  });

  it('keeps the snapshot identity until something actually changes', () => {
    syncEntries([A]);
    const first = snapshot();
    expect(snapshot()).toBe(first);
    patch(A, { state: 'unknown' });
    expect(snapshot()).toBe(first);
    patch(A, { state: 'connected' });
    expect(snapshot()).not.toBe(first);
    expect(snapshot()[A]?.state).toBe('connected');
  });

  it('notifies listeners on subscribe and on each real change', () => {
    const seen: string[] = [];
    const off = addListener((s) => seen.push(Object.values(s).map((r) => r.state).join(',')));
    syncEntries([A]);
    patch(A, { state: 'connecting' });
    patch(A, { state: 'connecting' });
    off();
    patch(A, { state: 'connected' });
    expect(seen).toEqual(['', 'unknown', 'connecting']);
  });

  it('runs one soak per relay and lets a recovery cancel it', () => {
    const fire = vi.fn();
    soakFailure(A, 1000, fire);
    soakFailure(A, 1000, fire);
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(1);
    soakFailure(A, 1000, fire);
    clearPendingFailure(A);
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('syncs rows to the watched set and cancels soaks for removed relays', () => {
    const fire = vi.fn();
    syncEntries([A, B]);
    soakFailure(B, 1000, fire);
    syncEntries([A]);
    vi.advanceTimersByTime(1000);
    expect([...statuses.keys()]).toEqual([A]);
    expect(fire).not.toHaveBeenCalled();
  });

  it('is reachable through relay-status for the summary', () => {
    expect(relayStatus.relayStatusSummary).toBe(relayStatusSummary);
    expect(relayStatusSummary([A, B], { [A]: { url: A, state: 'connected', latencyMs: 1, notes: 0, lastChange: 0 } }))
      .toEqual({ total: 2, connected: 1, state: 'connected' });
  });
});
