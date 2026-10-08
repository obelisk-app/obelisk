'use client';

import { useEffect } from 'react';
import { useIsLoggedIn } from '@/hooks/session/useSession';
import { initDmCalls, useDmCallStore } from '@/store/call/dm-call';

/**
 * Listen for DM calls while logged in.
 *
 * Mounted by `LazyDmCallLayer`, which AppGate mounts above either shell, rather than by
 * the call layer it wraps: that layer is its own download, and an invite
 * that arrived before it landed used to reach nobody. The listener needs
 * only the call store, which rings without the media stack.
 */
export function useDmCallListener(): void {
  const loggedIn = useIsLoggedIn();
  useEffect(() => {
    if (!loggedIn) return;
    let off: (() => void) | null = null;
    let cancelled = false;
    void initDmCalls().then((u) => { if (cancelled) u(); else off = u; });
    return () => {
      cancelled = true;
      off?.();
      // Logging out or switching account ends whatever call was going on.
      useDmCallStore.getState().hangup();
    };
  }, [loggedIn]);
}
