import { useQuickZap } from '@/hooks/chat/zaps/useQuickZap';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { nostrActions, useAdmins, useMembers, useRelayAccess, type JsGroup, type JsMessage } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { resolveDraftMentions, type DraftMention } from '@/utils/message-text/mentions';
import type { CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import type { MessageSticker } from '@/utils/media/tags/sticker-tags';
import type { MessageVoiceNote } from '@/utils/media/tags/voice-note-tags';
import { parseZapCommand } from '@/services/wallet/parse-zap-command';
import { zapCommandErrorKey } from '@/utils/chat/slash/zap-command-error';
import { useMessageZapStore } from '@/store/chat/message-zap';
import { outgoingTags } from '@/utils/chat/composer/draft-text';
import { errorText } from '@/utils/errors/error-text';

/** The draft state `send` reads and clears. */
export interface ComposerDraftState {
  isCurrent?: () => boolean;
  clearSubmitted?: () => boolean;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  setSendError: Dispatch<SetStateAction<string | null>>;
  draftMentions: DraftMention[];
  setDraftMentions: Dispatch<SetStateAction<DraftMention[]>>;
  serverEmojis: CustomEmojiMap;
  draftCustomEmojis: CustomEmojiMap;
  setDraftCustomEmojis: Dispatch<SetStateAction<CustomEmojiMap>>;
  draftSticker: MessageSticker | null;
  setDraftSticker: Dispatch<SetStateAction<MessageSticker | null>>;
  draftVoiceNote: MessageVoiceNote | null;
  setDraftVoiceNote: Dispatch<SetStateAction<MessageVoiceNote | null>>;
}

export interface ComposerSendOptions {
  groupId: string;
  group: JsGroup | null;
  relay: string;
  messages: ReadonlyArray<JsMessage>;
  replyingTo: JsMessage | null;
  setReplyingTo: (message: JsMessage | null) => void;
  onOpenNewGame: () => void;
  state: ComposerDraftState;
}

/**
 * The composer's `send`: the two frontend-only commands (`/zap`, `/play`),
 * the NIP-29 join an open group needs before the first message, and the
 * publish itself with mentions resolved to `nostr:npub1...` and the custom
 * emoji, sticker and voice-note tags attached.
 */
export function useComposerSend({
  groupId,
  group,
  relay,
  messages,
  replyingTo,
  setReplyingTo,
  onOpenNewGame,
  state,
}: ComposerSendOptions): (event?: FormEvent) => Promise<void> {
  const t = useTranslations();
  const myPubkey = useMyPubkey();
  const quickZap = useQuickZap();
  const relayAccess = useRelayAccess(relay || null);
  const admins = useAdmins(groupId);
  const memberPubkeys = useMembers(groupId);

  return async function send(e?: FormEvent) {
    e?.preventDefault();
    const content = state.draft.trim();
    if (!content || state.isCurrent?.() === false) return;

    // /zap [user] [amount], frontend-only:
    //   /zap                -> reply target (or last channel msg from someone else)
    //   /zap 100            -> same target, with amount preset
    //   /zap <npub|hex|@name> [amount] -> that channel member
    if (/^\/zap(\s|$)/i.test(content)) {
      const parsed = parseZapCommand(resolveDraftMentions(content, state.draftMentions), groupId, messages, myPubkey, replyingTo);
      if (!parsed.ok) {
        state.setSendError(t(zapCommandErrorKey(parsed.error), { name: parsed.token ?? '' }));
        return;
      }
      if (parsed.immediate) {
        const paid = await quickZap(parsed.target, parsed.target.defaultAmountSats!, parsed.comment);
        if (paid && state.isCurrent?.() !== false) {
          state.setSendError(null);
          state.setDraft((draft) => draft === content ? '' : draft);
          setReplyingTo(null);
        }
        return;
      }
      useMessageZapStore.getState().open(parsed.target);
      state.setDraft('');
      setReplyingTo(null);
      return;
    }

    // /play opens the table picker. Frontend-only like /zap: the table is
    // created by NewGameModal (kind 2390), and the chat message it posts is
    // just the `[[game:<id>]]` card pointing at it.
    if (/^\/play(\s|$)/.test(content)) {
      onOpenNewGame();
      state.setDraft('');
      setReplyingTo(null);
      return;
    }

    state.setSendError(null);
    const replyToCopy = replyingTo ? { id: replyingTo.id, pubkey: replyingTo.pubkey } : null;
    // Open groups use the NIP-29 join request before their first message.
    // Await it so browser extensions never receive two signature requests
    // at once.
    if (
      myPubkey
      && relayAccess === 'ok'
      && group?.isOpen
      && !memberPubkeys.includes(myPubkey)
      && !admins.includes(myPubkey)
    ) {
      try {
        await nostrActions.joinGroup(groupId);
      } catch (err) {
        state.setSendError(errorText(t, err, 'chat.composer.joinFailed'));
        return;
      }
    }

    // Enqueue before clearing: the bridge can reject a deleted channel before
    // inserting an optimistic message. Keep its draft and show the reason.
    if (state.isCurrent?.() === false) return;
    const wire = resolveDraftMentions(content, state.draftMentions);
    const tags = outgoingTags(wire, state);
    try {
      await nostrActions.sendMessage(groupId, wire, replyToCopy, tags);
    } catch (err) {
      if (state.isCurrent?.() !== false) state.setSendError(errorText(t, err, 'errors.codes.publish-rejected'));
      return;
    }
    if (state.clearSubmitted) {
      if (state.clearSubmitted()) setReplyingTo(null);
    } else {
      state.setDraft((current) => current === state.draft ? '' : current);
      state.setDraftCustomEmojis((current) => current === state.draftCustomEmojis ? {} : current);
      state.setDraftSticker((current) => current === state.draftSticker ? null : current);
      state.setDraftVoiceNote((current) => current === state.draftVoiceNote ? null : current);
      state.setDraftMentions((current) => current === state.draftMentions ? [] : current);
      setReplyingTo(null);
    }

  };
}
