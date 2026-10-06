'use client';

import { useState } from 'react';
import { clearAllClientCacheExceptSession } from '@/services/cache-clear';

/**
 * "Clear local data": confirm, wipe every client cache except the session
 * and preferences, then reload so every store rebuilds from scratch.
 */
export function useClearLocalData() {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const onConfirm = () => {
    setClearing(true);
    const removed = clearAllClientCacheExceptSession();
    // Tiny pause so the modal copy reads naturally before the reload.
    setTimeout(() => {
      // Reload from server to rebuild every store from scratch. We keep the
      // session + preferences so the user lands back in the same place.
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      // Defensive: if the reload didn't fire (e.g. test harness), reset state.
      setClearing(false);
      setConfirming(false);
      void removed;
    }, 200);
  };

  return { confirming, setConfirming, clearing, onConfirm };
}
