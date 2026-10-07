'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import type { EditProfileScreenModel } from '@/hooks/shell/mobile/screens/profile/useEditProfileScreen';
import Label from '@/components/ui/forms/Label';

/** The profile editor's text fields, each named by its visible label. */
export default function EditProfileFields({ vm }: { vm: EditProfileScreenModel }) {
  const t = useTranslations();
  const nameId = useId();
  const aboutId = useId();
  const nip05Id = useId();
  const lud16Id = useId();
  const pictureId = useId();
  const bannerId = useId();
  const websiteId = useId();
  return (
    <div className="edit-fields">
      <div className="setup-field">
        <Label htmlFor={nameId}>{t('mobile.settings.displayName')}</Label>
        <div className="setup-input-wrap">
          <Input
            variant="mobile"
            id={nameId}
            value={vm.name}
            onChange={(e) => vm.setName(e.target.value)}
            placeholder={t('mobile.settings.yourName')}
            maxLength={50}
            data-testid="edit-name"
          />
        </div>
      </div>
      <div className="setup-field">
        <Label htmlFor={aboutId}>{t('shell.user.about')}</Label>
        <TextArea
          variant="mobile"
          id={aboutId}
          value={vm.about}
          onChange={(e) => vm.setAbout(e.target.value)}
          placeholder={t('mobile.settings.aboutPlaceholder')}
          maxLength={500}
          rows={3}
          data-testid="edit-about"
        />
      </div>
      <div className="setup-field">
        <Label htmlFor={nip05Id}>NIP-05</Label>
        <div className="setup-input-wrap">
          <Input
            variant="mobile"
            id={nip05Id}
            value={vm.nip05}
            onChange={(e) => vm.setNip05(e.target.value)}
            placeholder="you@domain.com"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
      </div>
      <div className="setup-field">
        <Label htmlFor={lud16Id}>{t('mobile.settings.lightningAddress')}</Label>
        <div className="setup-input-wrap">
          <Input
            variant="mobile"
            id={lud16Id}
            value={vm.lud16}
            onChange={(e) => vm.setLud16(e.target.value)}
            placeholder="you@walletofsatoshi.com"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
      </div>
      {/*
        Tapping the banner/avatar above is the fast path, but a user who
        already hosts an image elsewhere needs somewhere to paste the
        link. Picking a file clears the URL (and vice versa) so save()
        can't upload a file while silently ignoring what was typed.
      */}
      <div className="setup-field">
        <Label htmlFor={pictureId}>{t('shell.user.field.picture')}</Label>
        <div className="setup-input-wrap">
          <Input
            variant="mobile"
            id={pictureId}
            value={vm.pictureUrl}
            onChange={(e) => vm.setPictureUrl(e.target.value)}
            placeholder={vm.pictureFilePicked ? t('settings.profileAppearance.fileSelected') : 'https://…'}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-testid="edit-picture-url"
          />
        </div>
      </div>
      <div className="setup-field">
        <Label htmlFor={bannerId}>{t('shell.user.field.banner')}</Label>
        <div className="setup-input-wrap">
          <Input
            variant="mobile"
            id={bannerId}
            value={vm.bannerUrl}
            onChange={(e) => vm.setBannerUrl(e.target.value)}
            placeholder={vm.bannerFilePicked ? t('settings.profileAppearance.fileSelected') : 'https://…'}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-testid="edit-banner-url"
          />
        </div>
      </div>
      <div className="setup-field">
        <Label htmlFor={websiteId}>{t('shell.user.field.website')}</Label>
        <div className="setup-input-wrap">
          <Input
            variant="mobile"
            id={websiteId}
            value={vm.website}
            onChange={(e) => vm.setWebsite(e.target.value)}
            placeholder="https://…"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
      </div>
    </div>
  );
}
