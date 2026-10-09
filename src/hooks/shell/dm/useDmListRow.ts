'use client';

import { useTranslations } from 'next-intl';
import type { JsDirectMessage } from '@/services/nostr-bridge';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { useDMUnreadCount } from '@/hooks/read-state/useUnreadCounts';
import { displayNameFor } from '@/utils/identity/display-name';
import { dmPreview, unreadBadgeLabel } from '@/utils/shell/desktop/dm-list';

/**
 * One conversation row. `useAuthor`, not the bridge's `useUserMetadata`:
 * the bridge only queries the group and profile-lookup relays, which hold
 * kind 0 for people in your NIP-29 rooms. A DM peer is usually someone from
 * the wider network who has no reason to have published there, which is why
 * every row once showed an npub and a letter avatar while the same person
 * resolved fine in the feed. `useAuthor` merges both tiers field by field.
 */
export function useDmListRow(pubkey: string, last: JsDirectMessage | undefined, youPrefix: string) {
  const t = useTranslations();
  const meta = useAuthor(pubkey);
  const unread = useDMUnreadCount(pubkey);
  return {
    name: displayNameFor(pubkey, meta),
    picture: meta?.picture ?? null,
    preview: dmPreview(last, youPrefix) ?? t('dm.lock.preview'),
    unread: unread > 0,
    unreadLabel: unreadBadgeLabel(unread),
  };
}
