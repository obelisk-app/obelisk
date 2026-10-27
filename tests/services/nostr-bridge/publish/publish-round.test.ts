/**
 * Reading the hub's publish rows back per target (`publish-round.ts`), the
 * shape `publish-results.ts` and the relay-access tracking consume.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import type { PublishResult, PublishSpec, RelayStatus } from '@nostr-wot/relay/hub';
import { publishRound, publishRoundSettling, settledFor } from '@/services/nostr-bridge/publish/publish-round';
import { PUBLISH_STRAGGLER_GRACE_MS, PUBLISH_TIMED_OUT } from '@/constants/nostr-bridge/publish';
import { timedOutEverywhere, acceptedOf } from '@/services/nostr-bridge/publish/publish-results';

const A = 'wss://a.example';
const B = 'wss://b.example';
const row = (url: string, status: PublishResult['status'], reason: string | null = null): PublishResult => ({ url: url + '/', status, reason });

describe('settledFor', () => {
  it('lines one result up with each target, by normalized URL', () => {
    const out = settledFor([B, A], [row(A, 'ok', ''), row(B, 'rejected', 'blocked: no')]);
    expect(out[0]).toMatchObject({ status: 'rejected' });
    expect((out[0] as PromiseRejectedResult).reason.message).toBe('blocked: no');
    expect(out[1]).toEqual({ status: 'fulfilled', value: '' });
  });

  it('counts an unreachable relay as a refusal, not an acceptance', () => {
    const out = settledFor([A], [row(A, 'unreachable', 'relay wss://a.example/ unreachable (connecting)')]);
    expect(acceptedOf(out)).toHaveLength(0);
    expect((out[0] as PromiseRejectedResult).reason.message).toMatch(/unreachable/);
  });

  it('words a timeout so the timed-out-everywhere retry recognises it', () => {
    const out = settledFor([A, B], [row(A, 'timeout'), row(B, 'timeout')]);
    expect((out[0] as PromiseRejectedResult).reason.message).toBe(PUBLISH_TIMED_OUT);
    expect(timedOutEverywhere(acceptedOf(out), out)).toBe(true);
  });

  it('answers a repeated target `duplicate url`, as the old pool did', () => {
    const out = settledFor([A, A + '/'], [row(A, 'ok', '')]);
    expect(out[0].status).toBe('fulfilled');
    expect((out[1] as PromiseRejectedResult).reason.message).toBe('duplicate url');
  });
});

describe('publishRound', () => {
  it('hands the hub the targets, the AUTH mode and an explicit ack wait', async () => {
    const specs: PublishSpec[] = [];
    const hub = {
      publish: vi.fn(async (spec: PublishSpec) => {
        specs.push(spec);
        return spec.relays.map((url) => row(url, 'ok', ''));
      }),
    };
    const event = { id: 'e', kind: 20078 } as NostrEvent;
    const out = await publishRound(hub, [A], event, 'never', 4000);
    expect(out).toEqual([{ status: 'fulfilled', value: '' }]);
    expect(specs[0]).toMatchObject({ relays: [A], authMode: 'never', ackTimeoutMs: 4000 });
    await publishRound(hub, [A], event, 'policy');
    expect(specs[1].ackTimeoutMs).toBeUndefined();
  });
});

/**
 * A hub whose publish answers only when the test says so (`answer`), with a
 * settable socket state per relay and a status feed (`setSocket`).
 */
function settlingHub() {
  let spec: PublishSpec | null = null;
  let finish: (rows: PublishResult[]) => void = () => {};
  const answered: PublishResult[] = [];
  const sockets = new Map<string, Pick<RelayStatus, 'connection' | 'lastError'>>();
  const listeners = new Set<(s: RelayStatus) => void>();
  const status = (url: string) => ({ url, ...(sockets.get(url) ?? { connection: 'connected', lastError: null }) }) as RelayStatus;
  const hub = {
    publish: vi.fn((s: PublishSpec) => {
      spec = s;
      return new Promise<readonly PublishResult[]>((resolve) => { finish = resolve; });
    }),
    status: vi.fn(status),
    onStatus: vi.fn((cb: (s: RelayStatus) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
  };
  return {
    hub,
    listeners,
    answer(r: PublishResult) {
      answered.push(r);
      spec?.onResult?.(r);
    },
    finishAll(rest: PublishResult[]) {
      finish([...answered, ...rest]);
    },
    setSocket(url: string, socket: Pick<RelayStatus, 'connection' | 'lastError'>) {
      sockets.set(url, socket);
      for (const cb of Array.from(listeners)) cb(status(url));
    },
  };
}

const DOWN = { connection: 'reconnecting', lastError: 'Unexpected server response: 502' } as const;
const EVENT = { id: 'e', kind: 0 } as NostrEvent;

describe('publishRoundSettling', () => {
  afterEach(() => vi.useRealTimers());

  async function settledYet(p: Promise<unknown>): Promise<boolean> {
    let done = false;
    void p.then(() => { done = true; }, () => { done = true; });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    return done;
  }

  it('stops waiting once a relay accepted and the only one left is down', async () => {
    const t = settlingHub();
    t.setSocket(B + '/', DOWN);
    const round = publishRoundSettling(t.hub, [A, B], EVENT, 'policy');
    expect(await settledYet(round)).toBe(false);
    t.answer(row(A, 'ok', ''));
    const out = await round;
    expect(out[0]).toEqual({ status: 'fulfilled', value: '' });
    expect((out[1] as PromiseRejectedResult).reason.message).toMatch(/unreachable.*502/);
    expect(t.listeners.size).toBe(0);
  });

  it('settles when a pending relay goes down after the acceptance', async () => {
    const t = settlingHub();
    const round = publishRoundSettling(t.hub, [A, B], EVENT, 'policy');
    t.answer(row(A, 'ok', ''));
    expect(await settledYet(round)).toBe(false);
    t.setSocket(B + '/', DOWN);
    expect(acceptedOf(await round)).toHaveLength(1);
  });

  it('does not settle early on a dead relay before anything accepted', async () => {
    const t = settlingHub();
    t.setSocket(B + '/', DOWN);
    const round = publishRoundSettling(t.hub, [A, B], EVENT, 'policy');
    expect(await settledYet(round)).toBe(false);
    t.answer(row(A, 'rejected', 'blocked: no'));
    expect(await settledYet(round)).toBe(false);
    t.finishAll([row(B, 'unreachable', 'down')]);
    expect(acceptedOf(await round)).toHaveLength(0);
  });

  it('gives a relay that is up but slow a bounded grace past the first acceptance', async () => {
    vi.useFakeTimers();
    const t = settlingHub();
    const round = publishRoundSettling(t.hub, [A, B], EVENT, 'policy');
    t.answer(row(A, 'ok', ''));
    await vi.advanceTimersByTimeAsync(PUBLISH_STRAGGLER_GRACE_MS - 1);
    expect(await settledYet(round)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const out = await round;
    expect((out[1] as PromiseRejectedResult).reason.message).toBe(PUBLISH_TIMED_OUT);
  });

  it('reads every row the hub reports when all relays answer', async () => {
    const t = settlingHub();
    const round = publishRoundSettling(t.hub, [A, B], EVENT, 'policy');
    t.answer(row(A, 'ok', ''));
    t.answer(row(B, 'rejected', 'restricted: not on the list'));
    const out = await round;
    expect(out[0].status).toBe('fulfilled');
    expect((out[1] as PromiseRejectedResult).reason.message).toBe('restricted: not on the list');
  });
});
