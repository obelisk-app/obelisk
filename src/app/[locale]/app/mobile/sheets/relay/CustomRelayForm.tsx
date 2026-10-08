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

/** The add-relay sheet's custom tab: a relay URL field and the add button. */
export function CustomRelayForm({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations();
  const urlId = useId();
  const form = useForm(addRelayForm(onAdded));

  return (
    <Form form={form} layout="sheet">
      <Label variant="sheetMono" htmlFor={urlId}>
        {t('shell.rail.addModal.urlLabel')}
      </Label>
      <Text as="p" style={{ fontSize: 12, color: 'var(--app-text-dim)', margin: 0, lineHeight: 1.5 }}>
        {t('mobile.rail.addHelp')}
      </Text>
      <div className="setup-input-wrap">
        <Input
          autoFocus
          variant="mobile"
          id={urlId}
          {...form.field('url')}
          spellCheck={false}
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
        />
      </div>
      <FormError variant="sheet">{form.error}</FormError>
      <FormActions
        variant="sheet"
        submitLabel={t('mobile.rail.addRelay')}
        busyLabel={t('mobile.rail.adding')}
        busy={form.submitting}
        disabled={!form.canSubmit}
      />
    </Form>
  );
}
