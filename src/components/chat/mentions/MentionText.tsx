import { parseMentions } from '@/utils/message-text/mentions';
import { Fragment } from 'react';
import { MentionName } from './MentionName';

/**
 * Render a content string with `nostr:npub1…` mention tokens replaced by
 * `@DisplayName` text. Used in places that need a plain-text preview of a
 * message (notification cards, reply previews) so mentions don't surface as
 * raw npubs.
 */
export function MentionText({ content }: { content: string }) {
  return <>{parseMentions(content, []).map((segment, i) => (
    <Fragment key={i}>
      {segment.type === 'text' ? segment.text : <MentionName pubkey={segment.pubkey} />}
    </Fragment>
  ))}</>;
}
