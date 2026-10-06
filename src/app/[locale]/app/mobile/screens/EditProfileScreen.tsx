'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useMyPubkey, useUserMetadata } from '@/services/nostr-bridge';
import { useProfileEditorForm } from '@/hooks/chat/useProfileEditorForm';
import { useTranslations } from 'next-intl';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { NameAvatar } from '../avatar';
import FileInput from '@/components/ui/FileInput';
import Input from '@/components/ui/Input';
import TextArea from '@/components/ui/TextArea';
import BackButton from '../BackButton';
import RemoteImage from '@/components/ui/RemoteImage';

export function EditProfileScreen({ go }: { go: (s: ScreenName, dir?: 'forward' | 'back') => void }) {
  const t = useTranslations();
  const nameId = useId();
  const aboutId = useId();
  const nip05Id = useId();
  const lud16Id = useId();
  const pictureId = useId();
  const bannerId = useId();
  const websiteId = useId();
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey);
  const {
    name, about, picture, banner, nip05, lud16, website, pictureFile, bannerFile,
    setName, setAbout, setPicture, setBanner, setNip05, setLud16, setWebsite, setPictureFile, setBannerFile,
    uploading, saving, busy, error, setError, nameValid, save,
  } = useProfileEditorForm(meta, () => go('settings-profile', 'back'));
  const uploadingAvatar = uploading === 'picture';
  const uploadingBanner = uploading === 'banner';
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs on unmount.
  useEffect(() => {
    return () => {
      if (picturePreview) URL.revokeObjectURL(picturePreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    };
  }, [picturePreview, bannerPreview]);

  const pickAvatar = (file: File) => {
    if (!file.type.startsWith('image/')) { setError(t('mobile.settings.imageOnly')); return; }
    if (file.size > 10 * 1024 * 1024) { setError(t('mobile.settings.imageTooLarge')); return; }
    setError(null);
    setPictureFile(file);
    if (picturePreview) URL.revokeObjectURL(picturePreview);
    setPicturePreview(URL.createObjectURL(file));
  };

  const pickBanner = (file: File) => {
    if (!file.type.startsWith('image/')) { setError(t('mobile.settings.imageOnly')); return; }
    if (file.size > 10 * 1024 * 1024) { setError(t('mobile.settings.imageTooLarge')); return; }
    setError(null);
    setBannerFile(file);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerPreview(URL.createObjectURL(file));
  };

  const currentBanner = bannerPreview || banner;
  const currentPicture = picturePreview || picture;

  return (
    <div className="screen active" data-screen="profile-edit">
      <div className="setup-header">
        <BackButton onClick={() => go('settings-profile', 'back')} disabled={busy} />
        <h2>{t('mobile.settings.editProfile')}</h2>
        <button
          className="setup-skip save-action"
          onClick={() => void save()}
          disabled={!nameValid || busy}
          data-testid="save-profile"
        >
          {saving ? t('common.saving') : uploadingAvatar || uploadingBanner ? t('common.uploading') : t('common.save')}
        </button>
      </div>
      <div className="setup-body edit-profile-body">
        {error && <div className="edit-error" role="alert">{error}</div>}

        <button
          type="button"
          className={`edit-banner-tap ${currentBanner ? '' : 'empty'} ${uploadingBanner ? 'uploading' : ''}`}
          onClick={() => bannerInputRef.current?.click()}
          aria-label={t('mobile.settings.changeBannerImage')}
          data-testid="edit-banner-tap"
        >
          {currentBanner && <RemoteImage src={currentBanner} alt="" />}
          <div className="edit-banner-overlay">
            {uploadingBanner ? (
              <span className="edit-uploading-spinner" aria-hidden="true" />
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>{currentBanner ? t('mobile.settings.changeBanner') : t('mobile.settings.addBanner')}</span>
              </>
            )}
          </div>
          <FileInput
            ref={bannerInputRef}
            accept="image/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickBanner(f); e.target.value = ''; }}
          />
        </button>

        <div className="edit-avatar-row">
          <button
            type="button"
            className={`edit-avatar-tap ${currentPicture ? '' : 'empty'} ${uploadingAvatar ? 'uploading' : ''}`}
            onClick={() => avatarInputRef.current?.click()}
            aria-label={t('mobile.settings.changeProfilePicture')}
            data-testid="edit-avatar-tap"
          >
            <NameAvatar pubkey={myPubkey ?? ''} name={name} picture={currentPicture} size={88} className="me-avatar" />
            <div className="edit-avatar-overlay">
              {uploadingAvatar ? (
                <span className="edit-uploading-spinner" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </div>
            <FileInput
              ref={avatarInputRef}
              accept="image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickAvatar(f); e.target.value = ''; }}
            />
          </button>
          <div className="edit-avatar-tip">
            {t('mobile.settings.uploadTip')}
          </div>
        </div>

        <div className="edit-fields">
          <div className="setup-field">
            <label htmlFor={nameId}>{t('mobile.settings.displayName')}</label>
            <div className="setup-input-wrap">
              <Input
                variant="mobile"
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('mobile.settings.yourName')}
                maxLength={50}
                data-testid="edit-name"
              />
            </div>
          </div>
          <div className="setup-field">
            <label htmlFor={aboutId}>{t('shell.user.about')}</label>
            <TextArea
              variant="mobile"
              id={aboutId}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder={t('mobile.settings.aboutPlaceholder')}
              maxLength={500}
              rows={3}
              data-testid="edit-about"
            />
          </div>
          <div className="setup-field">
            <label htmlFor={nip05Id}>NIP-05</label>
            <div className="setup-input-wrap">
              <Input
                variant="mobile"
                id={nip05Id}
                value={nip05}
                onChange={(e) => setNip05(e.target.value)}
                placeholder="you@domain.com"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
          </div>
          <div className="setup-field">
            <label htmlFor={lud16Id}>{t('mobile.settings.lightningAddress')}</label>
            <div className="setup-input-wrap">
              <Input
                variant="mobile"
                id={lud16Id}
                value={lud16}
                onChange={(e) => setLud16(e.target.value)}
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
            <label htmlFor={pictureId}>{t('shell.user.field.picture')}</label>
            <div className="setup-input-wrap">
              <Input
                variant="mobile"
                id={pictureId}
                value={pictureFile ? '' : picture}
                onChange={(e) => {
                  setPictureFile(null);
                  if (picturePreview) { URL.revokeObjectURL(picturePreview); setPicturePreview(null); }
                  setPicture(e.target.value);
                }}
                placeholder={pictureFile ? t('settings.profileAppearance.fileSelected') : 'https://…'}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                data-testid="edit-picture-url"
              />
            </div>
          </div>
          <div className="setup-field">
            <label htmlFor={bannerId}>{t('shell.user.field.banner')}</label>
            <div className="setup-input-wrap">
              <Input
                variant="mobile"
                id={bannerId}
                value={bannerFile ? '' : banner}
                onChange={(e) => {
                  setBannerFile(null);
                  if (bannerPreview) { URL.revokeObjectURL(bannerPreview); setBannerPreview(null); }
                  setBanner(e.target.value);
                }}
                placeholder={bannerFile ? t('settings.profileAppearance.fileSelected') : 'https://…'}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                data-testid="edit-banner-url"
              />
            </div>
          </div>
          <div className="setup-field">
            <label htmlFor={websiteId}>{t('shell.user.field.website')}</label>
            <div className="setup-input-wrap">
              <Input
                variant="mobile"
                id={websiteId}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
          </div>
        </div>
      </div>
      <div className="setup-actions">
        <button
          className="btn-primary"
          onClick={() => void save()}
          disabled={!nameValid || busy}
        >
          {saving ? t('common.saving') : uploadingAvatar || uploadingBanner ? t('common.uploading') : t('mobile.settings.saveChanges')}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 17 - settings · preferences
