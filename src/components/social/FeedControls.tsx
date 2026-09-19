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
 * Refresh was a bare `⟳` text glyph with no busy state — clicking it looked
 * identical to not clicking it. It's an icon button now, and it spins while a
 * fetch is in flight so the click has visible consequences.
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
      className="group flex w-full items-center gap-3 border-b border-lc-border px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      data-testid={testId}
    >
      <UserAvatar
        pubkey={pubkey}
        picture={picture ?? null}
        size={10}
        name={name || pubkey.slice(0, 8)}
        alt=""
      />
      <span className="flex-1 truncate rounded-full border border-lc-border bg-lc-dark px-4 py-2.5 text-sm text-lc-muted transition-colors group-hover:border-lc-green/40 group-hover:text-lc-white">
        {placeholder ?? t('social.postPlaceholder')}
      </span>
      <span className="lc-pill-primary shrink-0 px-4 py-2 text-xs" aria-hidden="true">
        {t('social.post')}
      </span>
    </button>
  );
}

export function RefreshButton({
  busy,
  onClick,
  testId = 'feed-refresh',
}: {
  busy?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="group/act -m-1 flex items-center rounded-full p-1 text-lc-muted disabled:opacity-50"
      onClick={onClick}
      disabled={busy}
      aria-label={t('social.refresh')}
      title={t('social.refresh')}
      data-testid={testId}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full transition-colors group-hover/act:bg-white/10 group-hover/act:text-lc-white">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={busy ? 'animate-spin' : ''}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      </span>
    </button>
  );
}
