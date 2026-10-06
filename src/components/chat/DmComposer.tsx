'use client';

/**
 * Mount with `key={peer}`: a draft and anything pending belong to the
 * conversation they were started in, and remounting is how they are dropped.
 *
 * The message bar for a DM thread: the same bar a channel has (attachments,
 * voice notes, emoji / GIF / sticker picker, drop and paste), with one
 * difference that matters: every file and voice note is encrypted in the
 * browser before it is uploaded.
 *
 * Group composers put a Blossom URL straight into the draft, because the URL
 * *is* the attachment. Here the URL points at ciphertext and renders as
 * nothing, so uploads are held as pending `JsDmFile`s beside the draft and
 * each one is sent as its own NIP-17 kind-15 file message. Previews read from
 * a local object URL of the original file, which never leaves the tab.
 *
 * Stickers, GIFs and custom emoji are references to public pack / GIF URLs,
 * exactly as in a channel: what is private is that *you sent them to this
 * person*, and that rides inside the gift wrap like the text does.
 *
 * NIP-04 threads have no file message, so the attach and voice controls are
 * hidden there rather than failing on send.
 */

import { useRef, type InputHTMLAttributes } from 'react';
import { useTranslation } from '@/i18n/context';
import { MESSAGE_INPUT_PROPS } from '@/utils/message-input-props';
import Input from '@/components/ui/Input';
import MessageMediaPicker from './MessageMediaPicker';
import { FileDropZone } from './ComposerActions';
import { useDmComposer } from './dm-composer/useDmComposer';
import { DmPendingFiles } from './dm-composer/DmPendingFiles';
import { DmVoiceDraft } from './dm-composer/DmVoiceDraft';
import { DmComposerActions, DmSendControl } from './dm-composer/DmComposerControls';

/** `MESSAGE_INPUT_PROPS` is typed as every input attribute; `size` there is the HTML width hint, not Input's variant. */
const messageInputProps: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> = MESSAGE_INPUT_PROPS;

export function DmComposer({ peer, variant }: { peer: string; variant: 'desktop' | 'mobile' }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const state = useDmComposer(peer, inputRef);
  const { voice, error, pickerOpen } = state;

  const pendingStrip = <DmPendingFiles files={state.files} variant={variant} onRemove={state.removeFile} />;
  const voiceDraft = voice && <DmVoiceDraft voice={voice} onDiscard={state.discardVoice} />;
  const actions = <DmComposerActions state={state} variant={variant} />;
  const sendButton = <DmSendControl state={state} variant={variant} />;

  const input = (
    <Input
      {...messageInputProps}
      variant="bare"
      ref={inputRef}
      value={state.draft}
      onChange={(e) => state.typeDraft(e.target.value)}
      onPaste={state.onPaste}
      onKeyDown={(e) => {
        if (variant === 'mobile' && e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          state.send();
        }
      }}
      placeholder={t('dm.placeholderEncrypted')}
      aria-label={t('dm.placeholderEncrypted')}
      data-testid="dm-composer-input"
      className={variant === 'desktop'
        ? (voice ? 'hidden ' : '') + 'w-full bg-transparent text-sm text-lc-white outline-none placeholder:text-lc-muted'
        : voice ? 'hidden' : 'composer-input'}
    />
  );

  if (variant === 'mobile') {
    return (
      <div className="composer" data-testid="dm-composer">
        {error && <p className="px-3 pb-1 text-xs text-red-400" role="alert">{error}</p>}
        {pendingStrip}
        <div className="composer-inner">
          {actions}
          {voiceDraft}
          {input}
          <div className="composer-btns">{sendButton}</div>
        </div>
        {pickerOpen && (
          <div className="emoji-sheet-host" onClick={state.closePicker}>
            <div className="emoji-sheet native-scroll-y" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <MessageMediaPicker
                variant="sheet"
                initialTab={state.pickerTab}
                customEmojis={state.pickerEmojis}
                onPick={state.onPick}
                onClose={state.closePicker}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <FileDropZone disabled={!state.mediaAllowed} onFiles={state.addFiles} className="shrink-0">
      <form
        onSubmit={(e) => { e.preventDefault(); state.send(); }}
        className="px-5 pt-3 pb-3"
        data-testid="dm-composer"
      >
        {error && <p className="mb-2 break-words text-xs text-red-400" role="alert">{error}</p>}
        {pendingStrip}
        <div className="flex min-h-[3.5rem] items-center gap-1 rounded-xl border border-lc-border bg-lc-card px-2 focus-within:border-lc-green">
          {actions}
          <div className="relative flex flex-1 items-center">
            {voiceDraft}
            {input}
          </div>
          {sendButton}
        </div>
      </form>
    </FileDropZone>
  );
}
