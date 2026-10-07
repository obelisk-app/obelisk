'use client';

import { dmTextSegments } from '@/utils/chat/dm/dm-text-segments';
import { DmTextSegmentView } from './DmTextSegmentView';

/** DM text with links and custom emoji; the text is cut up in `dmTextSegments`. */
export function TextWithEmoji({ text, emojis, linkClass }: { text: string; emojis: Record<string, string>; linkClass: string }) {
  return <>{dmTextSegments(text, emojis).map((s) => <DmTextSegmentView key={s.key} segment={s} linkClass={linkClass} />)}</>;
}
