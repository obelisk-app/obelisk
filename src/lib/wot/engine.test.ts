import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WotEngine } from './engine';

const KIND_GROUP_METADATA = 39000;
const KIND_GROUP_ADMINS = 39001;
const KIND_GROUP_MESSAGE = 9;

interface MockApi {
  getStatus: ReturnType<typeof vi.fn>;
  getDistanceBatch: ReturnType<typeof vi.fn>;
}

let mockApi: MockApi;

beforeEach(() => {
  mockApi = {
    getStatus: vi.fn(async () => ({ configured: true })),
    getDistanceBatch: vi.fn(async () => ({}) as Record<string, number | null>),
  };
  (globalThis as unknown as { window: unknown }).window = {
    nostr: { wot: mockApi },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

function makeEngine() {
  const e = new WotEngine();
  e.configure({ enabled: true, maxHops: 2 });
  return e;
}

describe('WotEngine', () => {
  it('fail-open: WoT disabled → all events allowed', () => {
    const e = new WotEngine();
    e.configure({ enabled: false, maxHops: 2 });
    expect(e.isAllowed('alice', KIND_GROUP_MESSAGE)).toBe(true);
  });

  it('fail-open: enabled but verdict unresolved → allow + enqueue', () => {
    const e = makeEngine();
    expect(e.isAllowed('alice', KIND_GROUP_MESSAGE)).toBe(true);
  });

  it('drops resolved-deny events', async () => {
    const e = makeEngine();
    e._setVerdictForTest('alice', 'deny');
    expect(e.isAllowed('alice', KIND_GROUP_MESSAGE)).toBe(false);
  });

  it('admits resolved-allow events', () => {
    const e = makeEngine();
    e._setVerdictForTest('alice', 'allow', 1);
    expect(e.isAllowed('alice', KIND_GROUP_MESSAGE)).toBe(true);
    expect(e.getDistance('alice')).toBe(1);
  });

  it('always-allow kinds bypass deny verdicts (group structure)', () => {
    const e = makeEngine();
    e._setVerdictForTest('alice', 'deny');
    expect(e.isAllowed('alice', KIND_GROUP_METADATA)).toBe(true);
    expect(e.isAllowed('alice', KIND_GROUP_ADMINS)).toBe(true);
  });

  it('own pubkey always passes', () => {
    const e = makeEngine();
    e.setOwnPubkey('me');
    e._setVerdictForTest('me', 'deny');
    expect(e.isAllowed('me', KIND_GROUP_MESSAGE)).toBe(true);
  });

  it('mute overrides allow', () => {
    const e = makeEngine();
    e._setVerdictForTest('alice', 'allow', 1);
    e.setMutedPubkeys(['alice']);
    expect(e.isAllowed('alice', KIND_GROUP_MESSAGE)).toBe(false);
  });

  it('block overrides allow + always-allow + own-pubkey', () => {
    const e = makeEngine();
    e.setOwnPubkey('me');
    e._setVerdictForTest('alice', 'allow', 1);
    e.setBlockedPubkeys(['alice', 'me']);
    expect(e.isAllowed('alice', KIND_GROUP_METADATA)).toBe(false);
    expect(e.isAllowed('me', KIND_GROUP_MESSAGE)).toBe(false);
  });

  it('consensual DM exemption admits otherwise-untrusted senders', () => {
    const e = makeEngine();
    e._setVerdictForTest('alice', 'deny');
    e.setConsensualDmPredicate((pk) => pk === 'alice');
    expect(e.isAllowed('alice', 4)).toBe(true);
  });

  it('config change clears verdicts', () => {
    const e = makeEngine();
    e._setVerdictForTest('alice', 'allow', 1);
    e.configure({ maxHops: 3 });
    expect(e.getDistance('alice')).toBe(null);
  });

  it('newly-muted pubkey emits verdict-deny so callers can prune', () => {
    const e = makeEngine();
    const seen: string[] = [];
    e.on('verdict-deny', (pk) => seen.push(pk));
    e.setMutedPubkeys(['alice']);
    expect(seen).toEqual(['alice']);
  });

  it('batch flush coalesces unknowns and writes verdicts', async () => {
    vi.useFakeTimers();
    const e = makeEngine();
    mockApi.getDistanceBatch.mockResolvedValueOnce({ alice: 1, bob: null });
    // Two unknowns enqueued → one batch call.
    e.isAllowed('alice', KIND_GROUP_MESSAGE);
    e.isAllowed('bob', KIND_GROUP_MESSAGE);
    await vi.advanceTimersByTimeAsync(150);
    expect(mockApi.getDistanceBatch).toHaveBeenCalledTimes(1);
    expect(mockApi.getDistanceBatch.mock.calls[0][0].sort()).toEqual(['alice', 'bob']);
    expect(e.getDistance('alice')).toBe(1);
    expect(e.isAllowed('bob', KIND_GROUP_MESSAGE)).toBe(false);
  });

  it('out-of-hops distance resolves to deny', async () => {
    vi.useFakeTimers();
    const e = makeEngine();
    mockApi.getDistanceBatch.mockResolvedValueOnce({ alice: 5 });
    e.isAllowed('alice', KIND_GROUP_MESSAGE);
    await vi.advanceTimersByTimeAsync(150);
    expect(e.isAllowed('alice', KIND_GROUP_MESSAGE)).toBe(false);
  });

  it('minPaths threshold denies pubkeys with too few corroborating paths', async () => {
    vi.useFakeTimers();
    const e = new WotEngine();
    e.configure({ enabled: true, maxHops: 2, minPaths: 2 });
    mockApi.getDistanceBatch.mockResolvedValueOnce({ alice: 1, bob: 1 });
    (mockApi as unknown as { getMinPaths: ReturnType<typeof vi.fn> }).getMinPaths = vi.fn(async (pk: string) => (pk === 'alice' ? 3 : 1));
    e.isAllowed('alice', KIND_GROUP_MESSAGE);
    e.isAllowed('bob', KIND_GROUP_MESSAGE);
    await vi.advanceTimersByTimeAsync(150);
    expect(e.isAllowed('alice', KIND_GROUP_MESSAGE)).toBe(true);
    expect(e.isAllowed('bob', KIND_GROUP_MESSAGE)).toBe(false);
  });

  it('fail-open continues when extension batch returns null', async () => {
    vi.useFakeTimers();
    mockApi.getDistanceBatch.mockResolvedValueOnce(null as unknown as Record<string, number | null>);
    const e = makeEngine();
    e.isAllowed('alice', KIND_GROUP_MESSAGE);
    await vi.advanceTimersByTimeAsync(150);
    // No verdict cached → still fail-open on next check.
    expect(e.isAllowed('alice', KIND_GROUP_MESSAGE)).toBe(true);
  });

  it('isResolvedDeny only true for resolved verdicts', () => {
    const e = makeEngine();
    expect(e.isResolvedDeny('alice')).toBe(false);
    e._setVerdictForTest('alice', 'deny');
    expect(e.isResolvedDeny('alice')).toBe(true);
    e._setVerdictForTest('alice', 'allow', 1);
    expect(e.isResolvedDeny('alice')).toBe(false);
  });
});
