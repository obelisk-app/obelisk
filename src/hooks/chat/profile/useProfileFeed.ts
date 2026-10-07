'use client';

import { useMemo, useState } from 'react';
import { filterProfileFeed, mediaUrls, type ProfileFeedTab } from '@/services/social/profile-feed';
import { useFeed } from '@/hooks/social/feed/useFeed';
import type { MediaItem } from '@/services/social/feed-media';

/**
 * The profile's notes, the selected tab, and the media tiles for the media
 * tab. No `key=` remount: the feed hook keys its own cache, so switching
 * profiles or relay sets reuses whatever is already cached instead of
 * blanking the list.
 */
export function useProfileFeed(pubkey: string, relays: readonly string[]) {
  const [tab, setTab] = useState<ProfileFeedTab>('posts');
  const source = useMemo(() => ({ kind: 'profile' as const, pubkey }), [pubkey]);
  const state = useFeed(source, relays);

  const visibleNotes = useMemo(
    () => filterProfileFeed(state.notes, tab),
    [state.notes, tab],
  );

  const media = useMemo<MediaItem[]>(() => visibleNotes.flatMap((note) => {
    const urls = mediaUrls(note);
    // `multiple` marks a note that carried a set, the way a carousel is
    // badged in an explore grid; otherwise four tiles from one post look
    // like four unrelated ones.
    return urls.map((url) => ({ key: `${note.id}:${url}`, url, multiple: urls.length > 1 }));
  }), [visibleNotes]);

  return { tab, setTab, state, visibleNotes, media };
}
