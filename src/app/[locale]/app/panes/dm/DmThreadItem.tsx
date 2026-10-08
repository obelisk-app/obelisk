'use client';

import Text from '@/components/ui/layout/Text';
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
        <Text variant="label" size="10" tone="muted" weight="semibold" className="shrink-0">{item.label}</Text>
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
