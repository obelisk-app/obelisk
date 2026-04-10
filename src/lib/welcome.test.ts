import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();

vi.mock('./db', () => ({
  prisma: {
    channel: { findFirst: (...args: any[]) => mockFindFirst(...args) },
    member: { findFirst: (...args: any[]) => mockFindFirst(...args) },
    message: { create: (...args: any[]) => mockCreate(...args) },
  },
}));

import { postWelcomeMessage } from './welcome';

describe('postWelcomeMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear globalThis.__io
    (globalThis as any).__io = undefined;
  });

  it('returns null if no bienvenida channel exists', async () => {
    mockFindFirst.mockResolvedValueOnce(null); // channel lookup
    const result = await postWelcomeMessage('server1', 'pubkey1');
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates a welcome message with member display name', async () => {
    mockFindFirst
      .mockResolvedValueOnce({ id: 'ch1', name: 'bienvenida' }) // channel
      .mockResolvedValueOnce({ displayName: 'Alice' }); // member

    const fakeMessage = { id: 'msg1', content: 'welcome', channelId: 'ch1' };
    mockCreate.mockResolvedValueOnce(fakeMessage);

    const result = await postWelcomeMessage('server1', 'pubkey1');
    expect(result).not.toBeNull();
    expect(result!.message).toBe(fakeMessage);
    expect(result!.channelId).toBe('ch1');

    // Verify the message content includes the display name
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.content).toContain('Alice');
    expect(createCall.data.content).toContain('bienvenid@');
    expect(createCall.data.channelId).toBe('ch1');
  });

  it('falls back to truncated pubkey if no display name', async () => {
    const pubkey = 'a'.repeat(64);
    mockFindFirst
      .mockResolvedValueOnce({ id: 'ch1', name: 'bienvenida' })
      .mockResolvedValueOnce(null); // no member profile

    mockCreate.mockResolvedValueOnce({ id: 'msg1' });

    await postWelcomeMessage('server1', pubkey);

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.content).toContain('aaaaaaaa...');
  });

  it('emits socket event when __io is available', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    (globalThis as any).__io = { to: mockTo };

    mockFindFirst
      .mockResolvedValueOnce({ id: 'ch1', name: 'bienvenida' })
      .mockResolvedValueOnce({ displayName: 'Bob' });

    const fakeMessage = { id: 'msg1' };
    mockCreate.mockResolvedValueOnce(fakeMessage);

    await postWelcomeMessage('server1', 'pubkey1');

    expect(mockTo).toHaveBeenCalledWith('channel:ch1');
    expect(mockEmit).toHaveBeenCalledWith('new-message', fakeMessage);
  });
});
