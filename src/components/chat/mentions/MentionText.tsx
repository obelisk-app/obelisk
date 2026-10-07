import { parseMentions } from '@/utils/message-text/mentions';
import { MentionSegmentView } from './MentionSegmentView';

/**
 * Render a content string with `nostr:npub1…` mention tokens replaced by
 * `@DisplayName` text. Used in places that need a plain-text preview of a
 * message (notification cards, reply previews) so mentions don't surface as
 * raw npubs.
 */
export function MentionText({ content }: { content: string }) {
  return <>{parseMentions(content, []).map((seg, i) => <MentionSegmentView key={i} segment={seg} />)}</>;
}
