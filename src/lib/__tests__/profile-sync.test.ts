import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db-server module
const mockPrisma = {
  member: {
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('../db-server', () => ({
  prisma: mockPrisma,
}));

// Mock NDK
const mockFetchProfile = vi.fn();
vi.mock('@nostr-dev-kit/ndk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      getUser: vi.fn().mockReturnValue({
        fetchProfile: mockFetchProfile,
        profile: null,
      }),
    })),
  };
});

import { syncProfileToDb, refreshStaleProfiles, backfillMissingProfiles } from '../profile-sync';

describe('profile-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncProfileToDb', () => {
    it('upserts member with all profile fields and profileUpdatedAt', async () => {
      const profile = {
        displayName: 'Alice',
        name: 'alice',
        picture: 'https://example.com/pic.jpg',
        nip05: 'alice@example.com',
        about: 'Hello world',
        banner: 'https://example.com/banner.jpg',
        lud16: 'alice@ln.example.com',
        website: 'https://alice.com',
      };

      mockPrisma.member.upsert.mockResolvedValue({ id: '1', pubkey: 'pk1', ...profile });

      await syncProfileToDb('pk1', 'server1', profile);

      expect(mockPrisma.member.upsert).toHaveBeenCalledWith({
        where: { serverId_pubkey: { serverId: 'server1', pubkey: 'pk1' } },
        update: expect.objectContaining({
          displayName: 'Alice',
          picture: 'https://example.com/pic.jpg',
          nip05: 'alice@example.com',
          about: 'Hello world',
          banner: 'https://example.com/banner.jpg',
          lud16: 'alice@ln.example.com',
          website: 'https://alice.com',
          profileUpdatedAt: expect.any(Date),
        }),
        create: expect.objectContaining({
          serverId: 'server1',
          pubkey: 'pk1',
          role: 'member',
          displayName: 'Alice',
        }),
      });
    });

    it('handles null/undefined profile fields gracefully', async () => {
      mockPrisma.member.upsert.mockResolvedValue({ id: '1', pubkey: 'pk1' });

      await syncProfileToDb('pk1', 'server1', {});

      expect(mockPrisma.member.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            displayName: null,
            picture: null,
            nip05: null,
            about: null,
            banner: null,
            lud16: null,
            website: null,
            profileUpdatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('uses name as fallback for displayName', async () => {
      mockPrisma.member.upsert.mockResolvedValue({ id: '1' });

      await syncProfileToDb('pk1', 'server1', { name: 'fallbackName' });

      expect(mockPrisma.member.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ displayName: 'fallbackName' }),
        }),
      );
    });
  });

  describe('refreshStaleProfiles', () => {
    it('returns 0 when no stale profiles', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);

      const result = await refreshStaleProfiles(1);
      expect(result).toBe(0);
    });

    it('queries members with null or old profileUpdatedAt', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);

      await refreshStaleProfiles(7);

      expect(mockPrisma.member.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { profileUpdatedAt: null },
            { profileUpdatedAt: { lt: expect.any(Date) } },
          ],
        },
        select: { pubkey: true, serverId: true },
      });
    });
  });

  describe('backfillMissingProfiles', () => {
    it('returns 0 when no missing profiles', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);

      const result = await backfillMissingProfiles();
      expect(result).toBe(0);
    });

    it('queries members with null displayName and picture and profileUpdatedAt', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);

      await backfillMissingProfiles();

      expect(mockPrisma.member.findMany).toHaveBeenCalledWith({
        where: {
          displayName: null,
          picture: null,
          profileUpdatedAt: null,
        },
        select: { pubkey: true, serverId: true },
      });
    });
  });
});
