/**
 * Per-channel notification preferences — the channel right-click menu.
 *
 * Keyed by `relay|channelId`: NIP-29 group ids are only unique per relay.
 *
 *   • **following** (default true). Unfollowing a channel stops it from
 *     asking for attention: no unread count, a dimmed row, no "all
 *     messages" pings. `@mentions` and replies STILL ping — being addressed
 *     directly is not "channel activity".
 *   • **mutedUntil** — silence sounds and system popups until a time
 *     (unix ms), or forever ({@link MUTED_FOREVER}). Cards and the mention
 *     badge are still recorded, so nothing is lost; it's just quiet.
 *   • **notify** — `'all'` pings on every new message (active relay only:
 *     background relays only listen for events that tag you), `'mentions'`
 *     (default) on @mentions/replies, `'nothing'` never — not even a card.
 *
 * Persisted per account (`obelisk-channel-prefs:{pubkey}`), wired into
 * `PER_ACCOUNT_STORES` in `src/lib/read-state/root.tsx`.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { quotaSafeLocalStorage } from '@/lib/quota-safe-storage';
import { createEnsureForAccount } from './multi-account';

export type ChannelNotifyLevel = 'all' | 'mentions' | 'nothing';

/** JSON has no Infinity; -1 means "until I turn it back on". */
export const MUTED_FOREVER = -1;

export interface ChannelPref {
  readonly unfollowed?: boolean;
  /** Unix ms, or {@link MUTED_FOREVER}. Absent = not muted. */
  readonly mutedUntil?: number;
  /** Absent = `'mentions'`. */
  readonly notify?: ChannelNotifyLevel;
}

export const DEFAULT_CHANNEL_PREF: ChannelPref = Object.freeze({});

export function channelPrefKey(relay: string, channelId: string): string {
  return `${relay}|${channelId}`;
}

interface ChannelPrefsState {
  prefs: Record<string, ChannelPref>;
  setFollowing: (relay: string, channelId: string, following: boolean) => void;
  /** `until`: unix ms, {@link MUTED_FOREVER}, or `null` to unmute. */
  setMutedUntil: (relay: string, channelId: string, until: number | null) => void;
  setNotify: (relay: string, channelId: string, level: ChannelNotifyLevel) => void;
  reset: () => void;
}

function patch(
  prefs: Record<string, ChannelPref>,
  key: string,
  change: Partial<Record<keyof ChannelPref, ChannelPref[keyof ChannelPref] | undefined>>,
): Record<string, ChannelPref> {
  const next: Record<string, unknown> = { ...(prefs[key] ?? {}), ...change };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  const out = { ...prefs };
  if (Object.keys(next).length === 0) delete out[key];
  else out[key] = next as ChannelPref;
  return out;
}

export const useChannelPrefsStore = create<ChannelPrefsState>()(
  persist(
    (set) => ({
      prefs: {},
      setFollowing: (relay, channelId, following) => set((s) => ({
        prefs: patch(s.prefs, channelPrefKey(relay, channelId), { unfollowed: following ? undefined : true }),
      })),
      setMutedUntil: (relay, channelId, until) => set((s) => ({
        prefs: patch(s.prefs, channelPrefKey(relay, channelId), { mutedUntil: until ?? undefined }),
      })),
      setNotify: (relay, channelId, level) => set((s) => ({
        prefs: patch(s.prefs, channelPrefKey(relay, channelId), { notify: level === 'mentions' ? undefined : level }),
      })),
      reset: () => set({ prefs: {} }),
    }),
    {
      name: 'obelisk-channel-prefs',
      storage: createJSONStorage(() => quotaSafeLocalStorage),
      partialize: (s) => ({ prefs: s.prefs }) as ChannelPrefsState,
    },
  ),
);

export const ensureChannelPrefsStoreForAccount = createEnsureForAccount(
  'obelisk-channel-prefs',
  useChannelPrefsStore,
);

// -- pure readers --------------------------------------------------------

export function getChannelPref(relay: string | null | undefined, channelId: string): ChannelPref {
  if (!relay) return DEFAULT_CHANNEL_PREF;
  return useChannelPrefsStore.getState().prefs[channelPrefKey(relay, channelId)] ?? DEFAULT_CHANNEL_PREF;
}

export function isChannelMuted(pref: ChannelPref, now = Date.now()): boolean {
  const until = pref.mutedUntil;
  if (until === undefined) return false;
  return until === MUTED_FOREVER || until > now;
}

export function notifyLevel(pref: ChannelPref): ChannelNotifyLevel {
  return pref.notify ?? 'mentions';
}

/** Reactive pref for one channel row. */
export function useChannelPref(relay: string | null | undefined, channelId: string): ChannelPref {
  return useChannelPrefsStore((s) => (relay ? s.prefs[channelPrefKey(relay, channelId)] : undefined) ?? DEFAULT_CHANNEL_PREF);
}
