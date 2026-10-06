'use client';

import { shortHost } from '@/utils/relay-url/url-host';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import ErrorState from '@/components/ui/ErrorState';
import TextArea from '@/components/ui/TextArea';
import Input from '@/components/ui/Input';
import ModalHeader from '@/components/ui/ModalHeader';
import { useRelayBrandingForm } from '@/hooks/chat/useRelayBrandingForm';
import { type RelayBranding } from '@/services/relay-branding';
import { ChannelAppearanceInput } from '@/components/media/BlossomImageInput';
import { useTranslation } from '@/i18n/context';
import { Field, SectionHeader } from './form-primitives';

export function RelayBrandingModal({
  relayUrl,
  branding,
  onClose,
}: {
  relayUrl: string;
  branding: RelayBranding;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const {
    icon, banner, name, description, saving, error: err,
    setIcon, setBanner, setName, setDescription, save,
  } = useRelayBrandingForm(relayUrl, branding, onClose);

  return (
    <Modal
      onClose={onClose}
      panelClassName="lc-card flex max-h-[90vh] w-full max-w-xl mx-4 flex-col overflow-hidden bg-lc-dark"
    >
        <ModalHeader
          title={t('desktop.branding.title')}
          subtitle={<>Shown to everyone on {shortHost(relayUrl)} · NIP-78 kind 30078</>}
          onClose={onClose}
        />
        <form
          id="relay-branding-form"
          className="flex-1 space-y-7 overflow-y-auto p-5"
          onSubmit={(event) => { event.preventDefault(); void save(); }}
        >
          <section className="space-y-4">
            <SectionHeader title={t('desktop.branding.appearance')} />
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
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-lc-border px-5 py-3">
          <Button variant="pillSecondary" size="xs" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="relay-branding-form" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </footer>
    </Modal>
  );
}
