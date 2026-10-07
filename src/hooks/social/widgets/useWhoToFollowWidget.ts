import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useMyFollows, useMyPubkey } from '@/services/nostr-bridge';
import { suggestedAuthors } from '@/services/social/feed-people';

/** How many people the side column suggests. */
export const WHO_TO_FOLLOW_LIMIT = 5;

/**
 * The who-to-follow widget's view model: authors in the loaded window that
 * the reader does not follow yet (and not the reader themselves).
 */
export function useWhoToFollowWidget(notes: readonly NostrEvent[]) {
  const myPubkey = useMyPubkey();
  const follows = useMyFollows();
  const people = useMemo(
    () => suggestedAuthors(notes, {
      limit: WHO_TO_FOLLOW_LIMIT,
      exclude: myPubkey ? [...follows, myPubkey] : follows,
    }),
    [notes, follows, myPubkey],
  );
  return { people };
}
