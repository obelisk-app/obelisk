'use client';

import { useTranslations } from 'next-intl';
import Card from '@/components/ui/layout/Card';

/** What a relay offers today, above the pack grid in the server tab. */
export default function ServerPackSummary({ count, legacyItems }: { count: number; legacyItems: boolean }) {
  const t = useTranslations();
  return (
    <Card as="section" surface="translucent" padding="lg" data-testid="server-pack-summary" className="mb-5">
      <h3 className="font-semibold text-lc-white">{t('media.serverPacks')}</h3>
      <p className="mt-1 text-xs text-lc-muted">{t('media.serverPacksSelected', { count })}</p>
      <p className="mt-2 text-xs text-lc-muted">{t('media.serverPacksHelp')}</p>
      {legacyItems && <p className="mt-2 text-xs text-amber-300">{t('media.legacyHelp')}</p>}
    </Card>
  );
}
