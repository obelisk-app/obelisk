'use client';

/**
 * The desktop composer: a card that expands in place.
 *
 * It sits where the compose row was, beside the feed it's answering, with a
 * live markdown preview and a mouse-sized toolbar. That works because a
 * desktop viewport has room to show the composer *and* its context at once.
 *
 * A phone doesn't (the keyboard eats half the screen) so it gets its own
 * presentation in `MobileComposer`. Both share `useNoteDraft`, which owns
 * everything that touches Blossom, NIP-92 `imeta` and the relay, so the two
 * can't drift on what actually gets published.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';
import Text from '@/components/ui/Text';
import MessageContent from '@/components/chat/MessageContent';
import { linkifyHashtags } from '@/services/social/profile-feed';
import { useNoteDraft, type ComposerMode } from '@/hooks/social/useNoteDraft';
import ErrorState from '@/components/ui/ErrorState';
import FileInput from '@/components/ui/FileInput';

export type { ComposerMode };

export default function NoteComposer({
  mode = { kind: 'note' },
  onPublished,
  onCancel,
  autoFocus = false,
}: {
  mode?: ComposerMode;
  onPublished?: (event: NostrEvent) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const composer = useNoteDraft({ mode, onPublished, autoFocus });
  const {
    draft, setDraft, busy, error, sensitive, setSensitive, dragging, setDragging,
    textareaRef, fileRef, wrapSelection, uploadFiles, onPaste, onDrop, onDragOver,
    submit, placeholder, canPost,
  } = composer;

  return (
    <form
      className="lc-composer p-3"
      data-dragging={dragging || undefined}
      onSubmit={(event) => void submit(event)}
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      data-testid="note-composer"
    >
      {/*
        The field carries no frame of its own. The card is already a
        container, and a bordered well inside it read as a second box:
        which is what made the old composer look like a dialog. Focus is
        shown on the card (`.lc-composer:focus-within`) rather than here,
        so the whole thing lights up as one surface.
      */}
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-h-24 w-full resize-y border-0 bg-transparent px-1 py-1 text-[15px] leading-6 text-lc-white outline-none placeholder:text-lc-muted/70"
        placeholder={placeholder}
        data-testid="composer-input"
      />

      {draft.trim() && (
        <div
          className="mt-2 border-t border-lc-border/60 pt-3 text-sm text-lc-white"
          data-testid="composer-preview"
        >
          <Text as="p" size="10" weight="semibold" variant="label" className="mb-1.5 text-lc-muted/70">
            {t('composer.preview')}
          </Text>
          <MessageContent content={linkifyHashtags(draft)} wideMedia />
        </div>
      )}

      {error && <ErrorState className="mt-2">{error}</ErrorState>}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-lc-border/60 pt-3">
        <div className="lc-toolgroup">
          <Button variant="tool" className="font-bold" onClick={() => wrapSelection('**')} title={t('composer.bold')} aria-label={t('composer.bold')}>B</Button>
          <Button variant="tool" className="italic" onClick={() => wrapSelection('_')} title={t('composer.italic')} aria-label={t('composer.italic')}>I</Button>
          <Button variant="tool" onClick={() => wrapSelection('[', '](https://)')}>{t('composer.link')}</Button>
        </div>

        <Button
          variant="tool"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <span aria-hidden="true" className="text-sm leading-none">+</span>
          {t('profileFeed.upload')}
        </Button>
        <Button
          variant="tool"
          onClick={() => setSensitive((value) => !value)}
          aria-pressed={sensitive}
          data-testid="composer-sensitive"
          title={t('social.markSensitive')}
        >
          {t('social.markSensitive')}
        </Button>
        <FileInput
          ref={fileRef}
          accept="image/*,video/*,audio/*"
          multiple
          aria-label={t('profileFeed.upload')}
          onChange={(event) => void uploadFiles(event.target.files)}
          data-testid="composer-files"
        />

        {/* Guidance, not a control: first thing to go when space is tight. */}
        <span className="ml-auto hidden text-[10px] text-lc-muted/70 xl:inline">
          {t('profileFeed.markdownHint')}
        </span>

        <div className="ml-auto flex gap-2 xl:ml-3">
          {onCancel && (
            <Button variant="pillSecondary" size="xs" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          )}
          <Button type="submit" variant="pill" size="xs" disabled={!canPost}>
            {busy ? t('common.saving') : t('profileFeed.publish')}
          </Button>
        </div>
      </div>
    </form>
  );
}

export type { NostrEvent };
