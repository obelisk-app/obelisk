'use client';

import Link from '@/components/ui/navigation/Link';

import { useChannelLinkPill } from '@/hooks/chat/message/useChannelLinkPill';

interface Props {
  slug: string;
  messageId?: string;
  postId?: string;
  href: string;
}

/** Inline channel link with a live name and in-app navigation. */
export default function ChannelLinkPill({ slug, messageId, postId, href }: Props) {
  const vm = useChannelLinkPill(slug, href, messageId, postId);

  const baseClass =
    'inline-flex items-center rounded px-1.5 py-0.5 text-[0.95em] font-medium no-underline transition-colors';
  const variantClass = vm.noAccess
    ? 'bg-lc-muted/15 text-lc-muted cursor-not-allowed'
    : 'bg-lc-green/15 text-lc-green hover:bg-lc-green/25';

  return (
    <Link native
      href={href}
      onClick={vm.onClick}
      className={`${baseClass} ${variantClass}`}
      data-testid="channel-link-pill"
      title={vm.title}
      aria-disabled={vm.noAccess || undefined}
    >
      {vm.noAccess && <span aria-hidden>🔒 </span>}
      {!vm.noAccess && vm.prefix}
      {vm.label}
    </Link>
  );
}
