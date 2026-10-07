'use client';

import { useMemo } from 'react';
import { useModerationStore } from '@/store/moderation';
import { moderationEntries } from '@/utils/settings/moderation-entries';

/** Everyone muted or blocked on this device, as rows to review. */
export function useMutedAndBlocked() {
  const muted = useModerationStore((state) => state.mutedPubkeys);
  const blocked = useModerationStore((state) => state.blockedPubkeys);
  return useMemo(() => moderationEntries(muted, blocked), [muted, blocked]);
}
