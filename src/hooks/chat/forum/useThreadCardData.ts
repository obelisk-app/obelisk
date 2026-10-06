'use client';

import { useMemo } from 'react';
import {
  useMessages,
  useMessagesStatus,
  useUserMetadata,
  type JsForumTag,
  type JsGroup,
} from '@/services/nostr-bridge';
import { resolveTopics } from '@/components/chat/forum/thread-card-utils';

/**
 * What a publication card shows: its messages and load status, the opening
 * post and the latest one, the opener's profile, and its resolved tags.
 * The profile hook always runs: `null` keeps the subscription inert until
 * the first message lands.
 */
export function useThreadCardData(thread: JsGroup, forumTags: ReadonlyArray<JsForumTag>) {
  const messages = useMessages(thread.id);
  const messagesStatus = useMessagesStatus(thread.id);
  const op = messages[0] ?? null;
  const lastMsg = messages[messages.length - 1] ?? null;
  const opMeta = useUserMetadata(op?.pubkey ?? null);
  const tags = useMemo(() => resolveTopics(thread.topics, forumTags), [thread.topics, forumTags]);
  return { messages, messagesStatus, op, lastMsg, opMeta, tags };
}
