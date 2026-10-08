import { nostrActions } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';
import type { FormSpec } from '@/constants/common/form';
import { allFilled } from '@/utils/common/form-rules';
import { emojiTagsForContent } from '@/utils/media/tags/custom-emoji-tags';

export type NewThreadValues = { title: string; body: string; tagIds: ReadonlyArray<string> };

/** The forum's access flags; a publication inherits them. */
export interface NewThreadAccess {
  readonly isPublic: boolean;
  readonly isHidden: boolean;
  readonly isRestricted: boolean;
  readonly isOpen: boolean;
}

export interface NewThreadTarget {
  forumGroupId: string;
  access: NewThreadAccess;
  /** The title to start with (the search the person typed, when they created from it). */
  initialTitle: string;
  /** Whether the signer can sign now (`useSignerReady`) and whose key it is (`useMyPubkey`). */
  signerReady: boolean;
  myPubkey: string | null;
  onCreated: (childId: string) => void;
}

/**
 * Creating a publication inside a forum (the desktop modal and the phone
 * sheet). Creates the child NIP-29 group pinned to the forum via `parent`,
 * stamped with the picked topic ids and the forum's access flags, then posts
 * the body as its first kind 9 (the forum hides empty threads, so this is the
 * moment it appears), with custom-emoji tags so `:shortcode:` renders.
 */
export function newThreadForm(target: NewThreadTarget): FormSpec<NewThreadValues, string> {
  const { forumGroupId, access } = target;
  return {
    initial: () => ({ title: target.initialTitle, body: '', tagIds: [] }),
    ready: (values) => target.signerReady && target.myPubkey !== null && allFilled(values.title, values.body),
    submit: async (values) => {
      const childId = await nostrActions.createGroup({
        name: values.title.trim(),
        about: undefined,
        isPublic: access.isPublic,
        isHidden: access.isHidden,
        isRestricted: access.isRestricted,
        isOpen: access.isOpen,
        parent: forumGroupId,
        topics: values.tagIds,
      });
      const text = values.body.trim();
      await nostrActions.sendMessage(childId, text, null, emojiTagsForContent(text, useChatStore.getState().serverEmojis));
      return childId;
    },
    failure: 'chat.forum.createFailed',
    onSuccess: (childId) => target.onCreated(childId),
  };
}
