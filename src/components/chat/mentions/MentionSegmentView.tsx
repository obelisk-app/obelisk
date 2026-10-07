'use client';

import type { MentionSegment } from '@/utils/message-text/mentions';
import { MentionName } from './MentionName';

/** One piece of a plain-text preview: text as it is, a mention as `@name`. */
export function MentionSegmentView({ segment }: { segment: MentionSegment }) {
  if (segment.type === 'text') return <>{segment.text}</>;
  return <MentionName pubkey={segment.pubkey} />;
}
