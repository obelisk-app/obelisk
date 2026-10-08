import { afterEach, expect, it, vi } from 'vitest';
import { wotEngine } from '@/services/wot/engine';
import { invalidateRuntimeCaches, inspectRuntimeCaches } from '@/services/local-data/runtime-caches';

afterEach(() => {
  wotEngine._reset();
  wotEngine.setOperatorPubkeys([]);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('clears verdicts and retires in-flight results without resetting policy or subscribers', async () => {
  vi.useFakeTimers();
  let resolve!: (value: Record<string, number>) => void;
  const old = new Promise<Record<string, number>>((done) => { resolve = done; });
  const batch = vi.fn().mockReturnValueOnce(old).mockResolvedValue({ fresh: 1 });
  vi.stubGlobal('window', { nostr: { wot: { getStatus: vi.fn(async () => ({ configured: true })), getDistanceBatch: batch } } });
  wotEngine.configure({ enabled: true, maxHops: 3, minPaths: 1 });
  wotEngine.setOwnPubkey('own');
  wotEngine.setMutedPubkeys(['muted']);
  wotEngine.setBlockedPubkeys(['blocked']);
  wotEngine.setOperatorPubkeys(['operator']);
  wotEngine.setConsensualDmPredicate((pubkey) => pubkey === 'dm');
  wotEngine._setVerdictForTest('cached', 'deny');
  const changed = vi.fn();
  const unsubscribe = wotEngine.on('verdicts-changed', changed);
  try {
    wotEngine.markUnknown('old');
    const pending = wotEngine._flushForTest();
    await vi.waitFor(() => expect(batch).toHaveBeenCalledOnce());
    wotEngine.markUnknown('queued');
    expect(invalidateRuntimeCaches({ categories: ['profiles'] }).cleared).toContain('wot-verdicts');
    expect(changed).toHaveBeenCalledOnce();
    expect(inspectRuntimeCaches().find((cache) => cache.id === 'wot-verdicts')).toMatchObject({ entries: 0, pending: 0 });
    resolve({ old: 1 });
    await pending;
    expect(wotEngine.getDistance('old')).toBeNull();
    expect(wotEngine.isAllowed('muted')).toBe(false);
    expect(wotEngine.isAllowed('blocked')).toBe(false);
    expect(wotEngine.isOperator('operator')).toBe(true);
    wotEngine._setVerdictForTest('own', 'deny');
    wotEngine._setVerdictForTest('dm', 'deny');
    expect(wotEngine.isAllowed('own')).toBe(true);
    expect(wotEngine.isAllowed('dm')).toBe(true);
    wotEngine.markUnknown('fresh');
    await wotEngine._flushForTest();
    expect(batch).toHaveBeenLastCalledWith(['fresh'], { maxHops: 3, minPaths: 1 });
    expect(wotEngine.getDistance('fresh')).toBe(1);
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
  }
});
