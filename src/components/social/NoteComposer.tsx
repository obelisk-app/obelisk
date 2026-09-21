'use client';

/**
 * The desktop composer: a card that expands in place.
 *
 * It sits where the compose row was, beside the feed it's answering, with a
 * live markdown preview and a mouse-sized toolbar. That works because a
 * desktop viewport has room to show the composer *and* its context at once.
 *
 * A phone doesn't — the keyboard eats half the screen — so it gets its own
 * presentation in `MobileComposer`. Both share `useNoteDraft`, which owns
 * everything that touches Blossom, NIP-92 `imeta` and the relay, so the two
 * can't drift on what actually gets published.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslation } from '@/i18n/context';
import MessageContent from '@/components/chat/MessageContent';
import { linkifyHashtags } from '@/lib/profile-feed';
import { useNoteDraft, type ComposerMode } from './useNoteDraft';

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
      className={`rounded-xl border bg-lc-dark p-3 transition-colors ${
        dragging ? 'border-lc-green' : 'border-lc-border'
      }`}
      onSubmit={(event) => void submit(event)}
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      data-testid="note-composer"
    >
      <div className="mb-2 flex items-center gap-1">
        <button type="button" className="rounded px-2 py-1 text-sm font-bold text-lc-muted hover:bg-white/5 hover:text-lc-white" onClick={() => wrapSelection('**')}>B</button>
        <button type="button" className="rounded px-2 py-1 text-sm italic text-lc-muted hover:bg-white/5 hover:text-lc-white" onClick={() => wrapSelection('_')}>I</button>
        <button type="button" className="rounded px-2 py-1 text-xs text-lc-muted hover:bg-white/5 hover:text-lc-white" onClick={() => wrapSelection('[', '](https://)')}>Link</button>
        <button
          type="button"
          className={`ml-auto rounded px-2 py-1 text-xs ${sensitive ? 'text-lc-green' : 'text-lc-muted hover:text-lc-white'}`}
          onClick={() => setSensitive((value) => !value)}
          aria-pressed={sensitive}
          data-testid="composer-sensitive"
          title={t('social.markSensitive')}
        >
          {t('social.markSensitive')}
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-lc-muted hover:bg-white/5 hover:text-lc-white"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          + {t('profileFeed.upload')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          className="hidden"
          onChange={(event) => void uploadFiles(event.target.files)}
          data-testid="composer-files"
        />
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-h-24 w-full resize-y rounded-lg border border-lc-border bg-lc-black px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
        placeholder={placeholder}
        data-testid="composer-input"
      />

      {draft.trim() && (
        <div className="mt-2 rounded-lg border border-lc-border/70 bg-lc-black p-3 text-sm text-lc-white" data-testid="composer-preview">
          <MessageContent content={linkifyHashtags(draft)} wideMedia />
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[10px] text-lc-muted">{t('profileFeed.markdownHint')}</span>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" className="lc-pill-secondary px-4 py-2 text-xs" onClick={onCancel}>
              {t('common.cancel')}
            </button>
          )}
          <button type="submit" className="lc-pill-primary px-5 py-2 text-xs" disabled={!canPost}>
            {busy ? t('common.saving') : t('profileFeed.publish')}
          </button>
        </div>
      </div>
    </form>
  );
}

export type { NostrEvent };
