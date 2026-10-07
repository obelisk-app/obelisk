'use client';

import { useTranslations } from 'next-intl';
import type { NostrRef } from '@/services/social/nip27';
import { useEventRefChip } from '@/hooks/social/note/useEventRefChip';

/**
 * A referenced note, named rather than hashed.
 *
 * This printed `↗ efaa274291b5…`: the id of a thing, which tells a reader
 * nothing about the thing. It now resolves to the author and the opening
 * words, which is what a quote looks like everywhere else, and falls back to
 * the short id only when no relay still has the note.
 *
 * The author often arrives free: an `nevent` carries the pubkey, so the name
 * can render while the body is still in flight.
 */
export default function EventRefChip({
  refValue,
  onOpenNote,
}: {
  refValue: Extract<NostrRef, { type: 'event' }>;
  onOpenNote?: (id: string) => void;
}) {
  const t = useTranslations();
  const { name, snippet, loading } = useEventRefChip(refValue);

  return (
    <button
      type="button"
      className="my-1 flex w-full max-w-full flex-col gap-0.5 rounded-lg border border-lc-border bg-lc-dark/60 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-lc-green/40"
      onClick={() => onOpenNote?.(refValue.id)}
      data-testid="note-ref"
      title={t('social.openNote')}
    >
      <span className="flex min-w-0 items-center gap-1 text-lc-muted">
        <span aria-hidden="true">↗</span>
        {name ? (
          <span className="min-w-0 truncate font-medium text-lc-green">{name}</span>
        ) : (
          <span className="min-w-0 truncate font-mono">{refValue.id.slice(0, 12)}…</span>
        )}
      </span>
      {loading ? (
        <span className="lc-skeleton h-3 w-2/3 rounded" aria-hidden="true" />
      ) : snippet ? (
        <span className="line-clamp-2 min-w-0 text-lc-white/75">{snippet}</span>
      ) : null}
    </button>
  );
}
