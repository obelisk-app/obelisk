'use client';

import { useDirectMessages } from '@/services/nostr-bridge';

/** Keeps the DM subscription open for the whole shell, whatever view is up. */
export function DirectMessageSubscriptionAnchor() {
  useDirectMessages();
  return null;
}
