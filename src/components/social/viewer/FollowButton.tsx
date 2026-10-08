'use client';

/**
 * Follow someone from the note page.
 *
 * The author-context lists were read-only: "here are ten people this author
 * reads" with no way to act on it, so the most useful thing on the page -
 * discovery - ended at a link. This is a client island inside the
 * server-rendered context, because following needs a signer and the rest of
 * that page is static HTML a crawler can read.
 *
 * Renders nothing when there's nobody to publish as, rather than a button
 * that asks you to log in from a page that has no login: the link to the
 * profile is already there, and Obelisk's own surfaces do have one.
 */

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import { useFollowButton } from '@/hooks/social/viewer/useFollowButton';

export default function FollowButton({
  pubkey,
  className = '',
}: {
  pubkey: string;
  className?: string;
}) {
  const t = useTranslations();
  const vm = useFollowButton(pubkey);

  if (vm.hidden) return null;

  return (
    <Button
      variant="bare"
      type="button"
      onClick={vm.onClick}
      disabled={vm.disabled}
      aria-pressed={vm.following}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
        vm.following
          ? 'border-lc-border text-lc-muted hover:text-lc-white'
          : 'border-lc-green/50 bg-lc-green/15 text-lc-green hover:bg-lc-green/25'
      } ${className}`}
      data-testid="follow-button"
    >
      {vm.busy ? '…' : t(vm.labelKey)}
    </Button>
  );
}
