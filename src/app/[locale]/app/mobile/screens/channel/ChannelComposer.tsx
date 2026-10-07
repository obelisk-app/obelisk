'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { type JsGroup, type JsMessage } from '@/services/nostr-bridge';
import { MentionText } from '@/components/chat/mentions/MentionText';
import MessageMediaPicker from '@/components/chat/picker/MessageMediaPicker';
import { AttachmentMenu } from '@/components/chat/composer/AttachmentMenu';
import { VoiceNoteButton } from '@/components/chat/composer/VoiceNoteButton';
import { VoiceNoteDraft } from '@/components/chat/composer/VoiceNoteDraft';
import { type ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';
import { usePhoneChannelComposer } from '@/hooks/shell/mobile/screens/channel/usePhoneChannelComposer';
import { useTranslations } from 'next-intl';
import { MESSAGE_INPUT_PROPS } from '@/constants/chat/composer';
import { MobileMentionAutocomplete } from './MobileMentionAutocomplete';
import Input from '@/components/ui/forms/Input';
import EmojiSheet from '../../sheets/message/EmojiSheet';
import { ReplyAuthorName } from './ReplyAuthorName';
import { CloseIcon, SendIcon, StickerIcon } from '@/assets/icons';

/** `MESSAGE_INPUT_PROPS` is typed as every input attribute; `size` there is the HTML width hint, not Input's variant. */
const messageInputProps: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> = MESSAGE_INPUT_PROPS;

/**
 * The phone composer skin over `useChannelComposer`. Its own component so a
 * keystroke re-renders the composer, not the message list above it.
 */
export const ChannelComposer = forwardRef<ComposerHandle, {
  groupId: string;
  group: JsGroup | null;
  messages: ReadonlyArray<JsMessage>;
  replyingTo: JsMessage | null;
  setReplyingTo: (message: JsMessage | null) => void;
  onOpenNewGame: () => void;
}>(function ChannelComposer({ groupId, group, messages, replyingTo, setReplyingTo, onOpenNewGame }, ref) {
  const t = useTranslations();
  const composer = usePhoneChannelComposer({ groupId, group, messages, replyingTo, setReplyingTo, onOpenNewGame }, ref);

  return (
    <div className="composer">
      {replyingTo && (
        <div className="composer-reply" data-testid="mobile-reply-preview">
          <div className="composer-reply-info">
            <span className="composer-reply-label">
              {t('mobile.channel.replyingTo')} <ReplyAuthorName pubkey={replyingTo.pubkey} />
            </span>
            <span className="composer-reply-text"><MentionText content={replyingTo.content.slice(0, 80)} /></span>
          </div>
          <button
            type="button"
            className="composer-reply-close"
            onClick={() => setReplyingTo(null)}
            aria-label={t('mobile.channel.cancelReply')}
          >
            <CloseIcon size={null} />
          </button>
        </div>
      )}
      {composer.sendError && (
        <div
          role="alert"
          data-testid="mobile-composer-error"
          style={{ padding: '6px 14px', fontSize: 12, color: 'var(--presence-dnd)', wordBreak: 'break-word' }}
        >
          {composer.sendError}
        </div>
      )}
      {composer.mentionQuery !== null && composer.filteredMembers.length > 0 && (
        <MobileMentionAutocomplete
          members={composer.filteredMembers}
          selectedIndex={composer.mentionIndex}
          onSelect={composer.applyMention}
          onHover={composer.setMentionIndex}
        />
      )}
      <div className="composer-inner">
        {!composer.draftVoiceNote && (<>
        <AttachmentMenu
          disabled={composer.uploading}
          onFiles={(files) => void composer.onPickFiles(files)}
          onContact={composer.onContact}
          onNewSticker={() => composer.openPicker('sticker')}
        />
        <button
          type="button"
          className="composer-emoji"
          aria-label={t('mobile.composer.openPicker')}
          onClick={() => composer.openPicker('emoji')}
        >
          <StickerIcon size={null} className="h-5 w-5" />
        </button>
        </>)}
        {composer.draftVoiceNote && (
          <VoiceNoteDraft note={composer.draftVoiceNote} onDiscard={composer.discardVoiceNote} />
        )}
        <Input
          variant="bare"
          {...messageInputProps}
          ref={composer.inputRef}
          className={composer.draftVoiceNote ? "hidden" : "composer-input"}
          value={composer.draft}
          onChange={composer.onInputChange}
          onSelect={composer.onInputSelect}
          onPaste={composer.onPaste}
          placeholder={t('mobile.channel.messagePlaceholder', { name: group?.name ?? t('common.channel') })}
          aria-label={t('mobile.channel.messagePlaceholder', { name: group?.name ?? t('common.channel') })}
          onKeyDown={(e) => composer.onKeyDown(e, true)}
        />
        <div className="composer-btns">
          {composer.draft.trim() ? (
            <button className="composer-send" onClick={() => void composer.send()} aria-label={t("common.send")}>
              <SendIcon size={null} strokeWidth={1} />
            </button>
          ) : (
            <VoiceNoteButton disabled={composer.uploading} onRecorded={(file, duration) => void composer.onVoiceRecorded(file, duration)} />
          )}
        </div>
      </div>
      {composer.emojiOpen && (
        <EmojiSheet onClose={() => composer.setEmojiOpen(false)}>
          <MessageMediaPicker
            variant="sheet"
            initialTab={composer.pickerTab}
            customEmojis={composer.pickerEmojis}
            onPick={composer.onPickMedia}
            onClose={() => composer.setEmojiOpen(false)}
          />
        </EmojiSheet>
      )}
    </div>
  );
});
