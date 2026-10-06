import { vi } from 'vitest';

export const mockPublish = vi.fn().mockResolvedValue(undefined);

export const mockNDK = {
  connect: vi.fn().mockResolvedValue(undefined),
  fetchEvents: vi.fn().mockResolvedValue(new Set()),
  fetchEvent: vi.fn().mockResolvedValue(null),
  getUser: vi.fn(() => ({
    pubkey: 'test-pubkey-hex',
    fetchProfile: vi.fn().mockResolvedValue({
      name: 'Test User',
      about: 'A test user',
      picture: 'https://example.com/avatar.png',
      nip05: 'test@example.com',
    }),
  })),
  signer: {
    sign: vi.fn(),
    blockUntilReady: vi.fn().mockResolvedValue(undefined),
  },
  pool: {
    relays: new Map(),
  },
};

export function createMockEvent(overrides = {}) {
  return {
    id: 'test-event-id',
    pubkey: 'test-pubkey-hex',
    kind: 1,
    content: 'Hello Nostr!',
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    sig: 'test-sig',
    publish: mockPublish,
    ...overrides,
  };
}
