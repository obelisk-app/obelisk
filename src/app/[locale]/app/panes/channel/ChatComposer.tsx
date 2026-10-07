'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { MESSAGE_INPUT_PROPS } from '@/utils/chat/composer/message-input-props';
import MessageMediaPicker from '@/components/chat/picker/MessageMediaPicker';
import {
  AttachmentMenu,
  StickerIcon,
  VoiceNoteButton,
  VoiceNoteDraft,
} from '@/components/chat/composer/ComposerActions';
import MentionAutocomplete from '@/components/chat/mentions/MentionAutocomplete';
import SlashCommandAutocomplete from '@/components/chat/slash/SlashCommandAutocomplete';
import SlashCommandScaffold from '@/components/chat/slash/SlashCommandScaffold';
import type { ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';
import { useChatComposer, type ChatComposerProps } from '@/hooks/shell/panes/channel/useChatComposer';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/forms/Input';
import { ComposerAttachments } from './ComposerAttachments';
import { ComposerReplyBar } from './ComposerReplyBar';

/** `MESSAGE_INPUT_PROPS` is typed as every input attribute; `size` there is the HTML width hint, not Input's variant. */
const messageInputProps: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> = MESSAGE_INPUT_PROPS;

/**
 * The desktop composer skin over `useChannelComposer` (through
 * `useChatComposer`). Its own component so a keystroke re-renders the form,
 * not the message list above it.
 */
export const ChatComposer = forwardRef<ComposerHandle, ChatComposerProps>(function ChatComposer(props, ref) {
  const t = useTranslations();
  const vm = useChatComposer(props, ref);
  const { composer } = vm;

  return (
    <form onSubmit={(e) => void composer.send(e)} className="shrink-0 px-5 pt-3 pb-3">
      {props.replyingTo && <ComposerReplyBar replyingTo={props.replyingTo} onCancel={() => props.setReplyingTo(null)} />}
      {composer.sendError && (
        <p className="mb-2 break-words text-xs text-red-400" data-testid="composer-error">{composer.sendError}</p>
      )}
      {composer.activeSlashCommand && (
        <SlashCommandScaffold command={composer.activeSlashCommand} content={composer.draft} caret={composer.caret} />
      )}
      {vm.showAttachments && (
        <ComposerAttachments urls={composer.pendingImageUrls} uploading={composer.uploading} onRemove={composer.removeAttachmentUrl} />
      )}
      <div className="flex min-h-[3.5rem] items-center gap-1 rounded-xl border border-lc-border bg-lc-card px-2 focus-within:border-lc-green">
        {!composer.draftVoiceNote && (<>
        <AttachmentMenu
          disabled={composer.uploading}
          onFiles={(files) => void composer.onPickFiles(files)}
          onContact={composer.onContact}
          onNewSticker={() => composer.openPicker('sticker')}
        />
        <div ref={vm.emojiBtnRef} className="relative">
          <button
            type="button"
            onClick={vm.toggleEmoji}
            className="flex h-9 w-9 items-center justify-center rounded-full text-lc-muted hover:bg-white/5 hover:text-lc-white"
            aria-label={t('mobile.composer.openPicker')}
            aria-haspopup="dialog"
            aria-expanded={composer.emojiOpen}
          >
            <StickerIcon />
          </button>
          {composer.emojiOpen && (
            <MessageMediaPicker
              initialTab={composer.pickerTab}
              customEmojis={composer.pickerEmojis}
              onPick={vm.pickMedia}
              onClose={() => composer.setEmojiOpen(false)}
            />
          )}
        </div>
        </>)}
        <div className="relative flex-1">
          {vm.showSlash && (
            <SlashCommandAutocomplete
              sections={composer.slashSections}
              rail={composer.slashRail}
              filter={composer.slashFilter}
              onFilter={composer.setSlashFilter}
              botProfiles={composer.botProfiles}
              selectedIndex={composer.slashIndex}
              onSelect={composer.insertSlashCommand}
              onClose={composer.closeSlash}
            />
          )}
          {vm.showMentions && (
            <MentionAutocomplete
              members={composer.filteredMembers}
              selectedIndex={composer.mentionIndex}
              onSelect={composer.applyMention}
              onHover={composer.setMentionIndex}
              onClose={composer.closeMentions}
            />
          )}
          {composer.draftVoiceNote && (
            <VoiceNoteDraft note={composer.draftVoiceNote} onDiscard={composer.discardVoiceNote} />
          )}
          <Input
            variant="bare"
            {...messageInputProps}
            ref={vm.inputRef}
            value={composer.draft}
            onChange={vm.onChange}
            onKeyDown={(e) => composer.onKeyDown(e)}
            onSelect={vm.onSelect}
            onPaste={composer.onPaste}
            placeholder={t('shell.desktop.composer.placeholder', { name: vm.channelName })}
            aria-label={t('shell.desktop.composer.placeholder', { name: vm.channelName })}
            data-tour="composer"
            className={(composer.draftVoiceNote ? "hidden " : "") + "w-full bg-transparent text-sm text-lc-white outline-none placeholder:text-lc-muted disabled:opacity-50"}
          />
        </div>
        {vm.canSend ? (
          <button
            type="submit"
            disabled={composer.uploading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lc-green text-lc-black disabled:opacity-30"
            aria-label={t("common.send")}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 14-7-7 14-2-5-5-2z" /></svg>
          </button>
        ) : (
          <VoiceNoteButton disabled={composer.uploading} onRecorded={(file, duration) => void composer.onVoiceRecorded(file, duration)} />
        )}
      </div>
    </form>
  );
});
