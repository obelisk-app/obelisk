'use client';

/**
 * The mobile composer: a full-screen sheet.
 *
 * Why not the desktop card in a modal — which is what it used to be: on a
 * phone the software keyboard takes roughly half the viewport, so a centred
 * card with a toolbar, a textarea, a live preview and a button row leaves a
 * writing slot a couple of lines tall, and every control is a 24px text
 * target. The inline "¿Qué está pasando?" row had the same problem from the
 * other end: it promised an input and delivered a link to one.
 *
 * So: the sheet owns the screen. Post is a thumb-sized pill in the header
 * where every phone client puts it, the text area is everything between the
 * header and the keyboard, and the tools are one row of icons that sits
 * directly above the keyboard instead of scrolling away with the content.
 *
 * Back closes it (`useHistoryDismiss`), so the OS swipe-back gesture does
 * what it does everywhere else on a phone rather than leaving the app.
 *
 * Publishing is `useNoteDraft`, shared with the desktop composer — the two
 * differ in presentation only.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { useMyPubkey, useUserMetadata } from '@/lib/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import { useHistoryDismiss } from '@/app/app/useHistoryDismiss';
import UserAvatar from '@/components/UserAvatar';
import { useNoteDraft, type ComposerMode } from './useNoteDraft';

/** Twitter-ish soft limit: past this, a note is an article. */
const SOFT_LIMIT = 1000;

export default function MobileComposer({
  mode = { kind: 'note' },
  onPublished,
  onClose,
}: {
  mode?: ComposerMode;
  onPublished?: (event: NostrEvent) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey ?? '');
  const dismiss = useHistoryDismiss(true, onClose);

  const {
    draft, setDraft, attachments, busy, error, sensitive, setSensitive,
    textareaRef, fileRef, wrapSelection, uploadFiles, onPaste,
    submit, placeholder, canPost,
  } = useNoteDraft({ mode, onPublished, autoFocus: true });

  const parent = mode.kind === 'reply' ? mode.parent : mode.kind === 'quote' ? mode.target : null;
  const title = mode.kind === 'reply'
    ? t('social.replyAction')
    : mode.kind === 'quote'
      ? t('social.quote')
      : t('profileFeed.createPost');

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-lc-black"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="mobile-composer"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-lc-border px-3">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full px-2 py-1 text-sm text-lc-muted"
          data-testid="mobile-composer-cancel"
        >
          {t('common.cancel')}
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-lc-white">
          {title}
        </span>
        {/*
          Post lives in the header, not at the bottom: the keyboard owns the
          bottom of a phone, and a submit button that the keyboard covers is
          a button that doesn't exist.
        */}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canPost}
          className="lc-pill-primary shrink-0 px-5 py-2 text-xs disabled:opacity-40"
          data-testid="mobile-composer-post"
        >
          {busy ? t('common.saving') : t('profileFeed.publish')}
        </button>
      </header>

      {parent && (
        <div className="shrink-0 border-b border-lc-border px-4 py-2" data-testid="mobile-composer-context">
          <p className="line-clamp-2 text-xs text-lc-muted">{parent.content}</p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto px-4 py-3">
        {myPubkey && (
          <UserAvatar
            pubkey={myPubkey}
            picture={meta?.picture ?? null}
            size={9}
            name={meta?.displayName || meta?.name || myPubkey.slice(0, 8)}
            alt=""
            className="shrink-0"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {/*
            `text-base` is load-bearing on iOS: Safari zooms the viewport when
            a focused input's font is under 16px, and the page never zooms
            back out.
          */}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={onPaste}
            placeholder={placeholder}
            className="min-h-40 w-full flex-1 resize-none bg-transparent text-base leading-relaxed text-lc-white outline-none placeholder:text-lc-muted"
            data-testid="composer-input"
          />

          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" data-testid="mobile-composer-attachments">
              {attachments.map((attachment) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={attachment.url}
                  src={attachment.url}
                  alt=""
                  className="h-20 w-20 rounded-lg border border-lc-border object-cover"
                />
              ))}
            </div>
          )}

          {error && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}
        </div>
      </div>

      {/*
        The tool row is pinned above the keyboard rather than living in the
        scroll area, because the one moment you want the image button is
        while you're typing — which is exactly when a scrolled toolbar is
        off-screen.
      */}
      <div
        className="flex shrink-0 items-center gap-1 border-t border-lc-border px-2 py-2"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        <ToolButton
          label={t('profileFeed.upload')}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          testId="mobile-composer-upload"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </ToolButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          className="hidden"
          onChange={(event) => void uploadFiles(event.target.files)}
          data-testid="composer-files"
        />

        <ToolButton label={t('composer.bold')} onClick={() => wrapSelection('**')} testId="mobile-composer-bold">
          <span className="text-base font-bold">B</span>
        </ToolButton>
        <ToolButton label={t('composer.link')} onClick={() => wrapSelection('[', '](https://)')} testId="mobile-composer-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
          </svg>
        </ToolButton>
        <ToolButton
          label={t('social.markSensitive')}
          onClick={() => setSensitive(!sensitive)}
          pressed={sensitive}
          testId="composer-sensitive"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4" /><path d="M12 17h.01" />
          </svg>
        </ToolButton>

        {busy && <span className="lc-spinner ml-1 h-4 w-4" aria-hidden="true" />}

        <span
          className={`ml-auto pr-2 text-[11px] tabular-nums ${
            draft.length > SOFT_LIMIT ? 'text-amber-400' : 'text-lc-muted'
          }`}
          data-testid="mobile-composer-count"
        >
          {draft.length}
        </span>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
  disabled = false,
  pressed,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      // 40px square: the smallest thing a thumb hits reliably.
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-white/10 disabled:opacity-40 ${
        pressed ? 'text-lc-green' : 'text-lc-muted'
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
