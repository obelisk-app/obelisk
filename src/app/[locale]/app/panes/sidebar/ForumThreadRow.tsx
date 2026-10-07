'use client';

import type { ReactNode } from 'react';
import { useMessages } from '@/services/nostr-bridge';

/**
 * One thread under a publication in the sidebar, on the publication's
 * L-rail (`.lc-thread-row`). A thread shows only once it has a message, so
 * empty or aborted threads don't pile up in the sidebar.
 */
export function ForumThreadRow({ groupId, children }: { groupId: string; children: ReactNode }) {
  const messages = useMessages(groupId);
  if (messages.length === 0) return null;
  return <div className="lc-thread-row">{children}</div>;
}
