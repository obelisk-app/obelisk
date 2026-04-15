import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.doMock for manual hoisting to ensure the mock is applied early
const mockVerifyEvent = vi.fn(() => true);
vi.doMock('nostr-tools/pure', () => ({
  verifyEvent: mockVerifyEvent,
}));

import { generateChallenge, verifySignedEvent, validateSession, destroySession, __setChallenges } from './auth';
import { prisma } from './db';

// Mock prisma
vi.mock('./db', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const mockPrisma = prisma as any;

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __setChallenges(new Map());
  });

  describe('generateChallenge', () => {
    it('generates a challenge and stores it', () => {
      const { challengeId, challenge } = generateChallenge();
      expect(challengeId).toBeTypeOf('string');
      expect(challenge).toMatch(/^obelisk-auth:.+:\d+$/);
    });
  });

  describe('verifySignedEvent', () => {
    const mockSignedEvent = {
      pubkey: 'TEST_PUBKEY_UPPERCASE',
      content: '', // Will be set by challenge
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      sig: 'mock_sig',
      id: 'mock_id',
      tags: [],
    };

    it('returns null for invalid challengeId', async () => {
      const token = await verifySignedEvent('badId', mockSignedEvent);
      expect(token).toBeNull();
    });

    it('returns null for expired challenge', async () => {
      const { challengeId, challenge } = generateChallenge();
      __setChallenges(new Map([
        [challengeId, { challenge, createdAt: Date.now() - 300_001 }]
      ]));
      const token = await verifySignedEvent(challengeId, { ...mockSignedEvent, content: challenge });
      expect(token).toBeNull();
    });

    it('returns null for content mismatch', async () => {
      const { challengeId } = generateChallenge();
      const token = await verifySignedEvent(challengeId, { ...mockSignedEvent, content: 'wrong' });
      expect(token).toBeNull();
    });

    it('returns null for wrong kind', async () => {
      const { challengeId, challenge } = generateChallenge();
      const token = await verifySignedEvent(challengeId, { ...mockSignedEvent, content: challenge, kind: 1 });
      expect(token).toBeNull();
    });

    it('returns null if verifyEvent fails', async () => {
      const { challengeId, challenge } = generateChallenge();
      mockVerifyEvent.mockReturnValue(false);
      const token = await verifySignedEvent(challengeId, { ...mockSignedEvent, content: challenge });
      expect(token).toBeNull();
      mockVerifyEvent.mockRestore(); // Clean up the mock
    });

    it('creates a session and returns a token for valid event', async () => {
      const { challengeId, challenge } = generateChallenge();
      mockPrisma.session.create.mockResolvedValue({});

      const token = await verifySignedEvent(challengeId, { ...mockSignedEvent, content: challenge });
      expect(token).toBeTypeOf('string');
      expect(mockPrisma.session.create).toHaveBeenCalledWith({
        data: {
          pubkey: 'test_pubkey_uppercase'.toLowerCase(), // Expect lowercased
          token: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('validateSession', () => {
    it('returns null for non-existent session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);
      const pubkey = await validateSession('badToken');
      expect(pubkey).toBeNull();
    });

    it('returns null for expired session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 's1', pubkey: 'pk1', token: 't1', expiresAt: new Date(Date.now() - 1000),
      });
      const pubkey = await validateSession('t1');
      expect(pubkey).toBeNull();
      expect(mockPrisma.session.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    });

    it('returns pubkey for valid session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 's1', pubkey: 'pk1', token: 't1', expiresAt: new Date(Date.now() + 100000),
      });
      const pubkey = await validateSession('t1');
      expect(pubkey).toBe('pk1');
    });

    it('returns lowercased pubkey even if stored in mixed case (due to verifySignedEvent fix)', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 's1', pubkey: 'mixecasepubkey', token: 't1', expiresAt: new Date(Date.now() + 100000),
      });
      const pubkey = await validateSession('t1');
      expect(pubkey).toBe('mixecasepubkey');
    });
  });

  describe('destroySession', () => {
    it('deletes the session', async () => {
      mockPrisma.session.delete.mockResolvedValue({});
      await destroySession('someToken');
      expect(mockPrisma.session.delete).toHaveBeenCalledWith({ where: { token: 'someToken' } });
    });
  });
});
