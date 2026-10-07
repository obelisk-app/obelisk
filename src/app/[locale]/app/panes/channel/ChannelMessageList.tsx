'use client';

import type { JsGroup, JsMessage, JsReaction } from '@/services/nostr-bridge';
import type { MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import { MessageRow } from '../message/MessageRow';
import { ChannelEmpty } from './ChannelEmpty';
import { isGroupedWith, type ChannelEmptyStage } from '@/utils/chat/timeline/channel-list-state';

/** Stable empty list so a message without reactions keeps the same prop identity. */
const EMPTY_REACTIONS: never[] = [];

type Props = {
  groupId: string;
  group: JsGroup | null | undefined;
  messages: ReadonlyArray<JsMessage>;
  /** Reply parents resolved once per batch, so a row's `parent` prop is stable. */
  messagesById: ReadonlyMap<string, JsMessage>;
  reactions: Readonly<Record<string, ReadonlyArray<JsReaction>>>;
  zapTotals: ReadonlyMap<string, MessageZapTotal>;
  isAdmin: boolean;
  /** Must be stable (a state setter): every memoized row receives it. */
  onReply: (m: JsMessage) => void;
  emptyStage: ChannelEmptyStage;
};

/**
 * The messages, or the empty state that explains their absence.
 *
 * Every prop handed to `MessageRow` is identity-stable across a keystroke in
 * the composer, so typing does not re-render the visible rows.
 */
export function ChannelMessageList({
  groupId, group, messages, messagesById, reactions, zapTotals, isAdmin, onReply, emptyStage,
}: Props) {
  if (messages.length === 0) return <ChannelEmpty groupId={groupId} group={group} stage={emptyStage} />;
  return (
    <>
      {messages.map((m, i) => (
        <MessageRow
          key={m.id}
          msg={m}
          parent={m.replyToId ? messagesById.get(m.replyToId) ?? null : null}
          reactions={reactions[m.id] ?? EMPTY_REACTIONS}
          zapTotal={zapTotals.get(m.id) ?? null}
          groupId={groupId}
          grouped={isGroupedWith(messages[i - 1], m)}
          isAdmin={isAdmin}
          onReply={onReply}
        />
      ))}
    </>
  );
}
