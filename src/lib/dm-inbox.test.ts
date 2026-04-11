import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, getSyncState, setSyncState } from './dm-cache';

const mockPublish = vi.fn().mockResolvedValue(undefined);
const relayMap = new Map<string, unknown>();

vi.mock('./nostr', () => ({
  getNDK: () => ({
    signer: { sign: vi.fn() },
    pool: { relays: relayMap },
  }),
}));

vi.mock('@nostr-dev-kit/ndk', () => {
  const NDKEvent = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.kind = 0;
    this.tags = [] as string[][];
    this.content = '';
    this.publish = mockPublish;
  });
  return { NDKEvent };
});

const ME = 'a'.repeat(64);

describe('dm-inbox', () => {
  beforeEach(() => {
    clearCache(ME);
    mockPublish.mockClear();
    relayMap.clear();
    relayMap.set('wss://relay.damus.io', {});
    relayMap.set('wss://nos.lol', {});
  });

  it('publishes a kind 10050 event with current relay set', async () => {
    const { publishInboxRelays } = await import('./dm-inbox');
    const result = await publishInboxRelays(ME);
    expect(result).toBe(true);
    expect(mockPublish).toHaveBeenCalledOnce();

    const { NDKEvent } = await import('@nostr-dev-kit/ndk');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance: any = (NDKEvent as unknown as { mock: any }).mock.instances.at(-1);
    expect(instance.kind).toBe(10050);
    expect(instance.tags).toEqual([
      ['relay', 'wss://relay.damus.io'],
      ['relay', 'wss://nos.lol'],
    ]);

    const sync = getSyncState(ME);
    expect(sync.inboxRelaysPublishedAt).toBeGreaterThan(0);
  });

  it('skips republishing if within freshness window', async () => {
    setSyncState(ME, { inboxRelaysPublishedAt: Date.now() });
    const { publishInboxRelays } = await import('./dm-inbox');
    const result = await publishInboxRelays(ME);
    expect(result).toBe(false);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('returns false if no signer', async () => {
    vi.resetModules();
    vi.doMock('./nostr', () => ({
      getNDK: () => ({ signer: null, pool: { relays: relayMap } }),
    }));
    const { publishInboxRelays } = await import('./dm-inbox');
    const result = await publishInboxRelays(ME);
    expect(result).toBe(false);
    vi.doUnmock('./nostr');
  });
});
