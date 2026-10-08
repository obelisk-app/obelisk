'use client';

import { useId } from 'react';
import { shortHost } from '@/utils/relay-url/url-host';
import { useForm } from '@/hooks/common/useForm';
import { type RelayBranding } from '@/services/relay/relay-branding';
import { relayBrandingForm } from '@/services/relay/branding-form';
import FormError from '@/components/ui/forms/FormError';
import BlossomImageInput from '@/components/media/upload/BlossomImageInput';
import { useTranslations } from 'next-intl';
import Sheet from '@/components/ui/overlays/Sheet';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import SheetActions from '@/components/ui/overlays/SheetActions';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import { ImageIcon } from '@/assets/icons';
import Label from '@/components/ui/forms/Label';

// Bottom-sheet for editing kind 30078 relay branding (name, description,
// icon, banner). Mobile-native counterpart of the desktop RelayBrandingModal,
// reusing publishBranding so a write here is indistinguishable from desktop.
export function EditBrandingSheet({
  relayUrl,
  branding,
  close,
}: {
  relayUrl: string;
  branding: RelayBranding;
  close: () => void;
}) {
  const t = useTranslations();
  const nameId = useId();
  const descriptionId = useId();
  const form = useForm(relayBrandingForm(relayUrl, branding, close));

  return (
    <Sheet onClose={close} screen="edit-branding" label={t('mobile.branding.edit')} zIndex={20} maxHeight="94%">
      <SheetHeader
        icon={<ImageIcon size={null} />}
        title={t('mobile.branding.edit')}
        subtitle={t('mobile.branding.help')}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <BlossomImageInput
          label={t('mobile.branding.iconAlt')}
          value={form.values.icon}
          onChange={(value) => form.set('icon', value)}
          shape="square"
          hint={t('mobile.branding.iconHint')}
        />
        <BlossomImageInput
          label={t('mobile.branding.bannerAlt')}
          value={form.values.banner}
          onChange={(value) => form.set('banner', value)}
          shape="wide"
          hint={t('mobile.branding.bannerHint')}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Label variant="sheetMono" htmlFor={nameId}>
            {t('mobile.settings.displayName')}
          </Label>
          <div className="setup-input-wrap">
            <Input
              variant="mobile"
              id={nameId}
              {...form.field('name')}
              placeholder={shortHost(relayUrl)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Label variant="sheetMono" htmlFor={descriptionId}>
            {t('mobile.field.description')}
          </Label>
          <div className="setup-input-wrap">
            <TextArea
              variant="mobile"
              id={descriptionId}
              {...form.field('description')}
              rows={2}
              placeholder={t('mobile.branding.descriptionPlaceholder')}
            />
          </div>
        </div>
      </div>
      <FormError variant="sheet">{form.error}</FormError>
      <SheetActions
        primary={{ label: t('mobile.branding.save'), busyLabel: t('common.saving'), busy: form.submitting, onClick: () => void form.submit(), testId: 'mobile-branding-save' }}
        onCancel={close}
      />
    </Sheet>
  );
}
