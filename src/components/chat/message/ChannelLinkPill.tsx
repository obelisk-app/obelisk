'use client';

import { useChannelLinkPill } from '@/hooks/chat/message/useChannelLinkPill';

interface Props {
  slug: string;
  messageId?: string;
  postId?: string;
  href: string;
}

/**
 * Discord-style inline pill rendered in place of a same-origin
 * `/chat?c=<slug>[&m=|&p=]` link inside message content.
 *
 * The label is the slug (`useChannelLinkPill`). If the viewer has no read
 * access, renders greyed + locked (click suppressed) per the "name visible,
 * content locked" decision from FORUM_PLAN.md.
 *
 * Click navigates via `pushState` + `popstate` to keep the chat page mounted:
 * `src/app/chat/page.tsx` listens for `popstate` and re-applies URL state.
 */
export default function ChannelLinkPill({ slug, messageId, postId, href }: Props) {
  const vm = useChannelLinkPill(slug, href, messageId, postId);

  const baseClass =
    'inline-flex items-center rounded px-1.5 py-0.5 text-[0.95em] font-medium no-underline transition-colors';
  const variantClass = vm.noAccess
    ? 'bg-lc-muted/15 text-lc-muted cursor-not-allowed'
    : 'bg-lc-green/15 text-lc-green hover:bg-lc-green/25';

  return (
    <a
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
    </a>
  );
}
