'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  ensureSocialProfiles,
  getSocialProfile,
  subscribeSocialProfile,
  type SocialProfile,
} from '@/services/social/profiles';

/**
 * One author's profile, resolving in the background.
 *
 * Returns `null` until something is known, so callers keep their existing
 * npub fallback rather than flashing a placeholder name.
 *
 * Read straight from the shared profile store on every render, so a row
 * handed another author shows the new author (or nothing) from its first
 * render, never the previous one. It used to copy the profile into state and
 * reset it in an effect, which painted the old name under the new pubkey once.
 */
export function useSocialProfile(pubkey: string | null | undefined): SocialProfile | null {
  const subscribe = useCallback(
    (onChange: () => void) => (pubkey ? subscribeSocialProfile(pubkey, onChange) : () => {}),
    [pubkey],
  );
  const profile = useSyncExternalStore(
    subscribe,
    () => (pubkey ? getSocialProfile(pubkey) : null),
    () => null,
  );

  useEffect(() => {
    if (pubkey) void ensureSocialProfiles([pubkey]);
  }, [pubkey]);

  return profile;
}
