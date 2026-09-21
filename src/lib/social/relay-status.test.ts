import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const poolMocks = vi.hoisted(() => ({
  ensureRelay: vi.fn(),
  seenOn: new Map<string, Set<{ url: string }>>(),
  listConnectionStatus: vi.fn(() => new Map<string, boolean>()),
  events: {} as { onConnect?: (url: string) => void; onFailure?: (url: string) => void },
}));

vi.mock('./pool', () => ({
  poolEvents: poolMocks.events,
  socialPool: () => ({
    ensureRelay: poolMocks.ensureRelay,
    seenOn: poolMocks.seenOn,
    listConnectionStatus: poolMocks.listConnectionStatus,
  }),
}));

import {
  FAILURE_SOAK_MS,
  _resetRelayStatus,
  getRelayStatuses,
  markConnected,
  markFailed,
  probeRelay,
  subscribeRelayStatus,
  watchRelays,
  relayStatusSummary,
  type RelayStatus,
} from './relay-status';

const A = 'wss://a.example';
const B = 'wss://b.example';

beforeEach(() => {
  vi.useFakeTimers();
  _resetRelayStatus();
  poolMocks.ensureRelay.mockReset();
  poolMocks.seenOn.clear();
  poolMocks.listConnectionStatus.mockReturnValue(new Map());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchRelays', () => {
  it('creates a row per relay, unknown until probed', () => {
    poolMocks.ensureRelay.mockImplementation(() => new Promise(() => {}));
    watchRelays([A, B]);
    const statuses = getRelayStatuses();
    expect(Object.keys(statuses).sort()).toEqual([A, B].sort());
  });

  it('drops rows for relays the user removed', () => {
    poolMocks.ensureRelay.mockImplementation(() => new Promise(() => {}));
    watchRelays([A, B]);
    watchRelays([A]);
    expect(Object.keys(getRelayStatuses())).toEqual([A]);
  });

  it('normalises urls so a trailing slash is the same relay', () => {
    poolMocks.ensureRelay.mockImplementation(() => new Promise(() => {}));
    watchRelays([`${A}/`]);
    expect(Object.keys(getRelayStatuses())).toEqual([A]);
  });
});

describe('failure soak', () => {
  it('does not report a failure that resolves within the window', () => {
    // A relay that drops and reconnects must never flash red — that's the
    // difference between an honest indicator and a flickering one.
    watchRelays([A]);
    markConnected(A);
    markFailed(A);
    vi.advanceTimersByTime(FAILURE_SOAK_MS - 100);
    markConnected(A);
    vi.advanceTimersByTime(FAILURE_SOAK_MS);
    expect(getRelayStatuses()[A].state).toBe('connected');
  });

  it('reports a failure that outlasts the window', () => {
    watchRelays([A]);
    markConnected(A);
    markFailed(A);
    vi.advanceTimersByTime(FAILURE_SOAK_MS + 100);
    expect(getRelayStatuses()[A].state).toBe('failed');
  });

  it('coalesces repeated failures into one pending verdict', () => {
    watchRelays([A]);
    markConnected(A);
    markFailed(A);
    markFailed(A);
    markFailed(A);
    vi.advanceTimersByTime(FAILURE_SOAK_MS + 100);
    expect(getRelayStatuses()[A].state).toBe('failed');
  });
});

describe('probeRelay', () => {
  it('reports connected and measures latency', async () => {
    poolMocks.ensureRelay.mockResolvedValue({ connected: true });
    watchRelays([A]);
    await probeRelay(A);
    const status = getRelayStatuses()[A];
    expect(status.state).toBe('connected');
    expect(status.latencyMs).not.toBeNull();
  });

  it('treats a relay that never connects as failed, after the soak', async () => {
    poolMocks.ensureRelay.mockResolvedValue({ connected: false });
    watchRelays([A]);
    await probeRelay(A);
    vi.advanceTimersByTime(FAILURE_SOAK_MS + 100);
    expect(getRelayStatuses()[A].state).toBe('failed');
  });

  it('treats a throwing probe as failed rather than crashing', async () => {
    poolMocks.ensureRelay.mockRejectedValue(new Error('refused'));
    watchRelays([A]);
    await probeRelay(A);
    vi.advanceTimersByTime(FAILURE_SOAK_MS + 100);
    expect(getRelayStatuses()[A].state).toBe('failed');
  });
});

describe('subscribeRelayStatus', () => {
  it('replays the current value on subscribe', () => {
    poolMocks.ensureRelay.mockImplementation(() => new Promise(() => {}));
    watchRelays([A]);
    const seen: unknown[] = [];
    const stop = subscribeRelayStatus((value) => seen.push(value));
    expect(seen).toHaveLength(1);
    stop();
  });

  it('stops notifying after unsubscribe', () => {
    poolMocks.ensureRelay.mockImplementation(() => new Promise(() => {}));
    watchRelays([A]);
    let calls = 0;
    const stop = subscribeRelayStatus(() => { calls += 1; });
    const initial = calls;
    stop();
    markConnected(A);
    expect(calls).toBe(initial);
  });
});

describe('relayStatusSummary', () => {
  const status = (url: string, state: RelayStatus['state']): Record<string, RelayStatus> => ({
    [url]: { url, state, latencyMs: null, notes: 0, lastChange: 0 },
  });

  it('counts how many of your relays are answering', () => {
    const summary = relayStatusSummary([A, B], {
      ...status(A, 'connected'),
      ...status(B, 'connecting'),
    });
    expect(summary).toMatchObject({ total: 2, connected: 1 });
  });

  it('reads green while any relay answers — the feed works', () => {
    // One dead relay out of four is not an outage, and a red dot for it
    // trains people to ignore the dot.
    expect(relayStatusSummary([A, B], {
      ...status(A, 'connected'),
      ...status(B, 'failed'),
    }).state).toBe('connected');
  });

  it('reports failed only when nothing is connected', () => {
    expect(relayStatusSummary([A], status(A, 'failed')).state).toBe('failed');
  });

  it('collapses to offline rather than N separate failures', () => {
    // The laptop's wifi dropping is one problem, not one per relay.
    expect(relayStatusSummary([A, B], {
      ...status(A, 'offline'),
      ...status(B, 'connected'),
    }).state).toBe('offline');
  });

  it('is connecting while relays are still unresolved', () => {
    expect(relayStatusSummary([A], {}).state).toBe('connecting');
  });

  it('handles an empty relay list', () => {
    expect(relayStatusSummary([], {})).toEqual({ total: 0, connected: 0, state: 'unknown' });
  });

  it('matches relays whose URL needs normalising', () => {
    // Settings stores what the user typed; the store keys on the canonical
    // form, and a trailing slash would otherwise read as "not connected".
    expect(relayStatusSummary([`${A}/`], status(A, 'connected')).connected).toBe(1);
  });
});
