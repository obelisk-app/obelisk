'use client';

import { useChatStore } from '@/store/chat';
import { useUserMetadata } from '@/services/nostr-bridge';

export function MentionChip({ pubkey, displayName }: { pubkey: string; displayName: string }) {
  const openProfilePopup = useChatStore((s) => s.openProfilePopup);
  // `parseMentions` resolves names from the channel's member list alone, so
  // mentioning anyone who isn't a member of *this* channel fell back to a
  // short npub: the raw `@npub16dew…` in the message body. The bridge's
  // kind:0 cache normally knows them regardless, and subscribing here also
  // triggers `ensureUserMetadata`, so an unseen pubkey is fetched and the
  // chip fills in as soon as the profile lands.
  const meta = useUserMetadata(pubkey);
  const resolvedName = meta?.displayName || meta?.name || displayName;
  return (
    <button
      type="button"
      onClick={(event) => openProfilePopup(pubkey, { x: event.clientX, y: event.clientY })}
      // Same reason as the hashtag anchor in the markdown components: a
      // mention is one token, and the note body's inherited
      // `overflow-wrap: anywhere` would otherwise split a display name down
      // the middle.
      className="bg-lc-green/20 text-lc-green rounded px-1 py-0.5 text-sm font-medium hover:bg-lc-green/30 transition-colors cursor-pointer [overflow-wrap:normal] [word-break:normal]"
      title={pubkey}
      data-testid="mention-highlight"
    >
      @{resolvedName}
    </button>
  );
}
