import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma surface used by postWelcomeMessage.
const mockServerFindUnique = vi.fn();
const mockChannelFindFirst = vi.fn();
const mockMemberFindFirst = vi.fn();
const mockMessageCreate = vi.fn();

vi.mock('./db', () => ({
  prisma: {
    server: { findUnique: (...args: any[]) => mockServerFindUnique(...args) },
    channel: { findFirst: (...args: any[]) => mockChannelFindFirst(...args) },
    member: { findFirst: (...args: any[]) => mockMemberFindFirst(...args) },
    message: { create: (...args: any[]) => mockMessageCreate(...args) },
  },
}));

// Avoid touching real relays via profile-sync.
const mockFetchAndSyncProfileDeduped = vi.fn().mockResolvedValue(null);
vi.mock('./profile-sync', () => ({
  getAuthorProfile: vi.fn().mockResolvedValue(null),
  fetchAndSyncProfileDeduped: (...args: any[]) =>
    mockFetchAndSyncProfileDeduped(...args),
  SYSTEM_PUBKEY:
    '0000000000000000000000000000000000000000000000000000000000000000',
}));

import { postWelcomeMessage } from './welcome';

const SERVER_BASE = {
  id: 'server1',
  name: 'La Crypta',
};

describe('postWelcomeMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAndSyncProfileDeduped.mockResolvedValue(null);
    (globalThis as any).__io = undefined;
  });

  it('returns null when welcomeChannelId is not configured', async () => {
    mockServerFindUnique.mockResolvedValueOnce({
      ...SERVER_BASE,
      welcomeChannelId: null,
      welcomeLocale: null,
    });
    const result = await postWelcomeMessage('server1', 'pubkey1');
    expect(result).toBeNull();
    expect(mockChannelFindFirst).not.toHaveBeenCalled();
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('returns null when the configured channel no longer exists', async () => {
    mockServerFindUnique.mockResolvedValueOnce({
      ...SERVER_BASE,
      welcomeChannelId: 'ch-gone',
      welcomeLocale: 'es',
    });
    mockChannelFindFirst.mockResolvedValueOnce(null);

    const result = await postWelcomeMessage('server1', 'pubkey1');
    expect(result).toBeNull();
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('posts a Spanish welcome by default', async () => {
    mockServerFindUnique.mockResolvedValueOnce({
      ...SERVER_BASE,
      welcomeChannelId: 'ch1',
      welcomeLocale: null, // null => default Spanish
    });
    mockChannelFindFirst.mockResolvedValueOnce({ id: 'ch1', type: 'text' });
    mockMemberFindFirst.mockResolvedValueOnce({ displayName: 'Alice', picture: null, profileUpdatedAt: new Date() });
    mockMessageCreate.mockResolvedValueOnce({ id: 'msg1', content: '', channelId: 'ch1' });

    const result = await postWelcomeMessage('server1', 'pubkey1');
    expect(result).not.toBeNull();
    expect(result!.channelId).toBe('ch1');

    const createArg = mockMessageCreate.mock.calls[0][0];
    expect(createArg.data.channelId).toBe('ch1');
    expect(createArg.data.content).toContain('Alice');
    expect(createArg.data.content).toContain('bienvenid@');
    expect(createArg.data.content).toContain('La Crypta');
  });

  it('posts an English welcome when welcomeLocale is "en"', async () => {
    mockServerFindUnique.mockResolvedValueOnce({
      ...SERVER_BASE,
      welcomeChannelId: 'ch1',
      welcomeLocale: 'en',
    });
    mockChannelFindFirst.mockResolvedValueOnce({ id: 'ch1', type: 'text' });
    mockMemberFindFirst.mockResolvedValueOnce({ displayName: 'Bob', picture: null, profileUpdatedAt: new Date() });
    mockMessageCreate.mockResolvedValueOnce({ id: 'msg1' });

    await postWelcomeMessage('server1', 'pubkey1');

    const createArg = mockMessageCreate.mock.calls[0][0];
    expect(createArg.data.content).toContain('welcome to');
    expect(createArg.data.content).toContain('Bob');
    expect(createArg.data.content).not.toContain('bienvenid@');
  });

  it('falls back to short npub when no member row exists', async () => {
    const pubkey = 'a'.repeat(64);
    mockServerFindUnique.mockResolvedValueOnce({
      ...SERVER_BASE,
      welcomeChannelId: 'ch1',
      welcomeLocale: 'es',
    });
    mockChannelFindFirst.mockResolvedValueOnce({ id: 'ch1', type: 'text' });
    // First lookup: no row yet. postWelcomeMessage triggers a profile fetch,
    // which is mocked to a no-op, then re-reads and still finds nothing.
    mockMemberFindFirst.mockResolvedValueOnce(null);
    mockMemberFindFirst.mockResolvedValueOnce(null);
    mockMessageCreate.mockResolvedValueOnce({ id: 'msg1' });

    await postWelcomeMessage('server1', pubkey);

    // Mention is serialized canonically as `nostr:npub1<hex>`; the client
    // resolves the displayName (shortNpub) when no member row exists.
    const createArg = mockMessageCreate.mock.calls[0][0];
    expect(createArg.data.content).toContain(`nostr:npub1${pubkey}`);
    // Banner URL still carries the short npub as the display name param.
    expect(createArg.data.content).toContain('name=npub1');
  });

  it('fetches the profile from relays when member has never been synced', async () => {
    const pubkey = 'b'.repeat(64);
    mockServerFindUnique.mockResolvedValueOnce({
      ...SERVER_BASE,
      welcomeChannelId: 'ch1',
      welcomeLocale: 'es',
    });
    mockChannelFindFirst.mockResolvedValueOnce({ id: 'ch1', type: 'text' });
    // Before fetch: row exists but was never synced (profileUpdatedAt null).
    mockMemberFindFirst.mockResolvedValueOnce({
      displayName: null,
      picture: null,
      profileUpdatedAt: null,
    });
    // After fetch: display name + picture populated by the relay.
    mockMemberFindFirst.mockResolvedValueOnce({
      displayName: 'Dana',
      picture: 'https://example.com/dana.png',
      profileUpdatedAt: new Date(),
    });
    mockMessageCreate.mockResolvedValueOnce({ id: 'msg1' });

    await postWelcomeMessage('server1', pubkey);

    // The fetch should have been triggered with the right args.
    expect(mockFetchAndSyncProfileDeduped).toHaveBeenCalledWith(pubkey, 'server1');

    const createArg = mockMessageCreate.mock.calls[0][0];
    expect(createArg.data.content).toContain('Dana');
    // Banner URL must carry the picture query param so the welcome-banner
    // endpoint renders the user's avatar instead of the Obelisk fallback.
    expect(createArg.data.content).toContain('picture=');
    expect(createArg.data.content).toContain('dana.png');
  });

  it('swallows relay errors from fetchAndSyncProfileDeduped', async () => {
    const pubkey = 'c'.repeat(64);
    mockServerFindUnique.mockResolvedValueOnce({
      ...SERVER_BASE,
      welcomeChannelId: 'ch1',
      welcomeLocale: 'es',
    });
    mockChannelFindFirst.mockResolvedValueOnce({ id: 'ch1', type: 'text' });
    mockMemberFindFirst.mockResolvedValueOnce({
      displayName: null,
      picture: null,
      profileUpdatedAt: null,
    });
    mockFetchAndSyncProfileDeduped.mockRejectedValueOnce(new Error('relay down'));
    mockMessageCreate.mockResolvedValueOnce({ id: 'msg1' });

    // Should not throw even though the fetch failed.
    const result = await postWelcomeMessage('server1', pubkey);
    expect(result).not.toBeNull();
    // Still posts the welcome, just with fallback display name.
    expect(mockMessageCreate).toHaveBeenCalled();
  });

  it('broadcasts via Socket.io when __io is available', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    (globalThis as any).__io = { to: mockTo };

    mockServerFindUnique.mockResolvedValueOnce({
      ...SERVER_BASE,
      welcomeChannelId: 'ch1',
      welcomeLocale: 'es',
    });
    mockChannelFindFirst.mockResolvedValueOnce({ id: 'ch1', type: 'text' });
    mockMemberFindFirst.mockResolvedValueOnce({ displayName: 'Carol', picture: null, profileUpdatedAt: new Date() });
    mockMessageCreate.mockResolvedValueOnce({ id: 'msg1' });

    await postWelcomeMessage('server1', 'pubkey1');

    expect(mockTo).toHaveBeenCalledWith('channel:ch1');
    expect(mockEmit).toHaveBeenCalledWith(
      'new-message',
      expect.objectContaining({ id: 'msg1', author: null }),
    );
  });
});
