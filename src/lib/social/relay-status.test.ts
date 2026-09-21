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
