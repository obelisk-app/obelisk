/**
 * Posting a new game table's card into the channel: the marker message the
 * table picker hands back. A failure is logged and otherwise ignored, the
 * table itself already exists.
 */
import { nostrActions } from '@/services/nostr-bridge';

export function postGameMarker(groupId: string, marker: string): void {
  nostrActions.sendMessage(groupId, marker, null, []).catch((err) => {
    console.warn('[games] posting the table card failed', err);
  });
}
