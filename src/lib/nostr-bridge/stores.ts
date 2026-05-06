/**
 * React hooks backed by the bridge's StateFlow subscriptions.
 *
 * Each hook subscribes on mount, replays the latest value, and
 * unsubscribes on unmount.
 */
import { useEffect, useMemo, useState } from 'react';
import { getBridge } from './client';
import { wotEngine } from '@/lib/wot/engine';
import { useWotEnabled } from '@/lib/wot';
import type { JsGroup, JsMessage, JsUserMetadata, JsReaction, JsDirectMessage, RelayAccessState } from './types';

function normalizeRelayUrl(u: string): string {
  return u.replace(/\/+$/, '').toLowerCase();
}

function useSubscription<T>(
  subscribe: (
    bridge: Awaited<ReturnType<typeof getBridge>>,
    cb: (value: T) => void,
  ) => () => void,
  initial: NoInfer<T>,
  deps: ReadonlyArray<unknown> = [],
): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    getBridge().then((bridge) => {
      if (cancelled) return;
      unsub = subscribe(bridge, setValue);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function useIsLoggedIn(): boolean {
  return useSubscription((b, cb) => b.subscribeIsLoggedIn(cb), false);
}

const SESSION_STORAGE_KEY = 'obelisk-dex/session';
const LEGACY_SESSION_STORAGE_KEY = 'obeliskord/session';

function hasStoredSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!(
      window.localStorage.getItem(SESSION_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY)
    );
  } catch {
    return false;
  }
}

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

/**
 * `true` while a stored session is being rehydrated on cold load. The bridge
 * has parsed credentials out of localStorage and is awaiting `connect()`'s
 * relay handshake, but {@link useIsLoggedIn} stays `false` until that
 * resolves (see `docs/auth-and-data-loading.md` §3 for the contract).
 *
 * UI consumers use this to suppress the login modal during that window —
 * without it, users navigating from the landing page back to `/app` see a
 * login modal even though their NIP-07 / nsec / bunker session is reconnecting
 * silently in the background.
 *
 * Returns `false` during SSR and the first client render to avoid a hydration
 * mismatch; on every subsequent render we read localStorage synchronously so
 * logout (which clears the entry before flipping `isLoggedIn`) doesn't briefly
 * latch into a stale "still rehydrating" state.
 */
export function useIsRehydrating(): boolean {
  const isLoggedIn = useIsLoggedIn();
  const mounted = useMounted();
  if (!mounted) return false;
  if (isLoggedIn) return false;
  return hasStoredSession();
}

export function useConnectionState(): string {
  return useSubscription((b, cb) => b.subscribeConnectionState(cb), 'Disconnected');
}

export function useCurrentRelayUrl(): string {
  return useSubscription((b, cb) => b.subscribeCurrentRelayUrl(cb), '');
}

/**
 * NIP-42 / whitelist access state for a specific relay (defaults to the
 * currently-active one). `'unknown'` until the relay either delivers an
 * event/EOSE (→ `'ok'`) or sends a CLOSED reason we can classify.
 */
export function useRelayAccess(url?: string | null): RelayAccessState {
  const current = useCurrentRelayUrl();
  const target = (url ?? current) || '';
  const map = useSubscription<Readonly<Record<string, RelayAccessState>>>(
    (b, cb) => b.subscribeRelayAccess(cb),
    {},
  );
  if (!target) return 'unknown';
  return map[normalizeRelayUrl(target)] ?? 'unknown';
}

/**
 * The local user's pubkey hex, or `null` when logged out. Single source of
 * truth for "who am I" — replaces the legacy `useAuthStore(s => s.profile.pubkey)`.
 */
export function useMyPubkey(): string | null {
  return useSubscription<string | null>((b, cb) => b.subscribeMyPubkey(cb), null);
}

/**
 * `true` once the active NIP-46 bunker signer has handshaken with its
 * bunker relay. For nsec/NIP-07 sessions this stays `false` (no external
 * signer to wait for). UI components that need a generic "ready to publish"
 * gate should use {@link useSignerReady} instead.
 */
export function useBunkerSignerReady(): boolean {
  return useSubscription((b, cb) => b.subscribeBunkerSignerReady(cb), false);
}

/**
 * The active session's login method, or `null` when logged out.
 */
export function useMyLoginMethod(): 'nsec' | 'nip07' | 'bunker' | null {
  return useSubscription<'nsec' | 'nip07' | 'bunker' | null>(
    (b, cb) => b.subscribeMyLoginMethod(cb),
    null,
  );
}

/**
 * Generic "the bridge can sign and publish events for the active user".
 * `true` for nsec/NIP-07 once logged in; for bunker it additionally requires
 * the BunkerSigner to have handshaken with its bunker relay.
 */
export function useSignerReady(): boolean {
  const loggedIn = useIsLoggedIn();
  const method = useMyLoginMethod();
  const bunkerReady = useBunkerSignerReady();
  if (!loggedIn) return false;
  if (method === 'bunker') return bunkerReady;
  return method !== null;
}

export function useConfiguredRelays(): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>((b, cb) => b.subscribeConfiguredRelays(cb), []);
}

export function useGroups(): ReadonlyArray<JsGroup> {
  const all = useSubscription<ReadonlyArray<JsGroup>>((b, cb) => b.subscribeGroups(cb), []);
  const creators = useSubscription<Readonly<Record<string, string>>>(
    (b, cb) => b.subscribeGroupCreators(cb),
    {},
  );
  const adminsByGroup = useSubscription<Readonly<Record<string, ReadonlyArray<string>>>>(
    (b, cb) => b.subscribeAdminsByGroup(cb),
    {},
  );
  const membersByGroup = useSubscription<Readonly<Record<string, ReadonlyArray<string>>>>(
    (b, cb) => b.subscribeMembersByGroup(cb),
    {},
  );
  const myPubkey = useMyPubkey();
  const wotEnabled = useWotEnabled();
  // Re-render whenever a verdict resolves so groups whose admins just got a
  // verdict appear/disappear from the rail.
  const [, force] = useState(0);
  useEffect(() => {
    if (!wotEnabled) return;
    return wotEngine.on('verdicts-changed', () => force((n) => n + 1));
  }, [wotEnabled]);
  return useMemo(() => {
    if (!wotEnabled) return all;
    // Strict policy: a group is shown iff one of these holds:
    //   - I created / am admin of / am member of the group (always-mine)
    //   - any of {creator, admins, members} has a resolved-allow verdict
    // Otherwise hidden — including groups where no principal is known yet,
    // since on relay-default group lists those are the spam channels the
    // user is trying to remove. The bridge's authors-scoped 9007 sub plus
    // per-group admin/member subs converge fast for legitimate groups.
    return all.filter((g) => {
      const creator = creators[g.id];
      const admins = adminsByGroup[g.id] ?? [];
      const members = membersByGroup[g.id] ?? [];
      if (myPubkey) {
        if (creator === myPubkey) return true;
        if (admins.includes(myPubkey)) return true;
        if (members.includes(myPubkey)) return true;
      }
      const principals = creator ? [creator, ...admins, ...members] : [...admins, ...members];
      let anyAllow = false;
      for (const pk of principals) {
        if (wotEngine.getDistance(pk) !== null) { anyAllow = true; break; }
      }
      if (anyAllow) return true;
      // Warm verdicts so unknowns get resolved; the rail re-renders on
      // verdicts-changed if any principal eventually resolves to allow.
      for (const pk of principals) wotEngine.markUnknown(pk);
      return false;
    });
  }, [all, creators, adminsByGroup, membersByGroup, myPubkey, wotEnabled]);
}

export function useMessages(groupId: string | null): ReadonlyArray<JsMessage> {
  // Mute / WoT filtering happens at ingest now (see wotEngine.isAllowed in
  // client.ts subscribeWatched.onevent + the verdict-deny pruner). If a
  // message is in the store, it's allowed.
  return useSubscription<ReadonlyArray<JsMessage>>(
    (b, cb) => (groupId ? b.subscribeMessages(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useUserMetadata(pubkey: string | null): JsUserMetadata | null {
  return useSubscription<JsUserMetadata | null>(
    (b, cb) => (pubkey ? b.subscribeUserMetadata(pubkey, cb) : () => {}),
    null,
    [pubkey],
  );
}

export function useReactions(
  groupId: string | null,
): Readonly<Record<string, ReadonlyArray<JsReaction>>> {
  return useSubscription<Readonly<Record<string, ReadonlyArray<JsReaction>>>>(
    (b, cb) => (groupId ? b.subscribeReactions(groupId, cb) : () => {}),
    {},
    [groupId],
  );
}

export function useChildrenByParent(): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription<Readonly<Record<string, ReadonlyArray<string>>>>((b, cb) => b.subscribeChildrenByParent(cb), {});
}

export function useDirectMessages(): Readonly<Record<string, ReadonlyArray<JsDirectMessage>>> {
  // Mute / WoT filtering happens at ingest; muted peers are already pruned
  // from the bridge store via the WoT engine's verdict-deny pruner.
  return useSubscription<Readonly<Record<string, ReadonlyArray<JsDirectMessage>>>>(
    (b, cb) => b.subscribeDirectMessages(cb),
    {},
  );
}

export function useAdmins(groupId: string | null): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>(
    (b, cb) => (groupId ? b.subscribeAdmins(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useAdminsByGroup(): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription((b, cb) => b.subscribeAdminsByGroup(cb), {});
}

export function useMembers(groupId: string | null): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>(
    (b, cb) => (groupId ? b.subscribeMembers(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useMembersByGroup(): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription((b, cb) => b.subscribeMembersByGroup(cb), {});
}

export function useGroupCreators(): Readonly<Record<string, string>> {
  return useSubscription((b, cb) => b.subscribeGroupCreators(cb), {});
}

/**
 * Pubkey hex of the kind 9007 author for `groupId`, or `null` until the relay
 * has delivered the create-group event. Used by settings/admin paths to
 * decide whether the local user is the creator and should one-shot claim
 * admin via {@link nostrActions.claimCreatorAdmin}.
 */
export function useGroupCreator(groupId: string | null): string | null {
  const all = useSubscription<Readonly<Record<string, string>>>(
    (b, cb) => b.subscribeGroupCreators(cb),
    {},
  );
  if (!groupId) return null;
  return all[groupId] ?? null;
}

export function useMyFollows(): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>((b, cb) => b.subscribeMyFollows(cb), []);
}

/**
 * NIP-51 kind 10000 mute list for the local user. `useMessages` and
 * `useDirectMessages` already apply this filter; use this hook directly when
 * rendering UI that needs to know whether a specific pubkey is muted (e.g.
 * the profile popover's mute/unmute toggle).
 */
export function useMyMutes(): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>((b, cb) => b.subscribeMyMutes(cb), []);
}
