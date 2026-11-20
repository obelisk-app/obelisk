/**
 * Per-channel notification preferences: the channel right-click menu.
 *
 * Keyed by `relay|channelId`: NIP-29 group ids are only unique per relay.
 *
 *   • **following** via participation or a manual choice. Unfollowing stops it from
 *     asking for attention: no unread count, a dimmed row, no "all
 *     messages" pings. `@mentions` and replies STILL ping: being addressed
 *     directly is not "channel activity".
 *   • **mutedUntil**: silence sounds and system popups until a time
 *     (unix ms), or forever ({@link MUTED_FOREVER}). Cards and the mention
 *     badge are still recorded, so nothing is lost; it's just quiet.
 *   • **notify**: `'all'` pings on every new message (active relay only:
 *     background relays only listen for events that tag you), `'mentions'`
 *     (default) on @mentions/replies, `'nothing'` never, not even a card.
 *
 * Persisted per account (`obelisk-channel-prefs:{pubkey}`), wired into
 * `PER_ACCOUNT_STORES` in `src/services/read-state/account-stores.ts`.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { quotaSafeLocalStorage } from '@/services/common/quota-safe-storage';
import { createEnsureForAccount } from '../common/multi-account';
import { asRecord, finiteOrUndefined, oneOf, recordOf, versionedPersist } from '../common/persist-version';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { MUTED_FOREVER } from '@/constants/chat/channel-prefs';

export type ChannelNotifyLevel = 'all' | 'mentions' | 'nothing';

export interface ChannelPref {
  readonly unfollowed?: boolean;
  readonly followed?: boolean;
  readonly historyChecked?: true;
  readonly followRevision?: number;
  readonly latestMessageAt?: number;
  /** Unix ms, or {@link MUTED_FOREVER}. Absent = not muted. */
  readonly mutedUntil?: number;
  /** Absent = `'mentions'`. */
  readonly notify?: ChannelNotifyLevel;
}

export const DEFAULT_CHANNEL_PREF: ChannelPref = Object.freeze({});

export function channelPrefKey(relay: string, channelId: string): string {
  return `${normalizeRelayUrl(relay)}|${channelId}`;
}

interface ChannelPrefsState {
  prefs: Record<string, ChannelPref>;
  markHistoryChecked: (relay: string, channelId: string) => void;
  mergeFollow: (relay: string, channelId: string, revision: number) => void;
  recordActivity: (relay: string, channelId: string, timestamp: number, participated: boolean) => void;
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

type ChannelPrefsPersisted = Pick<ChannelPrefsState, 'prefs'>;

/** Version 2 adds follow participation and revisions to notification preferences. */
export const CHANNEL_PREFS_STORE_VERSION = 2;

const STORED_NOTIFY_LEVELS: readonly ChannelNotifyLevel[] = ['all', 'nothing'];

/**
 * One saved pref, in the same sparse form `patch` writes: a field is kept
 * only when it holds a non-default value of the right type, and a pref with
 * nothing left is dropped.
 */
function sanitizePref(value: unknown): ChannelPref | undefined {
  const raw = asRecord(value);
  const pref: { unfollowed?: true; followed?: true; historyChecked?: true; followRevision?: number; latestMessageAt?: number; mutedUntil?: number; notify?: ChannelNotifyLevel } = {};
  if (raw.historyChecked === true) pref.historyChecked = true;
  if (raw.followed === true) pref.followed = true;
  const latest = finiteOrUndefined(raw.latestMessageAt);
  if (latest !== undefined) pref.latestMessageAt = latest;
  if (raw.unfollowed === true) pref.unfollowed = true;
  const revision = finiteOrUndefined(raw.followRevision);
  if (revision !== undefined && Number.isSafeInteger(revision) && revision > 0) pref.followRevision = revision;
  else if (pref.unfollowed) pref.followRevision = 3;
  const mutedUntil = finiteOrUndefined(raw.mutedUntil);
  if (mutedUntil !== undefined) pref.mutedUntil = mutedUntil;
  const notify = oneOf(raw.notify, STORED_NOTIFY_LEVELS);
  if (notify) pref.notify = notify;
  return Object.keys(pref).length > 0 ? pref : undefined;
}

export function sanitizeChannelPrefsPersisted(raw: Record<string, unknown>): ChannelPrefsPersisted {
  return { prefs: recordOf(raw.prefs, sanitizePref) };
}

export const useChannelPrefsStore = create<ChannelPrefsState>()(
  persist(
    (set, get) => ({
      prefs: {},
      recordActivity: (relay, channelId, timestamp, participated) => {
        const key = channelPrefKey(relay, channelId);
        const pref = get().prefs[key];
        if (!participated && (!pref?.followed || pref.unfollowed)) return;
        const latestMessageAt = Math.max(timestamp, pref?.latestMessageAt ?? 0);
        if (latestMessageAt === pref?.latestMessageAt && pref.followed) return;
        set((s) => ({
          prefs: patch(s.prefs, key, { followed: true, latestMessageAt }),
        }));
      },
      markHistoryChecked: (relay, channelId) => set((s) => {
        const key = channelPrefKey(relay, channelId);
        if (s.prefs[key]?.historyChecked) return s;
        return { prefs: patch(s.prefs, key, { historyChecked: true }) };
      }),
      mergeFollow: (relay, channelId, revision) => set((s) => {
        if (!Number.isSafeInteger(revision) || revision <= 0) return s;
        const key = channelPrefKey(relay, channelId);
        const pref = s.prefs[key];
        if (revision <= (pref?.followRevision ?? (pref?.followed ? 1 : 0))) return s;
        return { prefs: patch(s.prefs, key, {
          followed: true,
          followRevision: revision,
          unfollowed: revision > 1 && revision % 2 === 1 ? true : undefined,
        }) };
      }),
      setFollowing: (relay, channelId, following) => {
        const revision = get().prefs[channelPrefKey(relay, channelId)]?.followRevision ?? 0;
        // Manual choices outrank automatic participation (revision 1).
        // In the same millisecond an unfollow wins the tie.
        const next = Math.max(Date.now(), Math.floor(revision / 2) + 1) * 2;
        get().mergeFollow(relay, channelId, next + (following ? 0 : 1));
      },
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
      partialize: (s): ChannelPrefsPersisted => ({ prefs: s.prefs }),
      ...versionedPersist<ChannelPrefsState, ChannelPrefsPersisted>({
        version: CHANNEL_PREFS_STORE_VERSION,
        sanitize: sanitizeChannelPrefsPersisted,
      }),
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
