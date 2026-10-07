'use client';

import { useId } from 'react';
import { shortHost } from '@/utils/relay-url/url-host';
import { useRelayBrandingForm } from '@/hooks/chat/useRelayBrandingForm';
import { type RelayBranding } from '@/services/relay-branding';
import BlossomImageInput from '@/components/media/BlossomImageInput';
import { useTranslations } from 'next-intl';
import Sheet from '@/components/ui/Sheet';
import Input from '@/components/ui/Input';
import TextArea from '@/components/ui/TextArea';
import SheetActions from './SheetActions';
import SheetHeader from './SheetHeader';

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
  const {
    icon, banner, name, description, saving, error: err,
    setIcon, setBanner, setName, setDescription, save,
  } = useRelayBrandingForm(relayUrl, branding, close);

  return (
    <Sheet onClose={close} screen="edit-branding" label={t('mobile.branding.edit')} zIndex={20} maxHeight="94%">
      <SheetHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>}
        title={t('mobile.branding.edit')}
        subtitle={t('mobile.branding.help')}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <BlossomImageInput
          label={t('mobile.branding.iconAlt')}
          value={icon}
          onChange={setIcon}
          shape="square"
          hint={t('mobile.branding.iconHint')}
        />
        <BlossomImageInput
          label={t('mobile.branding.bannerAlt')}
          value={banner}
          onChange={setBanner}
          shape="wide"
          hint={t('mobile.branding.bannerHint')}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor={nameId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace" }}>
            {t('mobile.settings.displayName')}
          </label>
          <div className="setup-input-wrap">
            <Input
              variant="mobile"
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={shortHost(relayUrl)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor={descriptionId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace" }}>
            {t('mobile.field.description')}
          </label>
          <div className="setup-input-wrap">
            <TextArea
              variant="mobile"
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t('mobile.branding.descriptionPlaceholder')}
            />
          </div>
        </div>
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--presence-dnd)' }}>{err}</div>}
      <SheetActions
        primary={{ label: t('mobile.branding.save'), busyLabel: t('common.saving'), busy: saving, onClick: () => void save(), testId: 'mobile-branding-save' }}
        onCancel={close}
      />
    </Sheet>
  );
}
