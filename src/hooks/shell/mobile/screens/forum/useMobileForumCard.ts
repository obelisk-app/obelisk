import { useMemo } from 'react';
import { displayNameFor } from '@/utils/identity/display-name';
import {
  useMessages,
  useMessagesStatus,
  useUserMetadata,
  type JsForumTag,
  type JsGroup,
} from '@/services/nostr-bridge';
import { resolveTopics } from '@/utils/chat/forum/forum-threads';

/**
 * One phone forum card's data: the opening post and the last one, who wrote
 * them, the thread's known tags, and whether the thread is confirmed empty
 * (hidden, like on desktop) or still loading (shown as a skeleton). The
 * bridge owns the retry ladder behind `messagesStatus`.
 */
export function useMobileForumCard(group: JsGroup, forumTags: ReadonlyArray<JsForumTag>) {
  const messages = useMessages(group.id);
  const messagesStatus = useMessagesStatus(group.id);
  const op = messages[0] ?? null;
  const lastMsg = messages[messages.length - 1] ?? null;
  const opMeta = useUserMetadata(op?.pubkey ?? null);
  const lastMeta = useUserMetadata(lastMsg?.pubkey ?? null);
  const tags = useMemo(() => resolveTopics(group.topics, forumTags), [group.topics, forumTags]);
  const loaded = !!op && !!lastMsg;
  return {
    /** No opening post yet: hide the card once the relay confirmed it empty, else show a skeleton. */
    state: loaded ? 'ready' as const : messagesStatus === 'empty-confirmed' ? 'hidden' as const : 'loading' as const,
    op,
    messageCount: messages.length,
    opMeta,
    opName: op ? displayNameFor(op.pubkey, opMeta) : '',
    lastName: lastMsg ? displayNameFor(lastMsg.pubkey, lastMeta) : '',
    tags,
    title: group.name ?? group.id.slice(0, 8),
    initialsSeed: group.name || group.id.slice(0, 2).toUpperCase(),
  };
}
