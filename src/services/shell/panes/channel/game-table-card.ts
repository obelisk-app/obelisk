import { nostrActions } from '@/services/nostr-bridge';

/**
 * Post a new game's table card to the channel. Fire and forget: a failure is
 * logged, never thrown at the dialog that asked for it. The tables
 * themselves live on the channel's relay as their own kind 2390 log (see
 * src/lib/games/protocol.ts); the card is how a channel finds them.
 */
export function postGameTableCard(groupId: string, marker: string): void {
  nostrActions.sendMessage(groupId, marker, null, []).catch((err) => {
    console.error('[games] posting the table card failed', err);
  });
}
