'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from '@/hooks/common/useForm';
import { addRelayForm } from '@/services/relay/add-relay-form';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import FormError from '@/components/ui/forms/FormError';
import Input from '@/components/ui/forms/Input';
import Label from '@/components/ui/forms/Label';
import Text from '@/components/ui/layout/Text';

/** The add-relay dialog's custom tab: type a URL, add it and switch to it. */
export function CustomRelayForm({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations();
  const form = useForm(addRelayForm(onAdded));
  const urlId = useId();
  return (
    <Form form={form}>
      <Label htmlFor={urlId} className="block text-sm font-semibold text-lc-white">{t('shell.rail.addModal.urlLabel')}</Label>
      <Text as="p" variant="caption" className="mt-1">{t('shell.rail.addModal.urlHint')}</Text>
      <Input id={urlId} autoFocus {...form.field('url')} spellCheck={false} className="mt-3 font-mono" />
      <FormError className="mt-2">{form.error}</FormError>
      <FormActions
        variant="end"
        className="mt-4"
        submitLabel={t('shell.rail.addRelay')}
        busyLabel={t('shell.rail.addModal.adding')}
        busy={form.submitting}
        disabled={!form.canSubmit}
      />
    </Form>
  );
}
