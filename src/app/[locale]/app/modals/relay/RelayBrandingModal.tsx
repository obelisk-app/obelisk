'use client';

import { shortHost } from '@/utils/relay-url/url-host';
import Modal from '@/components/ui/overlays/Modal';
import TextArea from '@/components/ui/forms/TextArea';
import Input from '@/components/ui/forms/Input';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import { useForm } from '@/hooks/common/useForm';
import { type RelayBranding } from '@/services/relay/relay-branding';
import { relayBrandingForm } from '@/services/relay/branding-form';
import Form from '@/components/ui/forms/Form';
import ChannelAppearanceInput from '@/components/media/upload/ChannelAppearanceInput';
import { useTranslations } from 'next-intl';
import { Field } from '../common/Field';
import { SectionHeader } from '../common/SectionHeader';

export function RelayBrandingModal({
  relayUrl,
  branding,
  onClose,
}: {
  relayUrl: string;
  branding: RelayBranding;
  onClose: () => void;
}) {
  const t = useTranslations();
  const form = useForm(relayBrandingForm(relayUrl, branding, onClose));

  return (
    <Modal
      onClose={onClose}
      panelClassName="lc-card flex max-h-[90vh] w-full max-w-xl mx-4 flex-col overflow-hidden bg-lc-dark"
    >
        <ModalHeader
          title={t('shell.desktop.branding.title')}
          subtitle={t('shell.desktop.branding.subtitle', { host: shortHost(relayUrl) })}
          onClose={onClose}
        />
        <Form form={form} layout="sections" className="min-h-0 flex-1 overflow-y-auto" error={form.error}>
          <section className="space-y-4">
            <SectionHeader title={t('shell.desktop.branding.appearance')} />
            <ChannelAppearanceInput
              picture={form.values.icon}
              banner={form.values.banner}
              onPictureChange={(value) => form.set('icon', value)}
              onBannerChange={(value) => form.set('banner', value)}
            />
          </section>
          <section className="space-y-3">
            <Field label={t('mobile.field.name')}>
              <Input size="sm" {...form.field('name')} placeholder={shortHost(relayUrl)} />
            </Field>
            <Field label={t('mobile.field.description')}>
              <TextArea size="sm" resize="both" {...form.field('description')} rows={2} />
            </Field>
          </section>
        </Form>
        <ModalFooter
          cancel={{ onClick: onClose }}
          actions={[{ label: form.submitting ? t('common.saving') : t('common.save'), form: form.id, disabled: form.submitting }]}
        />
    </Modal>
  );
}
