import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useMyFollows, useMyPubkey } from '@/services/nostr-bridge';
import { suggestedAuthors } from '@/services/social/feed-people';
import { WHO_TO_FOLLOW_LIMIT } from '@/constants/social/widgets';

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
