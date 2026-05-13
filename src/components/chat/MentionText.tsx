import React from 'react';
import { useUserMetadata } from '@/lib/nostr-bridge';
import { parseMentions, shortNpub } from '@/lib/mentions';

function MentionName({ pubkey }: { pubkey: string }) {
  const meta = useUserMetadata(pubkey);
  const name = meta?.displayName || meta?.name || shortNpub(pubkey);
  return <>@{name}</>;
}

/**
 * Render a content string with `nostr:npub1…` mention tokens replaced by
 * `@DisplayName` text. Used in places that need a plain-text preview of a
 * message (notification cards, reply previews) so mentions don't surface as
 * raw npubs.
 */
export function MentionText({ content }: { content: string }) {
  const segments = parseMentions(content, []);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text'
          ? <React.Fragment key={i}>{seg.text}</React.Fragment>
          : <MentionName key={i} pubkey={seg.pubkey} />,
      )}
    </>
  );
}
