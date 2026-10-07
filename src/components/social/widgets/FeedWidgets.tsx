'use client';

/**
 * The desktop feed's right-hand column.
 *
 * A wide screen gave the feed one column and ~600px of black either side of
 * it. This puts the space to work with what the feed already knows, and
 * which panels appear is the reader's call, because the one panel that used
 * to live here (trending tags) is not the one everybody wants.
 *
 * Desktop only, by construction: it is rendered inside an `xl:` branch. On a
 * phone this content is a second thing competing with the feed, which is
 * exactly what the filter sheet was built to avoid.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { useFeedWidgets } from '@/hooks/social/widgets/useFeedWidgets';
import FeedWidget from './FeedWidget';
import FeedWidgetsPicker from './FeedWidgetsPicker';

export default function FeedWidgets({
  notes,
  onOpenTag,
  onOpenProfile,
}: {
  notes: readonly NostrEvent[];
  onOpenTag?: (tag: string) => void;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const vm = useFeedWidgets();

  return (
    <aside className="w-72 shrink-0 space-y-3 py-3 pr-4" data-testid="feed-trending">
      {vm.selected.map((id) => (
        <FeedWidget key={id} id={id} notes={notes} onOpenTag={onOpenTag} onOpenProfile={onOpenProfile} />
      ))}
      <FeedWidgetsPicker options={vm.options} toggle={vm.toggle} />
    </aside>
  );
}
