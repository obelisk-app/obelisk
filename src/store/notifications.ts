/**
 * Notification log — two independent streams, never mixed.
 *
 *   • **Mentions** (group scope): an explicit `@you`, or a reply to one of
 *     your messages, in a NIP-29 channel. Scoped per relay. Scanned on the
 *     active relay by the bridge, and on the last few relays the user used
 *     by the background watcher (`src/lib/nostr-bridge/background-watch.ts`),
 *     which listens only for events that tag you.
 *   • **DMs** (account scope): incoming NIP-04 messages. DMs follow the
 *     user across relays via NIP-65, so this stream is relay-agnostic.
 *
 * Each stream owns its own read cursor. Reading your DMs must not mark
 * channel mentions read, and vice versa — that conflation was the whole
 * reason the old single `inboxEvents` + `inboxLastReadAt` pair was wrong.
 *
 * | Stream   | Log                  | Cursor                              | Synced via                      |
 * |----------|----------------------|-------------------------------------|---------------------------------|
 * | mentions | `mentionsByRelay`    | `mentionCursorByRelay[relay]`       | NIP-59 groups-scope wrap        |
 * | DMs      | `dmNotifications`    | `useReadStateStore.inboxLastReadAt` | NIP-59 DM-scope wrap (existing) |
 *
 * The DM cursor deliberately stays in the read-state store: it already
 * rides in the DM-scope gift wrap published to the NIP-65 read+write
 * union, so multi-device convergence keeps working untouched. This store
 * owns the card logs and the per-relay mention cursors only — one source
 * of truth per value.
 *
 * Ordinary channel traffic is NOT a notification. Only `@you` and replies
 * to your own messages ping.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { quotaSafeLocalStorage } from '@/lib/quota-safe-storage';
import { createEnsureForAccount } from './multi-account';
import { useReadStateStore } from './read-state';

/** Max mention cards retained per relay. */
export const MENTION_CAP_PER_RELAY = 50;
/** Max DM cards retained account-wide. */
export const DM_NOTIFICATION_CAP = 50;

/** Why a group message pinged: an explicit `@you`, or a reply to your message. */
export type MentionReason = 'mention' | 'reply';

export interface MentionNotification {
  /** The mentioning message's event id — also the dedupe key. */
  readonly id: string;
  /** Normalized relay URL this mention was scanned on. */
  readonly relay: string;
  readonly channelId: string;
  readonly senderPubkey: string;
  readonly preview: string;
  /** Unix **milliseconds**. */
  readonly createdAt: number;
  /** Absent on cards persisted before replies were tracked — read as `'mention'`. */
  readonly reason?: MentionReason;
  /**
   * The mentioning message was actually on screen (see `useMentionSeen`).
   * Deliberately NOT inferred from the channel read cursor: that cursor
   * jumps to the newest message the moment a channel opens at the bottom,
   * which cleared mentions the user never laid eyes on.
   */
  readonly seen?: boolean;
}

export interface DmNotification {
  /** The kind-4 event id — also the dedupe key. */
  readonly id: string;
  readonly senderPubkey: string;
  readonly preview: string;
  /** Unix **milliseconds**. */
  readonly createdAt: number;
}

interface NotificationsPersisted {
  /** Newest-first mention cards, keyed by normalized relay URL. */
  mentionsByRelay: Record<string, MentionNotification[]>;
  /**
   * Per-relay mention read cursor (unix ms). A relay present here with a
   * value has been connected to before; absence is what
   * {@link registerRelay} keys the first-connect floor off.
   */
  mentionCursorByRelay: Record<string, number>;
  /** Newest-first DM cards. Cursor lives in the read-state store. */
  dmNotifications: DmNotification[];
}

interface NotificationsActions {
  /**
   * Stamp a first-connect floor for `relay` if it has never been seen.
   * Must run BEFORE the relay's kind-9 subscriptions open, otherwise the
   * historical backfill floods the bell with mentions from before the
   * user ever opened this relay.
   *
   * Idempotent and deliberately non-destructive on repeat connects: a
   * relay whose cursor already exists keeps it, so mentions cached from
   * the last session stay unread until actually read.
   */
  registerRelay: (relay: string) => void;
  /**
   * Append a mention card. Drops anything at/older than the relay cursor.
   * Returns `true` only when a new card was added — the caller's cue to chime.
   */
  pushMention: (n: MentionNotification) => boolean;
  /** Append a DM card. Drops anything at/older than the DM cursor. Returns `true` when added. */
  pushDmNotification: (n: DmNotification) => boolean;
  /** The user actually saw mention `id` on `relay`. */
  markMentionSeen: (relay: string, id: string) => void;
  /** Channel right-click → "Mark as read": every card for that channel. */
  markChannelMentionsSeen: (relay: string, channelId: string) => void;
  /** Mark every mention on `relay` read (cursor := now). */
  markMentionsRead: (relay: string) => void;
  /** Drop `relay`'s mention log and mark it read. */
  clearMentions: (relay: string) => void;
  /** Drop the DM log. Also advances the DM cursor. */
  clearDmNotifications: () => void;
  /** Monotonic merge of a remote mention cursor (NIP-59 groups-scope wrap). */
  applyRemoteMentionCursor: (relay: string, tsMs: number) => void;
  /** Wipe everything — logout chain. */
  reset: () => void;
}

export type NotificationsStore = NotificationsPersisted & NotificationsActions;

export const NOTIFICATIONS_INITIAL: NotificationsPersisted = {
  mentionsByRelay: {},
  mentionCursorByRelay: {},
  dmNotifications: [],
};

/** DM cursor accessor — single source of truth lives in the read-state store. */
function dmCursor(): number {
  return useReadStateStore.getState().inboxLastReadAt;
}

export const useNotificationsStore = create<NotificationsStore>()(
  persist(
    (set, get) => ({
      ...NOTIFICATIONS_INITIAL,

      registerRelay: (relay) => set((state) => {
        if (state.mentionCursorByRelay[relay] !== undefined) return state;
        return {
          mentionCursorByRelay: {
            ...state.mentionCursorByRelay,
            [relay]: Date.now(),
          },
        };
      }),

      pushMention: (n) => {
        const state = get();
        if (n.createdAt <= (state.mentionCursorByRelay[n.relay] ?? 0)) return false;
        const existing = state.mentionsByRelay[n.relay] ?? [];
        if (existing.some((m) => m.id === n.id)) return false;
        const next = [n, ...existing]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, MENTION_CAP_PER_RELAY);
        set({ mentionsByRelay: { ...state.mentionsByRelay, [n.relay]: next } });
        return next.some((m) => m.id === n.id);
      },

      pushDmNotification: (n) => {
        const state = get();
        if (n.createdAt <= dmCursor()) return false;
        if (state.dmNotifications.some((d) => d.id === n.id)) return false;
        const next = [n, ...state.dmNotifications]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, DM_NOTIFICATION_CAP);
        set({ dmNotifications: next });
        return next.some((d) => d.id === n.id);
      },

      markMentionSeen: (relay, id) => set((state) => {
        const list = state.mentionsByRelay[relay];
        if (!list?.some((m) => m.id === id && !m.seen)) return state;
        return {
          mentionsByRelay: {
            ...state.mentionsByRelay,
            [relay]: list.map((m) => (m.id === id ? { ...m, seen: true } : m)),
          },
        };
      }),

      markChannelMentionsSeen: (relay, channelId) => set((state) => {
        const list = state.mentionsByRelay[relay];
        if (!list?.some((m) => m.channelId === channelId && !m.seen)) return state;
        return {
          mentionsByRelay: {
            ...state.mentionsByRelay,
            [relay]: list.map((m) => (m.channelId === channelId && !m.seen ? { ...m, seen: true } : m)),
          },
        };
      }),

      markMentionsRead: (relay) => set((state) => ({
        mentionCursorByRelay: { ...state.mentionCursorByRelay, [relay]: Date.now() },
      })),

      clearMentions: (relay) => set((state) => {
        const mentionsByRelay = { ...state.mentionsByRelay };
        delete mentionsByRelay[relay];
        return {
          mentionsByRelay,
          mentionCursorByRelay: { ...state.mentionCursorByRelay, [relay]: Date.now() },
        };
      }),

      clearDmNotifications: () => {
        useReadStateStore.getState().advanceInboxRead();
        set({ dmNotifications: [] });
      },

      applyRemoteMentionCursor: (relay, tsMs) => set((state) => {
        if (tsMs <= (state.mentionCursorByRelay[relay] ?? 0)) return state;
        return {
          mentionCursorByRelay: { ...state.mentionCursorByRelay, [relay]: tsMs },
        };
      }),

      reset: () => set({ ...NOTIFICATIONS_INITIAL }),
    }),
    {
      name: 'obelisk-notifications',
      storage: createJSONStorage(() => quotaSafeLocalStorage),
      partialize: (state) =>
        ({
          mentionsByRelay: state.mentionsByRelay,
          mentionCursorByRelay: state.mentionCursorByRelay,
          dmNotifications: state.dmNotifications,
        }) as NotificationsPersisted,
    },
  ),
);

/**
 * Multi-account isolation — swaps the persist key to
 * `obelisk-notifications:{pubkey}`. Without this, account B on the same
 * browser would inherit account A's mention cards.
 */
export const ensureNotificationsStoreForAccount = createEnsureForAccount(
  'obelisk-notifications',
  useNotificationsStore,
);

// -- read predicates ----------------------------------------------------

/**
 * A mention is read once the user has actually seen it (`seen`, set by
 * `useMentionSeen` when the message was on screen) or dismissed the bell
 * for its relay (the relay mention cursor). Reading *around* it — the
 * channel cursor advancing because the channel opened at the bottom — does
 * not count.
 */
export function isMentionRead(m: MentionNotification, relayCursor: number): boolean {
  return m.seen === true || m.createdAt <= relayCursor;
}

export function isDmNotificationRead(d: DmNotification, cursor: number): boolean {
  return d.createdAt <= cursor;
}

// -- non-reactive selectors (for use outside React) ---------------------

export function getUnreadMentionCount(relay: string | null | undefined): number {
  if (!relay) return 0;
  const { mentionsByRelay, mentionCursorByRelay } = useNotificationsStore.getState();
  const list = mentionsByRelay[relay];
  if (!list || list.length === 0) return 0;
  const cursor = mentionCursorByRelay[relay] ?? 0;
  let n = 0;
  for (const m of list) {
    if (!isMentionRead(m, cursor)) n++;
  }
  return n;
}

export function getUnreadDmNotificationCount(): number {
  const { dmNotifications } = useNotificationsStore.getState();
  const cursor = dmCursor();
  let n = 0;
  for (const d of dmNotifications) {
    if (!isDmNotificationRead(d, cursor)) n++;
  }
  return n;
}
