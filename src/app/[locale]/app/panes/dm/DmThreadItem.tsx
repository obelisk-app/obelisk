'use client';

import type { DmThread, DmThreadItem as Item } from '@/hooks/chat/dm/thread/useDmThread';
import { DmBubble } from './DmBubble';

/**
 * One entry of the desktop DM thread: a message, or the divider shown
 * whenever the calendar day changes. Without the dividers the panel was one
 * unbroken column, and a conversation held over three weeks read as a
 * single sitting.
 */
export function DmThreadItem({ item, thread }: { item: Item; thread: DmThread }) {
  if (item.type === 'divider') {
    return (
      <div className="my-3 flex items-center gap-3" data-testid="dm-day-divider">
        <span className="h-px flex-1 bg-lc-border" />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">{item.label}</span>
        <span className="h-px flex-1 bg-lc-border" />
      </div>
    );
  }
  return (
    <DmBubble
      msg={item.msg}
      mark={thread.marks[item.index] ?? null}
      onRetry={thread.retry}
      onDismiss={thread.dismiss}
    />
  );
}
