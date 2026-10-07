'use client';

import type { JsMessage, JsReaction } from '@/services/nostr-bridge';
import type { TimelineItem } from '@/utils/chat/timeline/channel-timeline';
import { reactionsFor, replyParentOf } from '@/utils/shell/mobile/channel-timeline';
import { ChannelMessage } from './ChannelMessage';

/** One timeline entry: a day divider, or a message tile with its reply parent and reactions. */
export function ChannelTimelineItem({
  item, messagesById, reactions, myPubkey, isAdmin, groupId, onLongPress, onAvatar,
}: {
  item: TimelineItem;
  messagesById: ReadonlyMap<string, JsMessage>;
  reactions: Readonly<Record<string, ReadonlyArray<JsReaction>>>;
  myPubkey: string | null;
  isAdmin: boolean;
  groupId: string;
  onLongPress: (m: JsMessage) => void;
  onAvatar: (pubkey: string) => void;
}) {
  if (item.type === 'divider') return <div className="day-divider">{item.label}</div>;
  return (
    <ChannelMessage
      msg={item.msg}
      parent={replyParentOf(item.msg, messagesById)}
      myPubkey={myPubkey}
      isAdmin={isAdmin}
      groupId={groupId}
      reactions={reactionsFor(reactions, item.msg.id)}
      onLongPress={onLongPress}
      onAvatar={onAvatar}
    />
  );
}
