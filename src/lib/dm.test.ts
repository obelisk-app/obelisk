import { describe, it, expect } from 'vitest';
import { threadKey, detectNip04InRecent } from './dm';
import type { DMMessage } from './dm';

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
});
