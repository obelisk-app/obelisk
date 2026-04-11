import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCache,
  enumeratePartners,
  getCachedEvents,
  getLatestForPartner,
  getPlaintext,
  getRumor,
  getSyncState,
  putEvent,
  putEvents,
  putPlaintext,
  putRumor,
  setSyncState,
  type CachedDMEvent,
  type CachedRumor,
} from './dm-cache';

const ME = 'a'.repeat(64);
const ALICE = 'b'.repeat(64);
const BOB = 'c'.repeat(64);

function nip04(id: string, from: string, to: string, ts: number): CachedDMEvent {
  return { id, pubkey: from, kind: 4, created_at: ts, content: '<enc>', tags: [['p', to]], sig: 'sig' };
}

function wrap(id: string, ts: number): CachedDMEvent {
  return { id, pubkey: 'random-ephemeral', kind: 1059, created_at: ts, content: '<sealed>', tags: [['p', ME]], sig: 'sig' };
}

describe('dm-cache', () => {
  beforeEach(() => {
    clearCache(ME);
  });

  describe('events', () => {
    it('round-trips a single NIP-04 event', () => {
      putEvent(ME, nip04('e1', ALICE, ME, 100));
      const all = getCachedEvents(ME);
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('e1');
    });

    it('putEvents batches inserts', () => {
      putEvents(ME, [
        nip04('e1', ALICE, ME, 100),
        nip04('e2', ME, ALICE, 150),
        nip04('e3', BOB, ME, 200),
      ]);
      expect(getCachedEvents(ME)).toHaveLength(3);
    });

    it('scopes events per myPubkey', () => {
      putEvent(ME, nip04('e1', ALICE, ME, 100));
      const other = 'd'.repeat(64);
      expect(getCachedEvents(other)).toHaveLength(0);
      clearCache(other);
    });
  });

  describe('rumors + decrypted plaintext', () => {
    it('stores and retrieves rumor by wrapId', () => {
      const rumor: CachedRumor = {
        rumorId: 'r1',
        wrapId: 'w1',
        senderPubkey: ALICE,
        recipientPubkey: ME,
        content: 'hi',
        createdAt: 300,
      };
      putRumor(ME, rumor);
      expect(getRumor(ME, 'w1')).toEqual(rumor);
    });

    it('stores and retrieves decrypted plaintext', () => {
      putPlaintext(ME, 'e1', 'hello');
      expect(getPlaintext(ME, 'e1')).toBe('hello');
    });
  });

  describe('syncState', () => {
    it('defaults to zeros', () => {
      expect(getSyncState(ME)).toEqual({ lastFullScanAt: 0, lastPollAt: 0, inboxRelaysPublishedAt: 0 });
    });

    it('merges partial patches', () => {
      setSyncState(ME, { lastFullScanAt: 1000 });
      setSyncState(ME, { lastPollAt: 2000 });
      expect(getSyncState(ME)).toMatchObject({ lastFullScanAt: 1000, lastPollAt: 2000 });
    });
  });

  describe('getLatestForPartner', () => {
    it('picks newest NIP-04 event', () => {
      putEvents(ME, [
        nip04('e1', ALICE, ME, 100),
        nip04('e2', ME, ALICE, 200),
        nip04('e3', ALICE, ME, 300),
      ]);
      const latest = getLatestForPartner(ME, ALICE);
      expect(latest?.event.id).toBe('e3');
    });

    it('picks newest NIP-17 event via rumor timestamp', () => {
      putEvents(ME, [wrap('w1', 500), wrap('w2', 500)]);
      putRumor(ME, { rumorId: 'r1', wrapId: 'w1', senderPubkey: ALICE, recipientPubkey: ME, content: 'first', createdAt: 100 });
      putRumor(ME, { rumorId: 'r2', wrapId: 'w2', senderPubkey: ALICE, recipientPubkey: ME, content: 'second', createdAt: 900 });
      const latest = getLatestForPartner(ME, ALICE);
      expect(latest?.event.id).toBe('w2');
      expect(latest?.rumor?.content).toBe('second');
    });

    it('ignores other partners', () => {
      putEvents(ME, [nip04('e1', BOB, ME, 100)]);
      expect(getLatestForPartner(ME, ALICE)).toBeUndefined();
    });
  });

  describe('enumeratePartners', () => {
    it('returns one row per partner across NIP-04 and NIP-17', () => {
      putEvents(ME, [
        nip04('e1', ALICE, ME, 100),
        nip04('e2', ME, ALICE, 200),
        nip04('e3', BOB, ME, 50),
        wrap('w1', 999),
      ]);
      putRumor(ME, { rumorId: 'r1', wrapId: 'w1', senderPubkey: BOB, recipientPubkey: ME, content: 'hi', createdAt: 500 });

      const partners = enumeratePartners(ME);
      expect(partners.size).toBe(2);
      expect(partners.get(ALICE)).toMatchObject({ lastMessageAt: 200, protocol: 'nip04' });
      expect(partners.get(BOB)).toMatchObject({ lastMessageAt: 500, protocol: 'nip17' });
    });

    it('excludes self-addressed entries', () => {
      putEvents(ME, [nip04('e1', ME, ME, 100)]);
      const partners = enumeratePartners(ME);
      expect(partners.size).toBe(0);
    });
  });
});
