'use client';

import { findZapPreset } from '@/utils/wallet/zap-presets';
import { useQuickZap } from '@/hooks/chat/zaps/useQuickZap';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { useMessageAuthor } from './useMessageAuthor';
import { displayNameFor } from '@/utils/identity/display-name';
import { useCallback, useMemo } from 'react';
import { nostrActions } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';
import { emojiTagsForContent, mergeCustomEmojiMaps, type CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import { groupReactions } from '@/utils/message-text/emoji-shortcodes';
import { confirmDialog } from '@/services/common/confirm-dialog';
import type { ModerationLabels } from '@/utils/chat/message/moderation-labels';

export interface MessageReactionInput {
  readonly zapMarker?: boolean;
  readonly id: string;
  readonly pubkey: string;
  readonly emoji: string;
  readonly customEmojis?: Readonly<Record<string, string>>;
}

export type GroupedReaction = ReturnType<typeof groupReactions>[number];

export interface MessageReactions {
  /** Reactions collapsed per emoji, with `mine` / `myReactionId` / `reactionIds` resolved. */
  readonly grouped: ReadonlyArray<GroupedReaction>;
  /** Emojis the current user already sent on this message. */
  readonly myReactedEmojis: ReadonlySet<string>;
  /**
   * Tap on a reaction pill or a picker emoji. Own
   * `reactionId`: retract it. Already reacted with this emoji: no-op.
   * Otherwise publish a kind 7 with the custom-emoji tags it needs.
   */
  readonly toggle: (
    emoji: string,
    customEmojis?: CustomEmojiMap,
    reactionId?: string | null,
  ) => Promise<void>;
}

/**
 * Reaction state and the toggle rule for one message. `MessageRow`
 * (desktop) and `ChannelMessage` (phone) each had this three-way branch
 * inline; desktop fired and forgot, mobile caught and logged. One
 * implementation now: failures are awaited and logged, never left as an
 * unhandled rejection.
 */
export function useMessageReactions(
  msg: { readonly id: string; readonly pubkey: string },
  groupId: string,
  reactions: ReadonlyArray<MessageReactionInput>,
  myPubkey: string | null,
): MessageReactions {
  const quickZap = useQuickZap();
  const { zapPresets } = usePreferences();
  const meta = useMessageAuthor(msg.pubkey);
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  const grouped = useMemo(
    () => groupReactions(reactions.filter((r) => !r.zapMarker).map((r) => r.emoji.replace(/\uFE0F/g, '') === '⚡' ? { ...r, emoji: '⚡' } : r), myPubkey, serverEmojis),
    [reactions, myPubkey, serverEmojis],
  );
  const myReactedEmojis = useMemo(
    () => new Set(grouped.filter((reaction) => reaction.mine).map((reaction) => reaction.emoji)),
    [grouped],
  );

  const toggle = useCallback(async (
    emoji: string,
    customEmojis?: CustomEmojiMap,
    reactionId?: string | null,
  ) => {
    try {
      const preset = findZapPreset(zapPresets, emoji);
      if (preset) {
        await quickZap({ messageId: msg.id, recipientPubkey: msg.pubkey, groupId,
          recipientLud16: meta?.lud16, displayName: displayNameFor(msg.pubkey, meta) }, preset.amountSats);
        return;
      }
      if (reactionId) {
        await nostrActions.removeReaction(groupId, reactionId);
        return;
      }
      if (myReactedEmojis.has(emoji)) return;
      const emojiTags = emojiTagsForContent(emoji, mergeCustomEmojiMaps(serverEmojis, customEmojis));
      await nostrActions.sendReaction(msg.id, msg.pubkey, emoji, groupId, emojiTags);
    } catch (err) {
      console.warn('[reactions] toggle failed', err);
    }
  }, [groupId, msg.id, msg.pubkey, myReactedEmojis, serverEmojis, quickZap, zapPresets, meta]);

  return { grouped, myReactedEmojis, toggle };
}

export interface MessageModeration {
  /** Admin, or the author of the message. */
  readonly canDelete: boolean;
  /** Confirm, then kind 9005 (admin) or NIP-09 kind 5 (own). Resolves true when something was deleted. */
  readonly deleteMessage: () => Promise<boolean>;
  /** Re-publish a failed optimistic message (no-op without a client tag). */
  readonly retry: () => void;
  /** Drop a failed optimistic message (no-op without a client tag). */
  readonly dismissFailed: () => void;
}

/**
 * Delete / retry / dismiss for one message, shared by the desktop row menu,
 * the phone row and the phone action sheet. The confirm copy is passed in
 * because the hook has no `t`; both shells already use the same keys.
 */
export function useMessageModeration(
  msg: { readonly id: string; readonly clientTag?: string | null },
  groupId: string | null | undefined,
  canModerate: boolean,
  canDeleteOwn: boolean,
  labels: ModerationLabels,
): MessageModeration {
  const canDelete = !!groupId && (canModerate || canDeleteOwn);

  const deleteMessage = useCallback(async () => {
    if (!groupId || !canDelete) return false;
    const ok = await confirmDialog({
      title: canModerate ? labels.confirmDeleteEveryone : labels.confirmDeleteOwn,
      message: canModerate ? labels.confirmDeleteEveryoneBody : labels.confirmDeleteOwnBody,
      confirmLabel: labels.confirmLabel,
    });
    if (!ok) return false;
    if (canModerate) await nostrActions.deleteGroupEvent(groupId, msg.id);
    else await nostrActions.removeMessage(groupId, msg.id);
    return true;
  }, [canDelete, canModerate, groupId, labels, msg.id]);

  const retry = useCallback(() => {
    if (!groupId || !msg.clientTag) return;
    void nostrActions.retryMessage(groupId, msg.clientTag);
  }, [groupId, msg.clientTag]);

  const dismissFailed = useCallback(() => {
    if (!groupId || !msg.clientTag) return;
    void nostrActions.cancelPendingMessage(groupId, msg.clientTag);
  }, [groupId, msg.clientTag]);

  return { canDelete, deleteMessage, retry, dismissFailed };
}
