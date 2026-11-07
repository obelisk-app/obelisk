'use client';

import Text from '@/components/ui/layout/Text';

import { useTranslations } from 'next-intl';
import type { MediaLibraryModel } from '@/hooks/media/library/useMediaLibraryModal';
import Button from '@/components/ui/buttons/Button';
import Heading from '@/components/ui/layout/Heading';
import MediaItemGrid from './MediaItemGrid';

/** The server's actual contents, including an explicit legacy conversion path. */
export default function ServerMediaSection({ vm }: { vm: MediaLibraryModel }) {
  const t = useTranslations();
  return <section className="mb-5 space-y-3">
    <Heading as="h3" variant="panel">{t('media.manage.serverList')}</Heading>
    <Text as="p" className="text-sm text-lc-muted">{t('media.manage.serverHelp')}</Text>
    {vm.missingPacks.length > 0 && <div role="alert" className="space-y-2">
      <Text as="p">{t('media.manage.missing')}</Text>
      <Button onClick={vm.retryReferences}>{t('media.manage.retry')}</Button>
      {vm.missingPacks.map((address) => <div key={address} className="break-all text-xs">{address}
        <Button disabled={!vm.canEditServer} onClick={() => vm.excludeReference(address)}>{t('media.manage.exclude')}</Button>
      </div>)}
    </div>}
    <Button disabled={!vm.canEditServer || !vm.serverDraft} onClick={vm.editServer}>{t('media.manage.editServer')}</Button>
    {vm.serverDraft && <MediaItemGrid items={vm.serverDraft.items} onOpen={vm.openFavorite} />}
  </section>;
}
