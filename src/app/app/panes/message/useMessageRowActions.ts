'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  nostrActions,
  useCurrentRelayUrl,
  useMyMutes,
  useMyPubkey,
  type JsMessage,
  type JsUserMetadata,
} from '@/services/nostr-bridge';
import { displayNameFor } from '@/utils/identity/display-name';
import {
  getRecentEmojisSnapshot,
  getServerRecentEmojisSnapshot,
  pushRecentEmoji,
  quickReactions,
  subscribeRecentEmojis,
  type RecentEmoji,
} from '@/services/recent-emojis';
import type { CustomEmojiMap } from '@/utils/media-tags/custom-emoji-tags';
import { useToastStore } from '@/store/toast';
import { useMessageZapStore } from '@/store/messageZap';
import {
  moderationLabelsFrom,
  useMessageModeration,
  useMessageReactions,
  type MessageReactionInput,
} from '@/hooks/chat/useMessageActions';
import { useTranslation } from '@/i18n/context';
import { messageLink } from './message-link';

/**
 * Everything a desktop message row can do to its message: react (from
 * recents, the picker or a pill), zap, mute the author, copy text or link,
 * delete, retry. Reactions and moderation are the shared
 * `useMessageActions` hooks the phone shell's sheet uses too.
 */
export function useMessageRowActions({
  msg, groupId, isAdmin, reactions, meta,
}: {
  msg: JsMessage;
  groupId: string;
  isAdmin: boolean;
  reactions: ReadonlyArray<MessageReactionInput>;
  meta: JsUserMetadata | null | undefined;
}) {
  const { t } = useTranslation();
  const relay = useCurrentRelayUrl();
  // Quick reactions = your most recent picks (shared snapshot across rows).
  const recentEmojis = useSyncExternalStore(subscribeRecentEmojis, getRecentEmojisSnapshot, getServerRecentEmojisSnapshot);
  const quick4 = useMemo(() => quickReactions(recentEmojis, 4), [recentEmojis]);
  const myPubkey = useMyPubkey();
  const isOwn = msg.pubkey === myPubkey;
  const myMutes = useMyMutes();
  const isMuted = myMutes.includes(msg.pubkey);
  const toggleMute = async () => {
    try {
      await nostrActions.setMuted(msg.pubkey, !isMuted);
    } catch (e) {
      useToastStore.getState().pushToast({
        title: t('desktop.message.muteFailed'),
        body: e instanceof Error ? e.message : String(e),
      });
    }
  };
  const { grouped: counts, myReactedEmojis, toggle: toggleReaction } = useMessageReactions(msg, groupId, reactions, myPubkey, isAdmin);
  const onReactionClick = (
    emoji: string,
    customEmojis?: CustomEmojiMap,
    reactionId?: string | null,
    reactionIds?: ReadonlyArray<string>,
  ) => { void toggleReaction(emoji, customEmojis, reactionId, reactionIds); };
  const reactWith = (e: RecentEmoji) => {
    const name = e.char.replace(/^:|:$/g, '');
    onReactionClick(e.char, e.url ? { [name]: e.url } : undefined);
    pushRecentEmoji(e.char, e.url ? { url: e.url, packAddress: e.packAddress } : undefined);
  };
  const openZap = useMessageZapStore((s) => s.open);
  const onZapClick = () => {
    if (isOwn) {
      useToastStore.getState().pushToast({ title: `⚠️ ${t('desktop.message.cannotZapSelf')}`, body: '' });
      return;
    }
    openZap({
      messageId: msg.id,
      recipientPubkey: msg.pubkey,
      recipientLud16: meta?.lud16 ?? null,
      displayName: displayNameFor(msg.pubkey, meta),
      groupId,
    });
  };
  const copyText = () => {
    void Promise.resolve(navigator.clipboard?.writeText(msg.content)).catch(() => {});
    useToastStore.getState().pushToast({ title: t('desktop.message.textCopied'), body: '' });
  };
  const copyLink = () => {
    if (typeof window === 'undefined') return;
    void Promise.resolve(navigator.clipboard?.writeText(messageLink(window.location.href, groupId, msg.id, relay))).catch(() => {});
    useToastStore.getState().pushToast({ title: t('desktop.message.linkCopied'), body: '' });
  };
  const moderation = useMessageModeration(msg, groupId, isAdmin, isOwn, moderationLabelsFrom(t));

  return {
    isOwn,
    isMuted,
    quick4,
    quick3: quick4.slice(0, 3),
    counts,
    myReactedEmojis,
    onReactionClick,
    reactWith,
    onZapClick,
    toggleMute,
    copyText,
    copyLink,
    canDelete: moderation.canDelete,
    deleteMessage: moderation.deleteMessage,
    retry: moderation.retry,
    dismissFailed: moderation.dismissFailed,
  };
}

export type MessageRowActions = ReturnType<typeof useMessageRowActions>;
