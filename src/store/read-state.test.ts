import { describe, it, expect, beforeEach } from 'vitest';
import {
  useReadStateStore,
  ensureReadStateStoreForAccount,
  getInboxUnreadCount,
  READ_STATE_INITIAL,
  INBOX_CAP,
} from './read-state';

describe('useReadStateStore', () => {
  beforeEach(() => {
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
  });

  it('starts empty', () => {
    const s = useReadStateStore.getState();
    expect(s.dmCursors).toEqual({});
    expect(s.groupCursors).toEqual({});
    expect(s.inboxEvents).toEqual([]);
    expect(s.inboxLastReadAt).toBe(0);
  });

  describe('setDmCursor', () => {
    it('writes a cursor for a new peer', () => {
      useReadStateStore.getState().setDmCursor('alice', 1000);
      expect(useReadStateStore.getState().dmCursors['alice']).toBe(1000);
    });

    it('only advances — never moves backwards', () => {
      useReadStateStore.getState().setDmCursor('alice', 5000);
      useReadStateStore.getState().setDmCursor('alice', 3000);
      expect(useReadStateStore.getState().dmCursors['alice']).toBe(5000);
    });

    it('no-ops when tsMs equals existing cursor (idempotent)', () => {
      useReadStateStore.getState().setDmCursor('alice', 1000);
      const before = useReadStateStore.getState().dmCursors;
      useReadStateStore.getState().setDmCursor('alice', 1000);
      expect(useReadStateStore.getState().dmCursors).toBe(before);
    });
  });

  describe('setGroupCursor', () => {
    it('advances and is monotonic just like dmCursors', () => {
      useReadStateStore.getState().setGroupCursor('g1', 100);
      useReadStateStore.getState().setGroupCursor('g1', 200);
      useReadStateStore.getState().setGroupCursor('g1', 50);
      expect(useReadStateStore.getState().groupCursors['g1']).toBe(200);
    });
  });

  describe('inbox', () => {
    it('pushes events newest-first and dedupes by id', () => {
      const base = {
        type: 'mention' as const,
        senderPubkey: 'pk',
        channelId: 'ch1',
        messageId: 'm1',
        createdAt: '2026-05-08T10:00:00Z',
      };
      useReadStateStore.getState().pushInboxEvent(base);
      useReadStateStore.getState().pushInboxEvent(base);
      expect(useReadStateStore.getState().inboxEvents).toHaveLength(1);
    });

    it(`caps inbox at INBOX_CAP=${INBOX_CAP}`, () => {
      for (let i = 0; i < INBOX_CAP + 10; i++) {
        useReadStateStore.getState().pushInboxEvent({
          type: 'mention',
          senderPubkey: 'pk',
          channelId: 'ch1',
          messageId: `m${i}`,
          createdAt: `2026-05-08T10:00:${i.toString().padStart(2, '0')}Z`,
        });
      }
      expect(useReadStateStore.getState().inboxEvents).toHaveLength(INBOX_CAP);
    });

    it('advanceInboxRead sets inboxLastReadAt to ~now', () => {
      const before = Date.now();
      useReadStateStore.getState().advanceInboxRead();
      const after = Date.now();
      const ts = useReadStateStore.getState().inboxLastReadAt;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('clearInboxEvents wipes the log', () => {
      useReadStateStore.getState().pushInboxEvent({
        type: 'mention', senderPubkey: 'pk', channelId: 'ch1', messageId: 'm1',
        createdAt: '2026-05-08T10:00:00Z',
      });
      useReadStateStore.getState().clearInboxEvents();
      expect(useReadStateStore.getState().inboxEvents).toEqual([]);
    });

    it('getInboxUnreadCount counts events newer than the cursor', () => {
      useReadStateStore.setState({ inboxLastReadAt: Date.parse('2026-05-08T10:00:00Z') });
      useReadStateStore.getState().pushInboxEvent({
        type: 'mention', senderPubkey: 'pk', channelId: 'ch1', messageId: 'm1',
        createdAt: '2026-05-08T09:00:00Z', // older — read
      });
      useReadStateStore.getState().pushInboxEvent({
        type: 'mention', senderPubkey: 'pk', channelId: 'ch1', messageId: 'm2',
        createdAt: '2026-05-08T11:00:00Z', // newer — unread
      });
      useReadStateStore.getState().pushInboxEvent({
        type: 'mention', senderPubkey: 'pk', channelId: 'ch1', messageId: 'm3',
        createdAt: '2026-05-08T12:00:00Z', // newer — unread
      });
      expect(getInboxUnreadCount()).toBe(2);
    });
  });

  describe('reset', () => {
    it('wipes all cursors and inbox', () => {
      useReadStateStore.getState().setDmCursor('alice', 1000);
      useReadStateStore.getState().setGroupCursor('g1', 2000);
      useReadStateStore.getState().pushInboxEvent({
        type: 'mention', senderPubkey: 'pk', channelId: 'ch1', messageId: 'm1',
        createdAt: '2026-05-08T10:00:00Z',
      });
      useReadStateStore.getState().reset();
      const s = useReadStateStore.getState();
      expect(s.dmCursors).toEqual({});
      expect(s.groupCursors).toEqual({});
      expect(s.inboxEvents).toEqual([]);
      expect(s.inboxLastReadAt).toBe(0);
    });
  });
});

describe('per-account read-state store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persist key includes the active pubkey', async () => {
    ensureReadStateStoreForAccount('a'.repeat(64));
    useReadStateStore.getState().setDmCursor('peer-1', 12345);
    await new Promise((r) => setTimeout(r, 0));
    expect(localStorage.getItem('obelisk-read-state:' + 'a'.repeat(64))).not.toBeNull();
  });

  it('switching accounts swaps the persist key', async () => {
    ensureReadStateStoreForAccount('a'.repeat(64));
    useReadStateStore.getState().setDmCursor('peer-1', 100);
    await new Promise((r) => setTimeout(r, 0));

    ensureReadStateStoreForAccount('b'.repeat(64));
    useReadStateStore.getState().setDmCursor('peer-2', 200);
    await new Promise((r) => setTimeout(r, 0));

    expect(localStorage.getItem('obelisk-read-state:' + 'a'.repeat(64))).not.toBeNull();
    expect(localStorage.getItem('obelisk-read-state:' + 'b'.repeat(64))).not.toBeNull();
  });
});
