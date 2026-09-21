'use client';

/**
 * Compose and refresh affordances, shared by the feed and the profile.
 *
 * The compose entry used to be a small lime pill reading "+ Create post",
 * floating in an otherwise empty strip. It read as a toolbar button rather
 * than an invitation to write, and it gave no hint of whose account the post
 * would come from.
 *
 * It's now the row every social client uses: your own avatar next to a
 * placeholder line that looks like the input it becomes. Clicking anywhere on
 * the row opens the composer, so the target is the full width instead of a
 * ~120px pill.
 *
 * Refresh used to live here too. It's gone: pulling up at the top of the
 * feed refreshes, and new notes announce themselves with the green pill, so
 * a button duplicating a gesture people already make was just chrome.
 */

import { useTranslation } from '@/i18n/context';
import UserAvatar from '@/components/UserAvatar';

export function ComposeButton({
  pubkey,
  picture,
  name,
  onClick,
  testId = 'feed-compose',
  placeholder,
}: {
  pubkey: string;
  picture?: string | null;
  name?: string;
  onClick: () => void;
  testId?: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 border-b border-lc-border px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      data-testid={testId}
    >
      <UserAvatar
        pubkey={pubkey}
        picture={picture ?? null}
        size={9}
        name={name || pubkey.slice(0, 8)}
        alt=""
      />
      <span className="min-w-0 flex-1 truncate rounded-full border border-lc-border bg-lc-dark px-3.5 py-2 text-[13px] text-lc-muted transition-colors group-hover:border-lc-green/40 group-hover:text-lc-white">
        {placeholder ?? t('social.postPlaceholder')}
      </span>
      {/*
        On a phone this pill was competing with the placeholder for a ~340px
        row: both got crushed and the row read as two broken inputs. The row
        is already the button, so below `sm` the pill is redundant chrome —
        a pen icon says the same thing in 32px.
      */}
      <span className="lc-pill-primary hidden shrink-0 px-4 py-2 text-xs sm:inline-flex" aria-hidden="true">
        {t('social.post')}
      </span>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lc-green text-lc-black sm:hidden"
        aria-hidden="true"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </span>
    </button>
  );
}

