'use client';

import { useImperativeHandle, useRef, type ChangeEvent, type ForwardedRef, type SyntheticEvent } from 'react';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';
import type { MediaPickerTab } from '@/components/chat/picker/MessageMediaPicker';
import type { PickedCustomEmoji } from '@/components/chat/picker/EmojiPicker';
import { useChannelComposer, type ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';
import { useDismiss } from '@/hooks/common/useDismiss';

export interface ChatComposerProps {
  groupId: string;
  group: JsGroup | null;
  messages: ReadonlyArray<JsMessage>;
  replyingTo: JsMessage | null;
  setReplyingTo: (message: JsMessage | null) => void;
  onOpenNewGame: () => void;
}

/**
 * The desktop composer's view model over the shared `useChannelComposer`:
 * the input and picker refs, `pickFiles` for files dropped on the pane, the
 * picker closing on a click outside it, and the input's handlers.
 */
export function useChatComposer(props: ChatComposerProps, ref: ForwardedRef<ComposerHandle>) {
  const { groupId, group } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiBtnRef = useRef<HTMLDivElement>(null);
  const composer = useChannelComposer({ ...props, inputRef });
  const { onPickFiles, emojiOpen, setEmojiOpen } = composer;
  useImperativeHandle(ref, () => ({ pickFiles: (files) => { void onPickFiles(files); } }), [onPickFiles]);
  // The picker closes on a press outside its button and panel; Escape is the picker's own.
  useDismiss({ refs: [emojiBtnRef], onDismiss: () => setEmojiOpen(false), enabled: emojiOpen, escape: 'ignore' });

  return {
    composer,
    inputRef,
    emojiBtnRef,
    /** The channel's name in the placeholder, or the start of its id while it has none. */
    channelName: group?.name ?? groupId.slice(0, 8),
    showAttachments: composer.pendingImageUrls.length > 0 || composer.uploading,
    showSlash: composer.slashQuery !== null
      && (composer.slashResults.length > 0 || (composer.slashFilter !== 'all' && composer.slashRail.length > 0)),
    showMentions: composer.mentionQuery !== null && composer.filteredMembers.length > 0,
    /** A draft with text: the mic turns into a send button. */
    canSend: composer.draft.trim().length > 0,
    toggleEmoji: () => {
      if (emojiOpen) setEmojiOpen(false);
      else composer.openPicker('emoji');
    },
    /** Insert the pick, then hand the focus back to the input. */
    pickMedia: (emoji: string, custom?: PickedCustomEmoji, kind?: MediaPickerTab) => {
      composer.onPickMedia(emoji, custom, kind);
      inputRef.current?.focus();
    },
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      composer.onInput(e.target.value, e.target.selectionStart ?? e.target.value.length),
    onSelect: (e: SyntheticEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      composer.onSelect(el.value, el.selectionStart ?? el.value.length);
    },
  };
}
