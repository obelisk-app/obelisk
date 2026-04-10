import { describe, it, expect, vi, beforeEach } from 'vitest';
import { threadKey, detectNip04InRecent } from './dm';
import type { DMMessage } from './dm';

// Mock NDK module
const mockEncrypt = vi.fn().mockResolvedValue(undefined);
const mockPublish = vi.fn().mockResolvedValue(undefined);
const mockSubscribe = vi.fn();
const mockFetchEvents = vi.fn().mockResolvedValue(new Set());
const mockSigner = { sign: vi.fn() };

vi.mock('./nostr', () => ({
  getNDK: () => ({
    signer: mockSigner,
    subscribe: mockSubscribe,
    fetchEvents: mockFetchEvents,
    getUser: (opts: { pubkey: string }) => ({ pubkey: opts.pubkey, ndk: {} }),
  }),
}));

vi.mock('@nostr-dev-kit/ndk', () => {
  const NDKEventClass = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.kind = 0;
    this.content = '';
    this.tags = [];
    this.encrypt = mockEncrypt;
    this.publish = mockPublish;
    this.id = 'mock-event-id';
    this.pubkey = '';
    this.created_at = Math.floor(Date.now() / 1000);
  });
  return {
    NDKEvent: NDKEventClass,
    NDKUser: vi.fn().mockImplementation(function (this: Record<string, unknown>, opts: { pubkey: string }) {
      this.pubkey = opts.pubkey;
      this.ndk = {};
    }),
    giftWrap: vi.fn().mockImplementation(async () => ({
      publish: mockPublish,
    })),
    giftUnwrap: vi.fn(),
  };
});

describe('dm utils', () => {
  describe('threadKey', () => {
    it('returns sorted pubkeys', () => {
      expect(threadKey('b', 'a')).toEqual(['a', 'b']);
      expect(threadKey('a', 'b')).toEqual(['a', 'b']);
    });

    it('handles identical pubkeys', () => {
      expect(threadKey('a', 'a')).toEqual(['a', 'a']);
    });
  });

  describe('detectNip04InRecent', () => {
    const makeMsg = (id: string, protocol: 'nip04' | 'nip17'): DMMessage => ({
      id,
      senderPubkey: 'a',
      recipientPubkey: 'b',
      content: 'test',
      createdAt: 0,
      protocol,
    });

    it('returns false when no messages', () => {
      expect(detectNip04InRecent([])).toBe(false);
    });

    it('returns false when all NIP-17', () => {
      const msgs = Array.from({ length: 15 }, (_, i) => makeMsg(`${i}`, 'nip17'));
      expect(detectNip04InRecent(msgs)).toBe(false);
    });

    it('returns true when NIP-04 in last 10', () => {
      const msgs = [
        ...Array.from({ length: 8 }, (_, i) => makeMsg(`${i}`, 'nip17')),
        makeMsg('nip04-1', 'nip04'),
        makeMsg('last', 'nip17'),
      ];
      expect(detectNip04InRecent(msgs)).toBe(true);
    });

    it('returns false when NIP-04 is outside last 10', () => {
      const msgs = [
        makeMsg('old-nip04', 'nip04'),
        ...Array.from({ length: 10 }, (_, i) => makeMsg(`${i}`, 'nip17')),
      ];
      expect(detectNip04InRecent(msgs)).toBe(false);
    });

    it('respects custom count parameter', () => {
      const msgs = [
        makeMsg('nip04-1', 'nip04'),
        ...Array.from({ length: 3 }, (_, i) => makeMsg(`${i}`, 'nip17')),
      ];
      expect(detectNip04InRecent(msgs, 3)).toBe(false);
      expect(detectNip04InRecent(msgs, 4)).toBe(true);
    });
  });

  describe('sendNip04DM', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('sends a kind 4 event', async () => {
      const { sendNip04DM } = await import('./dm');
      const result = await sendNip04DM('recipient-pk', 'hello');
      expect(result).not.toBeNull();
      expect(mockEncrypt).toHaveBeenCalled();
      expect(mockPublish).toHaveBeenCalled();
    });

    it('returns null on encrypt failure', async () => {
      mockEncrypt.mockRejectedValueOnce(new Error('encrypt failed'));
      const { sendNip04DM } = await import('./dm');
      const result = await sendNip04DM('recipient-pk', 'hello');
      expect(result).toBeNull();
    });
  });

  describe('sendNip17DM', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('sends a gift-wrapped kind 14 event', async () => {
      const { sendNip17DM } = await import('./dm');
      const result = await sendNip17DM('recipient-pk', 'secret hello');
      expect(result).not.toBeNull();
      expect(mockPublish).toHaveBeenCalled();
    });
  });

  describe('sendDM', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('defaults to NIP-17', async () => {
      const { giftWrap } = await import('@nostr-dev-kit/ndk');
      const { sendDM } = await import('./dm');
      await sendDM('recipient-pk', 'test');
      expect(giftWrap).toHaveBeenCalled();
    });

    it('uses NIP-04 when specified', async () => {
      const { sendDM } = await import('./dm');
      await sendDM('recipient-pk', 'test', 'nip04');
      expect(mockEncrypt).toHaveBeenCalled();
    });
  });

  describe('discoverDMThreads', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('discovers NIP-04 threads from events', async () => {
      const fakeEvents = new Set([
        { pubkey: 'other-pk', tags: [['p', 'my-pk']], created_at: 100 },
        { pubkey: 'my-pk', tags: [['p', 'other-pk']], created_at: 200 },
      ]);
      mockFetchEvents.mockResolvedValue(fakeEvents);

      const { discoverDMThreads } = await import('./dm');
      const result = await discoverDMThreads('my-pk');
      expect(result.has('other-pk')).toBe(true);
      expect(result.get('other-pk')?.lastMessageAt).toBe(200);
    });
  });
});
