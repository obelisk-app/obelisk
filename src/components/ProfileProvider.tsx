'use client';

/**
 * ProfileProvider — single source of truth for `kind 0` profile metadata
 * across the whole app.
 *
 * Architectural shape:
 *   - One in-memory `Record<pubkey, ProfileEntry | null>` lives in the
 *     provider's state.
 *   - The provider owns at most ONE relay subscription per pubkey via
 *     `subscribeProfile` from `@/lib/dm/profile-cache`. The first
 *     `useProfile(pk)` triggers a subscribe; later calls are no-ops.
 *   - Updates from `subscribeProfile` (cache hydrate or newer kind 0
 *     arrival) are batched into one `setState` per animation frame to
 *     avoid render storms when the inbox walker drops 100+ events at
 *     once.
 *   - Consumers call `useProfile(pk)` and receive the latest entry. The
 *     hook subscribes to context, so components re-render when *their*
 *     partner's entry changes — entries for other partners updating
 *     don't force a re-render thanks to React's referential bailout
 *     (we mutate via spread, but each entry's ref is stable across
 *     unrelated updates).
 *
 * Why a context provider on top of `subscribeProfile`?
 *   - One sub per pubkey across the whole tree (sidebar, chat header,
 *     message bubbles, thread list) — no duplicated relay traffic.
 *   - Decrypt-once / fetch-once: every component sees the same value
 *     and observes the same updates without each maintaining its own
 *     subscribe lifecycle.
 *   - Tearing down on `me` change is one place, not N.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { subscribeProfile, type ProfileEntry } from '@/lib/dm/profile-cache';

type ProfileMap = Record<string, ProfileEntry | null>;

interface ProfileContextValue {
  /** Current snapshot of the map. Stable reference until any entry changes. */
  profiles: ProfileMap;
  /** Mount a subscription for `pubkey` if one isn't already active. Idempotent.
   *  Returns the synchronously-known cached entry (or null if cold). */
  ensureSubscribed: (pubkey: string) => ProfileEntry | null;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({
  me,
  children,
}: {
  me: string | null | undefined;
  children: ReactNode;
}) {
  const [profiles, setProfiles] = useState<ProfileMap>({});
  // pubkey → teardown handle. Lifetime tied to the provider mount.
  const mountedRef = useRef<Map<string, () => void>>(new Map());
  // Coalesce setProfiles calls within one tick — N partners arriving in a
  // burst (the inbox walker is the canonical case) collapse to one render.
  const pendingRef = useRef<ProfileMap | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    flushTimerRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setProfiles((prev) => ({ ...prev, ...pending }));
  }, []);

  const queue = useCallback((pubkey: string, entry: ProfileEntry | null) => {
    if (!pendingRef.current) pendingRef.current = {};
    pendingRef.current[pubkey] = entry;
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flush, 16);
  }, [flush]);

  const ensureSubscribed = useCallback((pubkey: string): ProfileEntry | null => {
    if (!me || !pubkey) return null;
    if (mountedRef.current.has(pubkey)) return profiles[pubkey] ?? null;

    let initial: ProfileEntry | null = null;
    const dispose = subscribeProfile(me, pubkey, {
      onCache: (entry) => {
        initial = entry;
        queue(pubkey, entry);
      },
      onUpdate: (entry) => queue(pubkey, entry),
    });
    mountedRef.current.set(pubkey, dispose);
    return initial;
  }, [me, profiles, queue]);

  // Identity changes wipe every sub — different account, different cache key.
  useEffect(() => {
    return () => {
      for (const dispose of mountedRef.current.values()) dispose();
      mountedRef.current.clear();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingRef.current = null;
    };
  }, [me]);

  const value = useMemo<ProfileContextValue>(
    () => ({ profiles, ensureSubscribed }),
    [profiles, ensureSubscribed],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

/**
 * Subscribe (idempotently) to a partner's profile and return the latest
 * known entry. Re-renders on update.
 *
 * Returns `null` outside the provider, before the first cache hydrate, or
 * when `pubkey` is null/undefined.
 */
export function useProfile(pubkey: string | null | undefined): ProfileEntry | null {
  const ctx = useContext(ProfileContext);
  // Mount the sub on the first call. The effect runs after the synchronous
  // return below, so the first paint may show null — that's fine, the
  // subsequent state update from `ensureSubscribed`'s onCache will trigger
  // a re-render with the localStorage-hydrated value.
  useEffect(() => {
    if (!ctx || !pubkey) return;
    ctx.ensureSubscribed(pubkey);
  }, [ctx, pubkey]);
  if (!ctx || !pubkey) return null;
  return ctx.profiles[pubkey] ?? null;
}

/**
 * Bulk read: returns the entire profile map. Useful for components that
 * already iterate a list (sidebar, member list) — calling `useProfile` per
 * item is fine but more verbose. Each list item re-renders only when ITS
 * entry's reference changes.
 */
export function useProfileMap(): ProfileMap {
  const ctx = useContext(ProfileContext);
  return ctx?.profiles ?? {};
}
