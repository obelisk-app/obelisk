'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Input from '@/components/ui/forms/Input';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import { useConcordBackup } from '@/hooks/settings/account/useConcordBackup';

export default function ConcordBackup() {
  const t = useTranslations('settings.preferences.concordBackup');
  const vm = useConcordBackup();
  return <section className="space-y-3 rounded-lg border border-lc-border p-4">
    <Heading as="h4" variant="panel">{t('title')}</Heading>
    <Text as="p" variant="caption">{t('description')}</Text>
    <Button type="button" variant="outline" onClick={vm.download} loading={vm.working}>{t('export')}</Button>
    <Input type="file" accept=".json,application/json" label={t('file')} onChange={vm.selectFile} disabled={vm.working} />
    <Button type="button" variant="outline" onClick={vm.restore} disabled={!vm.canRestore || vm.working}>{t('restore')}</Button>
    {vm.message && <Text as="p" variant="caption" role={vm.status === 'error' ? 'alert' : 'status'}>{vm.message}</Text>}
  </section>;
}
