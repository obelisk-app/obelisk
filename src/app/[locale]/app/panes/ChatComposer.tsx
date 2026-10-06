'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { forwardRef, useEffect, useImperativeHandle, useRef, type InputHTMLAttributes } from 'react';
import { useUserMetadata as useProfile, type JsGroup, type JsMessage } from '@/services/nostr-bridge';
import { MentionText } from '@/components/chat/MentionText';
import { MESSAGE_INPUT_PROPS } from '@/utils/message-input-props';
import MessageMediaPicker from '@/components/chat/MessageMediaPicker';
import {
  AttachmentMenu,
  StickerIcon,
  VoiceNoteButton,
  VoiceNoteDraft,
} from '@/components/chat/ComposerActions';
import MentionAutocomplete from '@/components/chat/MentionAutocomplete';
import SlashCommandAutocomplete from '@/components/chat/SlashCommandAutocomplete';
import SlashCommandScaffold from '@/components/chat/SlashCommandScaffold';
import { useChannelComposer, type ComposerHandle } from '@/hooks/chat/useChannelComposer';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/Input';
import CloseButton from '@/components/ui/CloseButton';
import { CloseIcon } from '@/components/ui/icons';
import RemoteImage from '@/components/ui/RemoteImage';

/** `MESSAGE_INPUT_PROPS` is typed as every input attribute; `size` there is the HTML width hint, not Input's variant. */
const messageInputProps: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> = MESSAGE_INPUT_PROPS;

/**
 * The desktop composer skin over `useChannelComposer`. Its own component so
 * a keystroke re-renders the form, not the message list above it.
 */
export const ChatComposer = forwardRef<ComposerHandle, {
  groupId: string;
  group: JsGroup | null;
  messages: ReadonlyArray<JsMessage>;
  replyingTo: JsMessage | null;
  setReplyingTo: (message: JsMessage | null) => void;
  onOpenNewGame: () => void;
}>(function ChatComposer({ groupId, group, messages, replyingTo, setReplyingTo, onOpenNewGame }, ref) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const composer = useChannelComposer({ groupId, group, messages, replyingTo, setReplyingTo, inputRef, onOpenNewGame });
  const { onPickFiles } = composer;
  useImperativeHandle(ref, () => ({ pickFiles: (files) => { void onPickFiles(files); } }), [onPickFiles]);
  const emojiBtnRef = useRef<HTMLDivElement>(null);
  const { emojiOpen, setEmojiOpen } = composer;
  useEffect(() => {
    if (!emojiOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (emojiBtnRef.current && !emojiBtnRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [emojiOpen, setEmojiOpen]);

  return (
    <form onSubmit={(e) => void composer.send(e)} className="shrink-0 px-5 pt-3 pb-3">
      {replyingTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-t-md border border-b-0 border-lc-border bg-lc-card/60 px-3 py-1.5 text-xs text-lc-muted">
          <span className="truncate">
            {t('shell.desktop.composer.replyingTo')} <ReplyAuthorName pubkey={replyingTo.pubkey} />
            <span className="ml-2 truncate text-lc-muted"><MentionText content={replyingTo.content.slice(0, 80)} /></span>
          </span>
          <CloseButton size="sm" className="-my-1" onClick={() => setReplyingTo(null)} label={t('shell.desktop.composer.cancelReply')} />
        </div>
      )}
      {composer.sendError && (
        <p className="mb-2 break-words text-xs text-red-400" data-testid="composer-error">{composer.sendError}</p>
      )}
      {composer.activeSlashCommand && (
        <SlashCommandScaffold command={composer.activeSlashCommand} content={composer.draft} caret={composer.caret} />
      )}
      {(composer.pendingImageUrls.length > 0 || composer.uploading) && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-lc-border bg-lc-card/50 p-2">
          {composer.pendingImageUrls.map((url) => (
            <div key={url} className="group relative h-16 w-16 overflow-hidden rounded-lg bg-lc-black">
              <RemoteImage src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => composer.removeAttachmentUrl(url)}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] text-lc-white opacity-90 hover:bg-black"
                aria-label={t('shell.desktop.composer.removeAttachment')}
              >
                <CloseIcon size={12} strokeWidth={2.4} />
              </button>
            </div>
          ))}
          {composer.uploading && (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-lc-border text-[10px] uppercase tracking-wider text-lc-muted">
              …
            </div>
          )}
        </div>
      )}
      <div className="flex min-h-[3.5rem] items-center gap-1 rounded-xl border border-lc-border bg-lc-card px-2 focus-within:border-lc-green">
        {!composer.draftVoiceNote && (<>
        <AttachmentMenu
          disabled={composer.uploading}
          onFiles={(files) => void composer.onPickFiles(files)}
          onContact={composer.onContact}
          onNewSticker={() => composer.openPicker('sticker')}
        />
        <div ref={emojiBtnRef} className="relative">
          <button
            type="button"
            onClick={() => { if (composer.emojiOpen) composer.setEmojiOpen(false); else composer.openPicker('emoji'); }}
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
              onPick={(emoji, custom, kind) => {
                composer.onPickMedia(emoji, custom, kind);
                inputRef.current?.focus();
              }}
              onClose={() => composer.setEmojiOpen(false)}
            />
          )}
        </div>
        </>)}
        <div className="relative flex-1">
          {composer.slashQuery !== null && (composer.slashResults.length > 0 || (composer.slashFilter !== 'all' && composer.slashRail.length > 0)) && (
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
          {composer.mentionQuery !== null && composer.filteredMembers.length > 0 && (
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
            ref={inputRef}
            value={composer.draft}
            onChange={(e) => composer.onInput(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={(e) => composer.onKeyDown(e)}
            onSelect={(e) => {
              const el = e.currentTarget;
              composer.onSelect(el.value, el.selectionStart ?? el.value.length);
            }}
            onPaste={composer.onPaste}
            placeholder={t('shell.desktop.composer.placeholder', { name: group?.name ?? groupId.slice(0, 8) })}
            aria-label={t('shell.desktop.composer.placeholder', { name: group?.name ?? groupId.slice(0, 8) })}
            data-tour="composer"
            className={(composer.draftVoiceNote ? "hidden " : "") + "w-full bg-transparent text-sm text-lc-white outline-none placeholder:text-lc-muted disabled:opacity-50"}
          />
        </div>
        {composer.draft.trim() ? (
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

function ReplyAuthorName({ pubkey }: { pubkey: string }) {
  const meta = useProfile(pubkey);
  const name = displayNameFor(pubkey, meta);
  return <span className="font-semibold text-lc-white">{name}</span>;
}
