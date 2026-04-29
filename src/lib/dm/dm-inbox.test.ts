import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPublish = vi.fn().mockReturnValue([Promise.resolve()]);

vi.mock('@nostr-wot/data', () => ({
  getPool: () => ({ publish: mockPublish }),
}));

const mockSignEvent = vi.fn();

const ME = 'a'.repeat(64);

const mockSigner = {
  getPublicKey: async () => ME,
  signEvent: mockSignEvent,
};

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
  });

  it('publishes a kind 10050 event with the provided relay set', async () => {
    const { publishInboxRelays } = await import('./dm-inbox');
    const relays = ['wss://relay.damus.io', 'wss://nos.lol'];
    const result = await publishInboxRelays(mockSigner as any, relays);
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

  it('returns false if signing throws', async () => {
    mockSignEvent.mockRejectedValueOnce(new Error('signing failed'));
    const { publishInboxRelays } = await import('./dm-inbox');
    const result = await publishInboxRelays(mockSigner as any, ['wss://relay.damus.io']);
    expect(result).toBe(false);
  });
});
