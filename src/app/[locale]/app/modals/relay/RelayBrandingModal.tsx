'use client';

import { shortHost } from '@/utils/relay-url/url-host';
import Modal from '@/components/ui/overlays/Modal';
import ErrorState from '@/components/ui/feedback/ErrorState';
import TextArea from '@/components/ui/forms/TextArea';
import Input from '@/components/ui/forms/Input';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import { useRelayBrandingForm } from '@/hooks/relay/branding/useRelayBrandingForm';
import { type RelayBranding } from '@/services/relay/relay-branding';
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
  const {
    icon, banner, name, description, saving, error: err,
    setIcon, setBanner, setName, setDescription, submit,
  } = useRelayBrandingForm(relayUrl, branding, onClose);

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
        <form
          id="relay-branding-form"
          className="min-h-0 flex-1 space-y-7 overflow-y-auto p-5"
          onSubmit={submit}
        >
          <section className="space-y-4">
            <SectionHeader title={t('shell.desktop.branding.appearance')} />
            <ChannelAppearanceInput
              picture={icon}
              banner={banner}
              onPictureChange={setIcon}
              onBannerChange={setBanner}
            />
          </section>
          <section className="space-y-3">
            <Field label={t('mobile.field.name')}>
              <Input size="sm" value={name} onChange={(event) => setName(event.target.value)} placeholder={shortHost(relayUrl)} />
            </Field>
            <Field label={t('mobile.field.description')}>
              <TextArea size="sm" resize="both" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
            </Field>
          </section>
          {err && <ErrorState>{err}</ErrorState>}
        </form>
        <ModalFooter
          cancel={{ onClick: onClose }}
          actions={[{ label: saving ? t('common.saving') : t('common.save'), form: 'relay-branding-form', disabled: saving }]}
        />
    </Modal>
  );
}
