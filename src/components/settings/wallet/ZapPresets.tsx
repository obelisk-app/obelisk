'use client';

import { useTranslations } from 'next-intl';
import { useZapPresets } from '@/hooks/settings/wallet/useZapPresets';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import Input from '@/components/ui/forms/Input';
import Button from '@/components/ui/buttons/Button';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

export default function ZapPresets() {
  const t = useTranslations();
  const vm = useZapPresets();
  return (
    <Form form={vm.form} error={vm.form.error} layout="stack">
      <Heading as="h4" variant="panel">{t('settings.wallet.presets.title')}</Heading>
      <Text as="p" size="xs" tone="muted">{t('settings.wallet.presets.intro')}</Text>
      {vm.form.values.presets.map((preset, index) => (
        <div key={index} className="flex items-end gap-2">
          <Input label={t('settings.wallet.presets.emoji')} value={preset.emoji} disabled={index === 0}
            onChange={(e) => vm.change(index, 'emoji', e.target.value)} />
          <Input label={t('settings.wallet.presets.amount')} type="number" min={1} step={1} value={preset.amountSats}
            onChange={(e) => vm.change(index, 'amountSats', e.target.value)} />
          {index > 0 && <Button variant="secondary" onClick={() => vm.remove(index)}>{t('common.confirm.remove')}</Button>}
        </div>
      ))}
      <Button variant="secondary" onClick={vm.add} disabled={vm.form.values.presets.length >= 20}>{t('settings.wallet.presets.add')}</Button>
      <FormActions variant="start" submitLabel={t('common.save')} busy={vm.form.submitting} />
    </Form>
  );
}
