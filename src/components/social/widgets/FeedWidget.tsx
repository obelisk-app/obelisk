'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import type { FeedWidgetId } from '@/services/social/widgets';
import TrendingWidget from './TrendingWidget';
import WhoToFollowWidget from './WhoToFollowWidget';
import FollowedTagsWidget from './FollowedTagsWidget';
import RelaysWidget from './RelaysWidget';

/** One side-column panel, picked by its id. */
export default function FeedWidget({
  id,
  notes,
  onOpenTag,
  onOpenProfile,
}: {
  id: FeedWidgetId;
  notes: readonly NostrEvent[];
  onOpenTag?: (tag: string) => void;
  onOpenProfile?: (pubkey: string) => void;
}) {
  switch (id) {
    case 'trending':
      return <TrendingWidget notes={notes} onOpenTag={onOpenTag} />;
    case 'who-to-follow':
      return <WhoToFollowWidget notes={notes} onOpenProfile={onOpenProfile} />;
    case 'followed-tags':
      return <FollowedTagsWidget onOpenTag={onOpenTag} />;
    case 'relays':
      return <RelaysWidget />;
    default:
      return null;
  }
}
