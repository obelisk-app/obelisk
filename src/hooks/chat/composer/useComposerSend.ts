import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { nostrActions, useAdmins, useMembers, useMyPubkey, useRelayAccess, type JsGroup, type JsMessage } from '@/services/nostr-bridge';
import { resolveDraftMentions, type DraftMention } from '@/utils/message-text/mentions';
import type { CustomEmojiMap } from '@/utils/media-tags/custom-emoji-tags';
import type { MessageSticker } from '@/utils/media-tags/sticker-tags';
import type { MessageVoiceNote } from '@/utils/media-tags/voice-note-tags';
import { parseZapCommand } from '@/services/wallet/parse-zap-command';
import { useMessageZapStore } from '@/store/messageZap';
import { outgoingTags } from './draft-text';

/** The draft state `send` reads and clears. */
export interface ComposerDraftState {
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
  const myPubkey = useMyPubkey();
  const relayAccess = useRelayAccess(relay || null);
  const admins = useAdmins(groupId);
  const memberPubkeys = useMembers(groupId);

  return async function send(e?: FormEvent) {
    e?.preventDefault();
    const content = state.draft.trim();
    if (!content) return;

    // /zap [user] [amount], frontend-only:
    //   /zap                -> reply target (or last channel msg from someone else)
    //   /zap 100            -> same target, with amount preset
    //   /zap <npub|hex|@name> [amount] -> that channel member
    if (/^\/zap(\s|$)/.test(content)) {
      const parsed = parseZapCommand(content, groupId, messages, myPubkey, replyingTo);
      if (!parsed.ok) {
        state.setSendError(parsed.error);
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
        state.setSendError(err instanceof Error ? err.message : 'Could not join this channel');
        return;
      }
    }

    // Clear only after the prerequisite signature succeeds, preserving the
    // draft if the user rejects the join request in their extension.
    state.setDraft('');
    state.setDraftCustomEmojis({});
    state.setDraftSticker(null);
    state.setDraftVoiceNote(null);
    setReplyingTo(null);

    // The composer holds mentions as readable `@Name`; the wire format is
    // `nostr:npub1...`. Resolve here, past the frontend-only commands and
    // before anything downstream reads the text, or the event carries no
    // `nostr:` token, so no `#p` tag and no mention notification.
    const wire = resolveDraftMentions(content, state.draftMentions);
    state.setDraftMentions([]);

    // Fire-and-forget: the bridge inserts the pending placeholder
    // synchronously and surfaces send failures via the bubble's `failed`
    // flag (with retry).
    const tags = outgoingTags(wire, state);
    nostrActions.sendMessage(groupId, wire, replyToCopy, tags).catch((err) => {
      console.error('send failed', err);
    });
  };
}
