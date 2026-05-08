import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type InboxEventType = 'mention' | 'reply' | 'everyone' | 'dm' | 'message' | 'zap';

export interface InboxEventInput {
  type: InboxEventType;
  channelId?: string;
  serverId?: string;
  messageId?: string;
  postId?: string;
  senderPubkey: string;
  preview?: string;
  /** ISO timestamp string (relay-derived), e.g. `new Date(ev.created_at * 1000).toISOString()`. */
  createdAt: string;
}

export interface InboxEvent extends InboxEventInput {
  id: string;
}

export const INBOX_CAP = 50;

interface ReadStatePersisted {
  /** Per-peer DM read cursor in unix milliseconds. Monotonic — only advances. */
  dmCursors: Record<string, number>;
  /** Per-channel read cursor in unix milliseconds. Monotonic. */
  groupCursors: Record<string, number>;
  /** Single inbox cursor (unix ms). Anything older than this is "read". */
  inboxLastReadAt: number;
  /** Ring buffer of mention/dm/etc cards. Newest first, capped at INBOX_CAP. */
  inboxEvents: InboxEvent[];
}

interface ReadStateActions {
  /** Advance the DM cursor for `peer` to `tsMs`. No-op if `tsMs` <= existing. */
  setDmCursor: (peer: string, tsMs: number) => void;
  /** Advance the channel cursor. No-op if `tsMs` <= existing. */
  setGroupCursor: (groupId: string, tsMs: number) => void;
  /** Mark the entire inbox as read at `Date.now()`. */
  advanceInboxRead: () => void;
  /** Push an event to the inbox (dedupes by id, caps at INBOX_CAP). */
  pushInboxEvent: (evt: InboxEventInput) => void;
  /** Wipe the inbox log entirely (button in the bell menu). */
  clearInboxEvents: () => void;
  /** Wipe everything. Called from the logout chain. */
  reset: () => void;
}

export type ReadStateStore = ReadStatePersisted & ReadStateActions;

export const READ_STATE_INITIAL: ReadStatePersisted = {
  dmCursors: {},
  groupCursors: {},
  inboxLastReadAt: 0,
  inboxEvents: [],
};

function buildInboxId(evt: InboxEventInput): string {
  // `createdAt` + sender + (messageId|channelId|postId|nonce) is unique enough
  // to dedupe relay replays. If multiple producers ever share all four, dedup
  // collisions are benign — the last write wins on the same id slot.
  return `${evt.createdAt}-${evt.senderPubkey}-${
    evt.messageId ?? evt.channelId ?? evt.postId ?? Math.random().toString(36).slice(2, 8)
  }`;
}

export const useReadStateStore = create<ReadStateStore>()(
  persist(
    (set) => ({
      ...READ_STATE_INITIAL,

      setDmCursor: (peer, tsMs) => set((state) => {
        const prev = state.dmCursors[peer] ?? 0;
        if (tsMs <= prev) return state;
        return { dmCursors: { ...state.dmCursors, [peer]: tsMs } };
      }),

      setGroupCursor: (groupId, tsMs) => set((state) => {
        const prev = state.groupCursors[groupId] ?? 0;
        if (tsMs <= prev) return state;
        return { groupCursors: { ...state.groupCursors, [groupId]: tsMs } };
      }),

      advanceInboxRead: () => set({ inboxLastReadAt: Date.now() }),

      pushInboxEvent: (evt) => set((state) => {
        const id = buildInboxId(evt);
        if (state.inboxEvents.some((e) => e.id === id)) return state;
        const next: InboxEvent = { ...evt, id };
        return { inboxEvents: [next, ...state.inboxEvents].slice(0, INBOX_CAP) };
      }),

      clearInboxEvents: () => set({ inboxEvents: [], inboxLastReadAt: Date.now() }),

      reset: () => set({ ...READ_STATE_INITIAL }),
    }),
    {
      name: 'obelisk-read-state',
      storage: createJSONStorage(() => {
        if (typeof localStorage === 'undefined') {
          const mem = new Map<string, string>();
          return {
            getItem: (k) => mem.get(k) ?? null,
            setItem: (k, v) => void mem.set(k, v),
            removeItem: (k) => void mem.delete(k),
          };
        }
        return localStorage;
      }),
      partialize: (state) =>
        ({
          dmCursors: state.dmCursors,
          groupCursors: state.groupCursors,
          inboxLastReadAt: state.inboxLastReadAt,
          inboxEvents: state.inboxEvents,
        }) as ReadStatePersisted,
    },
  ),
);

let activeStorageName = 'obelisk-read-state';

/**
 * Multi-account isolation: swap the persist storage key to one namespaced
 * by the active pubkey. Mirrors `ensureDMStoreForAccount` so cursors don't
 * leak across logins on the same device.
 *
 * Idempotent — a no-op when already pointing at this account.
 */
export function ensureReadStateStoreForAccount(myPubkey: string): void {
  const next = `obelisk-read-state:${myPubkey}`;
  if (next === activeStorageName) return;
  activeStorageName = next;
  useReadStateStore.persist.setOptions({ name: next });
  void useReadStateStore.persist.rehydrate();
}

/**
 * Inbox unread count selector for use outside React. Counts events whose
 * `createdAt` (ISO) parses to a timestamp newer than `inboxLastReadAt`.
 */
export function getInboxUnreadCount(): number {
  const { inboxEvents, inboxLastReadAt } = useReadStateStore.getState();
  let n = 0;
  for (const e of inboxEvents) {
    const t = Date.parse(e.createdAt);
    if (!Number.isNaN(t) && t > inboxLastReadAt) n++;
  }
  return n;
}
