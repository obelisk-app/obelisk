'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useCreateChannelSheet } from '@/hooks/shell/mobile/sheets/channel/useCreateChannelSheet';
import Sheet from '@/components/ui/overlays/Sheet';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import FormError from '@/components/ui/forms/FormError';
import Input from '@/components/ui/forms/Input';
import SheetActions from '../chrome/SheetActions';
import SheetHeader from '../chrome/SheetHeader';
import { PlusIcon } from '@/assets/icons';
import Label from '@/components/ui/forms/Label';

/**
 * Phone skin of the new-channel form, as a bottom sheet over the channel
 * list. The form itself is `createChannelForm`, shared with the desktop
 * sidebar's `CreateGroupSection`.
 */
export function CreateChannelSheet({
  relayLabel,
  close,
  onCreated,
}: {
  relayLabel: string;
  close: () => void;
  onCreated: (groupId: string) => void;
}) {
  const t = useTranslations();
  const nameId = useId();
  const form = useCreateChannelSheet(onCreated, close);

  return (
    <Sheet onClose={close} screen="create-channel" label={t('mobile.space.newChannel')} maxHeight="88%">
      <SheetHeader
        icon={<PlusIcon size={null} />}
        title={t('mobile.space.newChannel')}
        subtitle={t.rich('shell.channel.create.help', { settings: () => <strong>{t('shell.desktop.channel.settings')}</strong> })}
      />
      <Form form={form} layout="sheet">
        <Label variant="sheetMono" htmlFor={nameId}>
          {t('shell.channel.create.nameOn', { relay: relayLabel })}
        </Label>
        <div className="setup-input-wrap">
          <Input
            variant="mobile"
            id={nameId}
            {...form.field('name')}
            placeholder={t('shell.channel.create.examplePlaceholder')}
            spellCheck={false}
            data-testid="mobile-create-channel-input"
          />
        </div>
        <FormError variant="sheet">{form.error}</FormError>
        <FormActions
          variant="sheet"
          submitLabel={t('shell.channel.create.submit')}
          busyLabel={t('shell.channel.create.creating')}
          busy={form.submitting}
          disabled={!form.canSubmit}
          submitTestId="mobile-create-channel-submit"
        />
      </Form>
      <SheetActions onCancel={close} />
    </Sheet>
  );
}
