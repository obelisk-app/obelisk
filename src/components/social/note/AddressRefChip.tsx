'use client';

import Link from '@/components/ui/navigation/Link';

import { useTranslations } from 'next-intl';
import type { NostrRef } from '@/services/social/nip27';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { displayNameFor } from '@/utils/identity/display-name';
import { addressSlug, noteViewerHref } from '@/utils/social/note-refs';

/**
 * Addressable content (`naddr`): a long-form post, a list, a wiki page.
 *
 * This used to be a bare underlined link labelled with the raw `d`
 * identifier, which for most articles is a slug like
 * `1712000000-why-nostr`, so a reference to an article read as a fragment
 * of a URL. It now names the author the same way a quoted note does, which
 * is the part that tells a reader whether to follow it.
 *
 * The body is deliberately not fetched: resolving an addressable event means
 * a query per reference, and unlike `nevent` there is no id to dedupe on.
 * The author comes free: `naddr` carries the pubkey.
 */
export default function AddressRefChip({
  refValue,
}: {
  refValue: Extract<NostrRef, { type: 'address' }>;
}) {
  const t = useTranslations();
  const meta = useAuthor(refValue.pubkey);
  const name = displayNameFor(refValue.pubkey, meta);
  const slug = addressSlug(refValue.identifier);

  return (
    <Link native
      href={noteViewerHref(refValue.raw)}
      className="my-1 flex w-full max-w-full flex-col gap-0.5 rounded-lg border border-lc-border bg-lc-dark/60 px-2.5 py-1.5 text-left text-xs no-underline transition-colors hover:border-lc-green/40"
      data-testid="address-ref"
      title={t('social.openNote')}
    >
      <span className="flex min-w-0 items-center gap-1 text-lc-muted">
        <span aria-hidden="true">↗</span>
        <span className="min-w-0 truncate font-medium text-lc-green">{name}</span>
        <span className="shrink-0">·</span>
        <span className="shrink-0">{t('social.article')}</span>
      </span>
      {slug && <span className="line-clamp-2 min-w-0 text-lc-white/75">{slug}</span>}
    </Link>
  );
}
