'use client';

import { formatPubkey } from '@nostr-wot/data';
import { useUserMetadata as useProfile, type JsSearchHit } from '@/services/nostr-bridge';
import { useFormat } from '@/i18n/useFormat';
import { displayNameFor } from '@/utils/identity/display-name';

/**
 * One message hit: its author's name, its channel and its time.
 * `formatPubkey` gives `npub1abc…xyz`; a raw hex slice is not an identity a
 * human can recognise or copy.
 */
export function useSearchResultRow(msg: JsSearchHit, groupName: string | null) {
  const { formatDateTime } = useFormat();
  const meta = useProfile(msg.pubkey);
  return {
    name: displayNameFor(msg.pubkey, meta),
    channel: groupName ?? (msg.groupId ? formatPubkey(msg.groupId) : '?'),
    time: formatDateTime(msg.createdAt),
  };
}
