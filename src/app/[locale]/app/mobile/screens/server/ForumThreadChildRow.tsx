'use client';

import { useMessages, type JsGroup } from '@/services/nostr-bridge';
import { ChannelRow } from './ChannelRow';

/**
 * A forum's thread under its expanded row, shown only once it has a message
 * (mirrors desktop's ForumChildGroupNode: empty or aborted threads stay
 * hidden so the inline expansion doesn't accumulate noise).
 */
export function ForumThreadChildRow({
  group,
  active,
  onClick,
}: {
  group: JsGroup;
  active: boolean;
  onClick: () => void;
}) {
  const messages = useMessages(group.id);
  if (messages.length === 0) return null;
  return <ChannelRow group={group} live={false} active={active} onClick={onClick} indent />;
}
