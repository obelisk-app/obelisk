'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import { WOT_TIERS } from '@/constants/wot/colors';
import Text from '@/components/ui/layout/Text';

/** The colour legend: channels in the rail are coloured by the closest principal's hop distance. */
export default function WotLegend() {
  const t = useTranslations();
  return (
    <Card surface="translucent" radius="md" padding="sm">
      <Text as="div" variant="label" size="10" weight="semibold" tone="muted" className="mb-1.5">
        {t('settings.wot.channelColors')}
      </Text>
      <ul className="space-y-1">
        {WOT_TIERS.map((tier) => (
              <li key={tier.label} className="flex items-center gap-2 text-xs">
                <span className={`inline-block w-8 text-center rounded-full border px-1 py-0 font-mono text-[10px] ${tier.badgeClass}`}>
                  {tier.label}
                </span>
                <span className={`flex-1 ${tier.textClass}`}>{t(tier.descriptionKey)}</span>
              </li>
        ))}
        <li className="flex items-center gap-2 text-xs">
              <span className="inline-block w-8 text-center rounded-full border border-lc-border px-1 py-0 font-mono text-[10px] text-lc-muted">-</span>
              <span className="flex-1 text-lc-muted">{t('settings.wot.outOfGraph')}</span>
        </li>
      </ul>
    </Card>
  );
}
