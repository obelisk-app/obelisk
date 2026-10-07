'use client';

/**
 * What an account with no follows sees instead of "try the Global tab".
 *
 * A fresh key follows nobody, so the Following feed is empty on the first
 * run: the one moment where the app has to prove it's worth using. The old
 * copy pointed at Global, which is a firehose of strangers in languages you
 * may not read, and left the actual job (find people worth following) to the
 * person who just arrived.
 *
 * Starter packs are the convention the rest of the network already uses.
 * Follow one and the feed fills.
 */

import { useTranslations } from 'next-intl';
import EmptyState from '@/components/ui/feedback/EmptyState';
import { useStarterPacks } from '@/hooks/social/feed/useStarterPacks';
import StarterPackCard from './StarterPackCard';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import Skeleton from '@/components/ui/animations/Skeleton';

export default function StarterPacks({
  onOpenProfile,
}: {
  onOpenProfile?: (pubkey: string) => void;
}) {
  const t = useTranslations();
  const { rows, busy, follow } = useStarterPacks();

  /*
    The heading paints immediately, in every state.

    A brand-new account's whole first impression was two anonymous grey
    rectangles for several seconds while this fetch ran: the screen didn't
    even say what was coming. Saying "Find people to follow" costs nothing
    and turns the wait into a labelled one.
  */
  const heading = (
    <div className="px-1">
      <Heading as="h2" className="text-base font-semibold text-lc-white">{t('social.packsTitle')}</Heading>
      <Text as="p" size="13" tone="muted" className="mt-0.5">{t('social.packsSubtitle')}</Text>
    </div>
  );

  if (rows === null) {
    return (
      <div className="space-y-3 p-4" data-testid="starter-packs-loading">
        {heading}
        {[0, 1].map((index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-3 p-4" data-testid="starter-packs-empty">
        {heading}
        <EmptyState as="p" padding="md" className="px-1">
          {t('social.packsEmpty')}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4" data-testid="starter-packs">
      {heading}

      {rows.map((row) => (
        <StarterPackCard key={row.pack.id} row={row} busy={busy} onFollow={follow} onOpenProfile={onOpenProfile} />
      ))}
    </div>
  );
}
