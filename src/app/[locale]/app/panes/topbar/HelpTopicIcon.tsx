'use client';

import { LayersIcon, LockIcon, ShieldIcon, SparklesIcon, ZapIcon } from '@/components/ui/icons/icons';

/** Icon tile for a help-popover guide card, keyed by guide slug. */
export function HelpTopicIcon({ slug }: { slug: string }) {
  const Icon = slug === 'how-obelisk-works'
    ? LayersIcon
    : slug === 'admin-cli'
      // "Run a community": moderation, roles and bans. The guide's slug is
      // older than its copy; the CLI it was named for is gone.
      ? ShieldIcon
      : slug === 'bitcoin-zaps'
        ? ZapIcon
        : slug === 'local-data'
          ? LockIcon
          : SparklesIcon;
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-lc-green/30 bg-lc-green/10 text-lc-green"
      data-testid={`help-topic-icon-${slug}`}
    >
      <Icon size={18} />
    </span>
  );
}
