import { useMentionPreview } from '@/hooks/chat/mentions/useMentionPreview';
import { Fragment } from 'react';
import { MentionName } from './MentionName';

/**
 * Render a content string with `nostr:npub1…` mention tokens replaced by
 * `@DisplayName` text. Used in places that need a plain-text preview of a
 * message (notification cards, reply previews) so mentions don't surface as
 * raw npubs.
 */
export function MentionText({ content, max = 140 }: { content: string; max?: number }) {
  const segments = useMentionPreview(content, max);
  return <>{segments.map((segment, i) => (
    <Fragment key={i}>
      {segment.type === 'text' ? segment.text : <MentionName pubkey={segment.pubkey} />}
    </Fragment>
  ))}</>;
}
