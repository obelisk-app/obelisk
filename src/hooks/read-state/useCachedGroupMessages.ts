'use client';

import { useSyncExternalStore } from 'react';
import type { JsMessage } from '@/services/nostr-bridge';
import { getCachedGroupMessages, subscribeCachedGroupMessages } from '@/services/read-state/cached-group-messages';

/**
 * `groupId`'s loaded messages, or `undefined` when there are none (or no
 * group). Each row re-renders only when its own channel's array changes; see
 * `src/services/read-state/cached-group-messages.ts`.
 */
export function useCachedGroupMessages(groupId: string | null | undefined): ReadonlyArray<JsMessage> | undefined {
  return useSyncExternalStore(
    subscribeCachedGroupMessages,
    () => getCachedGroupMessages(groupId),
    () => undefined,
  );
}
