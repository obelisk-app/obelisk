'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { peekNip05, subscribeNip05, verifyNip05, type Nip05State } from '@/services/nip05-verify';

/**
 * React view of the state for one (pubkey, identifier) pair.
 *
 * `'peek'` (the default) never fetches: it is for rows that render by the
 * dozen and where the reader has not asked about this person. `'verify'`
 * starts a check when nothing is cached: for the popover the reader opened.
 * The server snapshot is `unchecked`, so SSR never paints a badge.
 */
export function useNip05Status(
  pubkey: string | null | undefined,
  nip05: string | null | undefined,
  mode: 'peek' | 'verify' = 'peek',
): Nip05State {
  const state = useSyncExternalStore(
    subscribeNip05,
    () => peekNip05(pubkey, nip05),
    () => 'unchecked' as const,
  );

  useEffect(() => {
    if (mode !== 'verify' || !pubkey || !nip05 || state !== 'unchecked') return;
    void verifyNip05(pubkey, nip05);
  }, [mode, pubkey, nip05, state]);

  return state;
}
