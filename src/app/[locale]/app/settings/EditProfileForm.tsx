'use client';

import { useEffect, useRef } from 'react';
import { useProfileEditorForm } from '@/hooks/chat/profile/useProfileEditorForm';
import ProfileAppearanceEditor from '@/components/settings/account/ProfileAppearanceEditor';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Button from '@/components/ui/buttons/Button';

export function EditProfileForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: { displayName: string | null; name: string | null; about: string | null; picture: string | null; banner: string | null; nip05: string | null; lud16?: string | null; website: string | null } | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const {
    name, about, picture, banner, nip05, lud16, website, pictureFile, bannerFile,
    setName, setAbout, setPicture, setBanner, setNip05, setLud16, setWebsite, setPictureFile, setBannerFile,
    uploading, saving, error, save,
  } = useProfileEditorForm(initial, onSaved);
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => { firstField.current?.focus(); }, []);

  return (
    <div className="space-y-3 p-4">
      <ProfileAppearanceEditor
        pubkey={name || '0'}
        displayName={name}
        value={{ pictureUrl: picture, bannerUrl: banner, pictureFile, bannerFile }}
        uploading={uploading}
        onChange={(next) => {
          setPicture(next.pictureUrl);
          setBanner(next.bannerUrl);
          setPictureFile(next.pictureFile);
          setBannerFile(next.bannerFile);
        }}
      />
      <Field label={t('shell.user.field.name')}>
        <Input ref={firstField} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('shell.user.about')}>
        <TextArea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} resize="both" />
      </Field>
      <Field label={t('shell.user.field.nip05')}>
        <Input value={nip05} onChange={(e) => setNip05(e.target.value)} placeholder="you@example.com" />
      </Field>
      <Field label={t('shell.user.field.lud16')}>
        <Input value={lud16} onChange={(e) => setLud16(e.target.value)} placeholder="you@walletofsatoshi.com" />
      </Field>
      <Field label={t('shell.user.field.website')}>
        <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
      </Field>
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="flex gap-2 pt-1">
        <Button variant="pill" size="sm" onClick={() => void save()} disabled={saving} data-testid="save-profile-button">
          {saving ? t('common.saving') : t('common.save')}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

/** Settings sections - one per entry in the settings sidebar. */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-lc-muted">{label}</span>
      {children}
    </label>
  );
}
