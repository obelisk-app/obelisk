import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPublish = vi.fn().mockReturnValue([Promise.resolve()]);
const relayMap = new Map<string, unknown>();

vi.mock('@nostr-wot/data', () => ({
  getPool: () => ({ publish: mockPublish }),
}));

const mockSignEvent = vi.fn();

vi.mock('@/lib/nostr', () => ({
  getNDK: () => ({
    signer: {
      getPublicKey: async () => 'me',
      signEvent: mockSignEvent,
    },
    pool: { relays: relayMap },
  }),
}));

const ME = 'a'.repeat(64);

describe('publishInboxRelays', () => {
  beforeEach(() => {
    mockPublish.mockClear();
    mockPublish.mockReturnValue([Promise.resolve()]);
    mockSignEvent.mockReset();
    mockSignEvent.mockImplementation(async (template) => ({
      ...template,
      pubkey: ME,
      id: 'evid',
      sig: 'sig',
    }));
    relayMap.clear();
    relayMap.set('wss://relay.damus.io', {});
    relayMap.set('wss://nos.lol', {});
  });

  it('publishes a kind 10050 event with current relay set', async () => {
    const { publishInboxRelays } = await import('./dm-inbox');
    const result = await publishInboxRelays(ME);
    expect(result).toBe(true);
    expect(mockSignEvent).toHaveBeenCalledOnce();

    // The signed template should be kind 10050 with relay tags.
    const template = mockSignEvent.mock.calls[0][0];
    expect(template.kind).toBe(10050);
    expect(template.tags).toEqual([
      ['relay', 'wss://relay.damus.io'],
      ['relay', 'wss://nos.lol'],
    ]);
    expect(mockPublish).toHaveBeenCalledOnce();
  });

  it('returns false if no signer', async () => {
    vi.resetModules();
    vi.doMock('@/lib/nostr', () => ({
      getNDK: () => ({ signer: null, pool: { relays: relayMap } }),
    }));
    const { publishInboxRelays } = await import('./dm-inbox');
    const result = await publishInboxRelays(ME);
    expect(result).toBe(false);
    vi.doUnmock('@/lib/nostr');
  });
});

describe('listConnectedRelayUrls', () => {
  it('extracts wss:// urls from the pool relays map', async () => {
    const { listConnectedRelayUrls } = await import('./dm-inbox');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ndk: any = {
      pool: {
        relays: new Map<string, unknown>([
          ['wss://r1', {}],
          ['wss://r2', {}],
          ['http://nope', {}],
        ]),
      },
    };
    expect(listConnectedRelayUrls(ndk).sort()).toEqual(['wss://r1', 'wss://r2']);
  });

  it('returns [] when pool is missing', async () => {
    const { listConnectedRelayUrls } = await import('./dm-inbox');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(listConnectedRelayUrls({} as any)).toEqual([]);
  });
});
