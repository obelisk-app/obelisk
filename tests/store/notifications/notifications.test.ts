import { describe, it, expect, beforeEach } from 'vitest';
import {
  DM_NOTIFICATION_CAP,
  MENTION_CAP_PER_RELAY,
  NOTIFICATIONS_INITIAL,
  ensureNotificationsStoreForAccount,
  getUnreadDmNotificationCount,
  getUnreadMentionCount,
  isDmNotificationRead,
  isMentionRead,
  useNotificationsStore,
  type MentionNotification,
} from '@/store/notifications';
import { NOTIFICATIONS_STORE_VERSION } from '@/store/notifications/notifications-persist';
import { READ_STATE_INITIAL, useReadStateStore } from '@/store/read-state';
import { CORRUPT_STATES, freshPubkey, readBlob, seedBlob } from '../persist-blob';

const RELAY_A = 'wss://a.example';
const RELAY_B = 'wss://b.example';

function mention(over: Partial<MentionNotification> = {}): MentionNotification {
  return {
    id: 'm1',
    relay: RELAY_A,
    channelId: 'ch1',
    senderPubkey: 'pk',
    preview: 'hey @me',
    createdAt: 2_000,
    ...over,
  };
}

describe('useNotificationsStore', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ ...NOTIFICATIONS_INITIAL });
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
  });

  describe('registerRelay (first-connect floor)', () => {
    it('stamps a cursor at ~now for an unseen relay', () => {
      const before = Date.now();
      useNotificationsStore.getState().registerRelay(RELAY_A);
      const cursor = useNotificationsStore.getState().mentionCursorByRelay[RELAY_A];
      expect(cursor).toBeGreaterThanOrEqual(before);
      expect(cursor).toBeLessThanOrEqual(Date.now());
    });

    it('does NOT restamp a relay that already has a cursor', () => {
      useNotificationsStore.setState({ mentionCursorByRelay: { [RELAY_A]: 111 } });
      useNotificationsStore.getState().registerRelay(RELAY_A);
      expect(useNotificationsStore.getState().mentionCursorByRelay[RELAY_A]).toBe(111);
    });

    it('keeps cached mentions unread across a reconnect', () => {
      // Session 1: relay seen, a mention arrives and is never read.
      useNotificationsStore.setState({ mentionCursorByRelay: { [RELAY_A]: 1_000 } });
      useNotificationsStore.getState().pushMention(mention({ createdAt: 5_000 }));
      // Session 2: reconnecting must not silence it.
      useNotificationsStore.getState().registerRelay(RELAY_A);
      expect(getUnreadMentionCount(RELAY_A)).toBe(1);
    });

    it('drops the historical backfill on a first-ever connect', () => {
      useNotificationsStore.getState().registerRelay(RELAY_A);
      // Backfill: everything predates the floor stamped a moment ago.
      for (let i = 0; i < 10; i++) {
        useNotificationsStore.getState().pushMention(
          mention({ id: `old${i}`, createdAt: Date.now() - 86_400_000 + i }),
        );
      }
      expect(useNotificationsStore.getState().mentionsByRelay[RELAY_A]).toBeUndefined();
      expect(getUnreadMentionCount(RELAY_A)).toBe(0);
    });

    it('still admits live mentions after the floor is stamped', () => {
      useNotificationsStore.getState().registerRelay(RELAY_A);
      useNotificationsStore.getState().pushMention(
        mention({ createdAt: Date.now() + 1_000 }),
      );
      expect(getUnreadMentionCount(RELAY_A)).toBe(1);
    });
  });

  describe('push return values', () => {
    it('pushMention reports whether a card was added', () => {
      const store = useNotificationsStore.getState();
      expect(store.pushMention(mention({ id: 'r1', createdAt: 9_000 }))).toBe(true);
      expect(useNotificationsStore.getState().pushMention(mention({ id: 'r1', createdAt: 9_000 }))).toBe(false);
    });
  });

  describe('pushMention', () => {
    it('dedupes by event id', () => {
      useNotificationsStore.getState().pushMention(mention());
      useNotificationsStore.getState().pushMention(mention());
      expect(useNotificationsStore.getState().mentionsByRelay[RELAY_A]).toHaveLength(1);
    });

    it('drops anything at or older than the relay cursor', () => {
      useNotificationsStore.setState({ mentionCursorByRelay: { [RELAY_A]: 5_000 } });
      useNotificationsStore.getState().pushMention(mention({ id: 'old', createdAt: 4_000 }));
      useNotificationsStore.getState().pushMention(mention({ id: 'same', createdAt: 5_000 }));
      useNotificationsStore.getState().pushMention(mention({ id: 'new', createdAt: 6_000 }));
      const list = useNotificationsStore.getState().mentionsByRelay[RELAY_A];
      expect(list.map((m) => m.id)).toEqual(['new']);
    });

    it('keeps the list newest-first', () => {
      useNotificationsStore.getState().pushMention(mention({ id: 'a', createdAt: 100 }));
      useNotificationsStore.getState().pushMention(mention({ id: 'c', createdAt: 300 }));
      useNotificationsStore.getState().pushMention(mention({ id: 'b', createdAt: 200 }));
      const list = useNotificationsStore.getState().mentionsByRelay[RELAY_A];
      expect(list.map((m) => m.id)).toEqual(['c', 'b', 'a']);
    });

    it(`caps per relay at ${MENTION_CAP_PER_RELAY}`, () => {
      for (let i = 0; i < MENTION_CAP_PER_RELAY + 10; i++) {
        useNotificationsStore.getState().pushMention(
          mention({ id: `m${i}`, createdAt: 1_000 + i }),
        );
      }
      expect(useNotificationsStore.getState().mentionsByRelay[RELAY_A])
        .toHaveLength(MENTION_CAP_PER_RELAY);
    });

    it('keeps relays in separate buckets', () => {
      useNotificationsStore.getState().pushMention(mention({ id: 'a', relay: RELAY_A }));
      useNotificationsStore.getState().pushMention(mention({ id: 'b', relay: RELAY_B }));
      const s = useNotificationsStore.getState();
      expect(s.mentionsByRelay[RELAY_A]).toHaveLength(1);
      expect(s.mentionsByRelay[RELAY_B]).toHaveLength(1);
      expect(getUnreadMentionCount(RELAY_A)).toBe(1);
    });
  });

  describe('stream independence', () => {
    it('marking mentions read does not touch DM notifications', () => {
      useNotificationsStore.getState().pushMention(mention());
      useNotificationsStore.getState().pushDmNotification({
        id: 'd1', senderPubkey: 'peer', preview: 'yo', createdAt: 2_000,
      });
      expect(getUnreadMentionCount(RELAY_A)).toBe(1);
      expect(getUnreadDmNotificationCount()).toBe(1);

      useNotificationsStore.getState().markMentionsRead(RELAY_A);

      expect(getUnreadMentionCount(RELAY_A)).toBe(0);
      expect(getUnreadDmNotificationCount()).toBe(1);
    });

    it('reading DMs does not silence channel mentions', () => {
      useNotificationsStore.getState().pushMention(mention());
      useNotificationsStore.getState().pushDmNotification({
        id: 'd1', senderPubkey: 'peer', preview: 'yo', createdAt: 2_000,
      });

      useReadStateStore.getState().advanceInboxRead();

      expect(getUnreadDmNotificationCount()).toBe(0);
      expect(getUnreadMentionCount(RELAY_A)).toBe(1);
    });

    it('marking one relay read leaves other relays untouched', () => {
      useNotificationsStore.getState().pushMention(mention({ id: 'a', relay: RELAY_A }));
      useNotificationsStore.getState().pushMention(mention({ id: 'b', relay: RELAY_B }));
      useNotificationsStore.getState().markMentionsRead(RELAY_A);
      expect(getUnreadMentionCount(RELAY_A)).toBe(0);
      expect(getUnreadMentionCount(RELAY_B)).toBe(1);
    });

    it('clearMentions drops only that relay bucket', () => {
      useNotificationsStore.getState().pushMention(mention({ id: 'a', relay: RELAY_A }));
      useNotificationsStore.getState().pushMention(mention({ id: 'b', relay: RELAY_B }));
      useNotificationsStore.getState().clearMentions(RELAY_A);
      const s = useNotificationsStore.getState();
      expect(s.mentionsByRelay[RELAY_A]).toBeUndefined();
      expect(s.mentionsByRelay[RELAY_B]).toHaveLength(1);
    });

    it('clearDmNotifications wipes the log and advances the DM cursor', () => {
      useNotificationsStore.getState().pushDmNotification({
        id: 'd1', senderPubkey: 'peer', preview: 'yo', createdAt: 2_000,
      });
      useNotificationsStore.getState().clearDmNotifications();
      expect(useNotificationsStore.getState().dmNotifications).toEqual([]);
      expect(useReadStateStore.getState().inboxLastReadAt).toBeGreaterThan(0);
    });
  });

  describe('pushDmNotification', () => {
    it('dedupes by event id and caps the log', () => {
      for (let i = 0; i < DM_NOTIFICATION_CAP + 5; i++) {
        useNotificationsStore.getState().pushDmNotification({
          id: `d${i}`, senderPubkey: 'peer', preview: 'x', createdAt: 1_000 + i,
        });
      }
      useNotificationsStore.getState().pushDmNotification({
        id: 'd0', senderPubkey: 'peer', preview: 'x', createdAt: 1_000,
      });
      expect(useNotificationsStore.getState().dmNotifications)
        .toHaveLength(DM_NOTIFICATION_CAP);
    });

    it('drops anything at or older than the DM cursor', () => {
      useReadStateStore.setState({ inboxLastReadAt: 5_000 });
      useNotificationsStore.getState().pushDmNotification({
        id: 'old', senderPubkey: 'peer', preview: 'x', createdAt: 4_000,
      });
      expect(useNotificationsStore.getState().dmNotifications).toEqual([]);
    });
  });

  describe('read predicates', () => {
    it('a mention is read only once seen or dismissed, not when the channel cursor passes it', () => {
      const m = mention({ createdAt: 1_000 });
      expect(isMentionRead(m, 0)).toBe(false);
      expect(isMentionRead({ ...m, seen: true }, 0)).toBe(true);   // saw it on screen
      expect(isMentionRead(m, 2_000)).toBe(true);                  // dismissed the bell
    });

    it('getUnreadMentionCount ignores the channel cursor and honours seen', () => {
      useNotificationsStore.getState().pushMention(mention({ id: 'a', createdAt: 1_000 }));
      useNotificationsStore.getState().pushMention(
        mention({ id: 'b', channelId: 'ch2', createdAt: 1_000 }),
      );
      useReadStateStore.getState().setGroupCursor('ch1', 5_000);
      expect(getUnreadMentionCount(RELAY_A)).toBe(2);
      useNotificationsStore.getState().markMentionSeen(RELAY_A, 'a');
      expect(getUnreadMentionCount(RELAY_A)).toBe(1);
    });

    it('isDmNotificationRead compares against the DM cursor', () => {
      const d = { id: 'd', senderPubkey: 'p', preview: '', createdAt: 1_000 };
      expect(isDmNotificationRead(d, 500)).toBe(false);
      expect(isDmNotificationRead(d, 1_000)).toBe(true);
    });

    it('reading one DM clears only that peer through its read cursor', () => {
      const push = useNotificationsStore.getState().pushDmNotification;
      push({ id: 'a', senderPubkey: 'alice', createdAt: 1_000 });
      push({ id: 'b', senderPubkey: 'bob', createdAt: 1_000 });
      push({ id: 'c', senderPubkey: 'alice', createdAt: 2_000 });
      useReadStateStore.getState().setDmCursor('alice', 1_000);
      expect(getUnreadDmNotificationCount()).toBe(2);
      useReadStateStore.getState().applyRemoteState({ dmCursors: { alice: 2_000 } });
      expect(getUnreadDmNotificationCount()).toBe(1);
      expect(useReadStateStore.getState().inboxLastReadAt).toBe(0);
    });

    it('getUnreadMentionCount is 0 for an unknown relay', () => {
      expect(getUnreadMentionCount(null)).toBe(0);
      expect(getUnreadMentionCount('wss://never-seen')).toBe(0);
    });
  });

  describe('applyRemoteMentionCursor', () => {
    it('advances monotonically and ignores older remotes', () => {
      useNotificationsStore.getState().applyRemoteMentionCursor(RELAY_A, 1_000);
      useNotificationsStore.getState().applyRemoteMentionCursor(RELAY_A, 500);
      expect(useNotificationsStore.getState().mentionCursorByRelay[RELAY_A]).toBe(1_000);
      useNotificationsStore.getState().applyRemoteMentionCursor(RELAY_A, 2_000);
      expect(useNotificationsStore.getState().mentionCursorByRelay[RELAY_A]).toBe(2_000);
    });

    it('is a no-op (identity preserved) when the remote is not newer', () => {
      useNotificationsStore.getState().applyRemoteMentionCursor(RELAY_A, 1_000);
      const before = useNotificationsStore.getState().mentionCursorByRelay;
      useNotificationsStore.getState().applyRemoteMentionCursor(RELAY_A, 1_000);
      expect(useNotificationsStore.getState().mentionCursorByRelay).toBe(before);
    });
  });

  describe('reset', () => {
    it('wipes both streams', () => {
      useNotificationsStore.getState().pushMention(mention());
      useNotificationsStore.getState().pushDmNotification({
        id: 'd1', senderPubkey: 'p', preview: '', createdAt: 1_000,
      });
      useNotificationsStore.getState().reset();
      const s = useNotificationsStore.getState();
      expect(s.mentionsByRelay).toEqual({});
      expect(s.mentionCursorByRelay).toEqual({});
      expect(s.dmNotifications).toEqual([]);
    });
  });
});

describe('per-account notifications store', () => {
  beforeEach(() => {
    localStorage.clear();
    useNotificationsStore.setState({ ...NOTIFICATIONS_INITIAL });
  });

  // The ensure is a module-level no-op for the account it already points
  // at, so every test below uses pubkeys no other test in this file uses.
  const stored = (pubkey: string) =>
    (JSON.parse(localStorage.getItem(`obelisk-notifications:${pubkey}`) ?? 'null') as
      { state: typeof NOTIFICATIONS_INITIAL } | null)?.state;
  const persistedSlice = () => {
    const { mentionsByRelay, mentionCursorByRelay, dmNotifications } = useNotificationsStore.getState();
    return { mentionsByRelay, mentionCursorByRelay, dmNotifications };
  };
  const ids = (relay: string) => useNotificationsStore.getState().mentionsByRelay[relay]?.map((m) => m.id);

  // Storage is synchronous, so no tick is awaited anywhere here: the factory
  // relies on `rehydrate()` settling before it returns.
  it('scopes the persist key to the active pubkey', () => {
    const A = 'a'.repeat(64);
    ensureNotificationsStoreForAccount(A);
    useNotificationsStore.getState().pushMention(mention({ id: 'a1' }));
    expect(stored(A)?.mentionsByRelay[RELAY_A].map((m) => m.id)).toEqual(['a1']);
  });

  it('a second account starts from the initial state, and the first account survives the round trip', () => {
    const A = 'c'.repeat(64);
    const B = 'd'.repeat(64);

    ensureNotificationsStoreForAccount(A);
    useNotificationsStore.getState().registerRelay(RELAY_B);
    useNotificationsStore.getState().pushMention(mention({ id: 'from-a' }));
    const aSlice = persistedSlice();
    expect(stored(A)).toEqual(aSlice);

    // B has nothing stored. It must come up as a brand-new account: zustand's
    // rehydrate() merges, so without the factory's clear B would inherit A's
    // cards and cursors in memory and persist them under its own key.
    ensureNotificationsStoreForAccount(B);
    expect(persistedSlice()).toEqual(NOTIFICATIONS_INITIAL);
    expect(ids(RELAY_A)).toBeUndefined();
    // ...and the switch itself wrote nothing to A's key.
    expect(stored(A)).toEqual(aSlice);

    // B's own writes land under B's key only.
    useNotificationsStore.getState().pushMention(mention({ id: 'from-b' }));
    expect(stored(B)?.mentionsByRelay[RELAY_A].map((m) => m.id)).toEqual(['from-b']);
    expect(stored(A)).toEqual(aSlice);

    // Back to A: A's data comes up intact, with nothing of B's in it.
    ensureNotificationsStoreForAccount(A);
    expect(persistedSlice()).toEqual(aSlice);
    expect(ids(RELAY_A)).toEqual(['from-a']);
  });

  it('detaching (logout) resets memory and stops writes reaching the account key', () => {
    const A = 'e'.repeat(64);
    ensureNotificationsStoreForAccount(A);
    useNotificationsStore.getState().pushMention(mention({ id: 'from-a' }));
    const aSlice = persistedSlice();

    ensureNotificationsStoreForAccount(null);
    expect(persistedSlice()).toEqual(NOTIFICATIONS_INITIAL);
    // What the logout chain does next must not touch A's saved data.
    useNotificationsStore.getState().reset();
    expect(stored(A)).toEqual(aSlice);
  });
});

describe('notifications saved-data migrations', () => {
  const key = (pk: string) => `obelisk-notifications:${pk}`;
  const persisted = () => {
    const { mentionsByRelay, mentionCursorByRelay, dmNotifications } = useNotificationsStore.getState();
    return { mentionsByRelay, mentionCursorByRelay, dmNotifications };
  };

  it('a version 0 mention card from before reply tracking loads as a mention; a reply stays a reply', () => {
    const pk = freshPubkey();
    const oldCard = { id: 'old', relay: RELAY_A, channelId: 'ch1', senderPubkey: 'pk', preview: 'hi', createdAt: 1_000 };
    const reply = { ...oldCard, id: 'r', reason: 'reply', seen: true };
    const dm = { id: 'd', senderPubkey: 'pk', preview: 'x', createdAt: 9 };
    seedBlob(key(pk), {
      mentionsByRelay: { [RELAY_A]: [oldCard, reply] },
      mentionCursorByRelay: { [RELAY_A]: 500 },
      dmNotifications: [dm],
    }, 0);

    ensureNotificationsStoreForAccount(pk);

    expect(persisted()).toEqual({
      mentionsByRelay: { [RELAY_A]: [{ ...oldCard, reason: 'mention' }, reply] },
      mentionCursorByRelay: { [RELAY_A]: 500 },
      // The DM text an old version saved does not come back (version 1 -> 2).
      dmNotifications: [{ id: 'd', senderPubkey: 'pk', createdAt: 9 }],
    });
    const saved = readBlob(key(pk));
    expect(saved?.version).toBe(NOTIFICATIONS_STORE_VERSION);
    expect(saved?.state.mentionsByRelay).toEqual({ [RELAY_A]: [{ ...oldCard, reason: 'mention' }, reply] });
  });

  it('a version 1 DM card loses the message text it carried, in memory and on disk', () => {
    const pk = freshPubkey();
    const secret = 'meet me at the usual place';
    seedBlob(key(pk), {
      mentionsByRelay: {},
      mentionCursorByRelay: {},
      dmNotifications: [{ id: 'd1', senderPubkey: 'pk', preview: secret, createdAt: 9 }],
    }, 1);

    ensureNotificationsStoreForAccount(pk);

    expect(useNotificationsStore.getState().dmNotifications).toEqual([{ id: 'd1', senderPubkey: 'pk', createdAt: 9 }]);
    // Rewritten at once, not on the next change.
    expect(window.localStorage.getItem(key(pk))).not.toContain(secret);
    expect(readBlob(key(pk))?.version).toBe(NOTIFICATIONS_STORE_VERSION);
  });

  it('keeps a DM preview in memory and never writes it', () => {
    const pk = freshPubkey();
    ensureNotificationsStoreForAccount(pk);
    const store = useNotificationsStore.getState();
    store.pushDmNotification({ id: 'live', senderPubkey: 'pk', preview: 'the plaintext', createdAt: Date.now() + 1_000 });
    expect(useNotificationsStore.getState().dmNotifications[0].preview).toBe('the plaintext');
    expect(window.localStorage.getItem(key(pk))).not.toContain('the plaintext');
    expect(store.fillDmPreview('live', 'again')).toBe(true);
    expect(store.fillDmPreview('absent', 'x')).toBe(false);
    expect(window.localStorage.getItem(key(pk))).not.toContain('again');
  });

  it('drops a broken card without losing the rest of the log', () => {
    const pk = freshPubkey();
    const good = { id: 'g', relay: RELAY_B, channelId: 'c', senderPubkey: 'pk', preview: '', createdAt: 2, reason: 'mention' };
    seedBlob(key(pk), {
      mentionsByRelay: { [RELAY_B]: [good, { id: 'no-date', relay: RELAY_B }, 'card'], [RELAY_A]: 'none' },
      mentionCursorByRelay: { [RELAY_B]: 'now', [RELAY_A]: 7 },
      dmNotifications: [{ id: 'd' }, null],
    }, 1);
    ensureNotificationsStoreForAccount(pk);
    expect(persisted()).toEqual({
      mentionsByRelay: { [RELAY_B]: [good] },
      mentionCursorByRelay: { [RELAY_A]: 7 },
      dmNotifications: [],
    });
  });

  it.each(CORRUPT_STATES)('falls back to the defaults on %s', (_label, state, version) => {
    const pk = freshPubkey();
    seedBlob(key(pk), state, version);
    expect(() => ensureNotificationsStoreForAccount(pk)).not.toThrow();
    expect(persisted()).toEqual(NOTIFICATIONS_INITIAL);
  });
});
