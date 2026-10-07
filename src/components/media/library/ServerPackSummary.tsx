'use client';

import { useTranslations } from 'next-intl';
import Card from '@/components/ui/layout/Card';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/** What a relay offers today, above the pack grid in the server tab. */
export default function ServerPackSummary({ count, legacyItems }: { count: number; legacyItems: boolean }) {
  const t = useTranslations();
  return (
    <Card as="section" surface="translucent" padding="lg" data-testid="server-pack-summary" className="mb-5">
      <Heading as="h3" className="font-semibold text-lc-white">{t('media.serverPacks')}</Heading>
      <Text as="p" variant="caption" className="mt-1">{t('media.serverPacksSelected', { count })}</Text>
      <Text as="p" variant="caption" className="mt-2">{t('media.serverPacksHelp')}</Text>
      {legacyItems && <Text as="p" size="xs" className="mt-2 text-amber-300">{t('media.legacyHelp')}</Text>}
    </Card>
  );
}
