'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import { useWhoToFollowWidget } from '@/hooks/social/widgets/useWhoToFollowWidget';
import Panel from '@/components/ui/layout/Panel';
import WidgetEmpty from './WidgetEmpty';
import WhoToFollowRow from './WhoToFollowRow';

/**
 * People in the feed the reader does not follow yet.
 *
 * Drawn from the loaded window rather than a recommendation query, so it
 * costs nothing and stays honest: these are people who actually turned up in
 * front of you, not an algorithm's opinion about who you'd like.
 */
export default function WhoToFollowWidget({
  notes,
  onOpenProfile,
}: {
  notes: readonly NostrEvent[];
  onOpenProfile?: (pubkey: string) => void;
}) {
  const t = useTranslations();
  const { people } = useWhoToFollowWidget(notes);

  return (
    <Panel title={t('social.whoToFollow')} data-testid="widget-who-to-follow">
      {people.length === 0 ? (
        <WidgetEmpty testId="who-to-follow-empty">{t('social.whoToFollowEmpty')}</WidgetEmpty>
      ) : (
        <ul>
          {people.map((person) => (
            <WhoToFollowRow key={person.pubkey} pubkey={person.pubkey} onOpenProfile={onOpenProfile} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
