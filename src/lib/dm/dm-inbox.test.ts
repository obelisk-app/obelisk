import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPublish = vi.fn().mockReturnValue([Promise.resolve()]);

vi.mock('@nostr-wot/data', () => ({
  getPool: () => ({ publish: mockPublish }),
}));

const mockSignEvent = vi.fn();
const mockGetExplicitRelays = vi.fn();

vi.mock('@/lib/nostr', () => ({
  getSigner: () => ({
    getPublicKey: async () => 'me',
    signEvent: mockSignEvent,
  }),
  getExplicitRelays: mockGetExplicitRelays,
}));

const ME = 'a'.repeat(64);

describe('publishInboxRelays', () => {
  beforeEach(() => {
    mockPublish.mockClear();
    mockPublish.mockReturnValue([Promise.resolve()]);
    mockSignEvent.mockReset();
    mockSignEvent.mockImplementation(async (template: unknown) => ({
      ...(template as object),
      pubkey: ME,
      id: 'evid',
      sig: 'sig',
    }));
    mockGetExplicitRelays.mockReturnValue(['wss://relay.damus.io', 'wss://nos.lol']);
  });

  it('publishes a kind 10050 event with current relay set', async () => {
    const { publishInboxRelays } = await import('./dm-inbox');
    const result = await publishInboxRelays(ME);
    expect(result).toBe(true);
    expect(mockSignEvent).toHaveBeenCalledOnce();

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
      getSigner: () => null,
      getExplicitRelays: () => ['wss://relay.damus.io'],
    }));
    const { publishInboxRelays } = await import('./dm-inbox');
    const result = await publishInboxRelays(ME);
    expect(result).toBe(false);
    vi.doUnmock('@/lib/nostr');
  });
});
