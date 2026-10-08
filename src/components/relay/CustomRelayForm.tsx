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

/** The relay URL form shared by the desktop dialog and phone sheet. */
export function CustomRelayForm({ onAdded, presentation = 'dialog' }: {
  onAdded: () => void;
  presentation?: 'dialog' | 'sheet';
}) {
  const t = useTranslations();
  const form = useForm(addRelayForm(onAdded));
  const urlId = useId();
  const sheet = presentation === 'sheet';
  return (
    <Form form={form} layout={sheet ? 'sheet' : 'bare'}>
      <Label htmlFor={urlId} variant={sheet ? 'sheetMono' : undefined} className={sheet ? undefined : 'block text-sm font-semibold text-lc-white'}>
        {t('shell.rail.addModal.urlLabel')}
      </Label>
      <Text as="p" variant="caption" className={sheet ? undefined : 'mt-1'}>
        {sheet ? t('mobile.rail.addHelp') : t('shell.rail.addModal.urlHint')}
      </Text>
      <div className={sheet ? 'setup-input-wrap' : undefined}>
        <Input id={urlId} autoFocus {...form.field('url')} spellCheck={false} variant={sheet ? 'mobile' : undefined} className={sheet ? 'font-mono text-[13px]' : 'mt-3 font-mono'} />
      </div>
      <FormError variant={sheet ? 'sheet' : undefined} className={sheet ? undefined : 'mt-2'}>{form.error}</FormError>
      <FormActions
        variant={sheet ? 'sheet' : 'end'}
        className={sheet ? undefined : 'mt-4'}
        submitLabel={sheet ? t('mobile.rail.addRelay') : t('shell.rail.addRelay')}
        busyLabel={sheet ? t('mobile.rail.adding') : t('shell.rail.addModal.adding')}
        busy={form.submitting}
        disabled={!form.canSubmit}
      />
    </Form>
  );
}
