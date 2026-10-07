'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useMyPubkey, useUserMetadata } from '@/services/nostr-bridge';
import { useProfileEditorForm } from '@/hooks/chat/useProfileEditorForm';
import type { ScreenName } from '@/utils/shell/mobile/url-state';
import { profileImageProblem } from '@/utils/identity/profile-image';

type Go = (s: ScreenName, dir?: 'forward' | 'back') => void;
type FileSetter = (file: File | null) => void;
type PreviewSetter = (url: string | null) => void;

/**
 * The phone's profile editor (`mobile/screens/EditProfileScreen.tsx`): the
 * kind 0 form from `useProfileEditorForm`, plus what only the phone has, the
 * tap-to-pick banner and avatar with object-URL previews. A picked file and
 * a typed URL replace each other, so save() never uploads a file while
 * silently ignoring what was typed.
 */
export function useEditProfileScreen(go: Go) {
  const t = useTranslations();
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey);
  const goBack = () => go('settings-profile', 'back');
  const form = useProfileEditorForm(meta, goBack);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  // Each preview's object URL is revoked when it is replaced or cleared, and
  // on unmount; one effect per preview, so picking an avatar never revokes
  // the banner still on screen (one shared effect used to revoke both).
  useEffect(() => () => { if (picturePreview) URL.revokeObjectURL(picturePreview); }, [picturePreview]);
  useEffect(() => () => { if (bannerPreview) URL.revokeObjectURL(bannerPreview); }, [bannerPreview]);

  const pick = (file: File, setFile: FileSetter, setPreview: PreviewSetter) => {
    const problem = profileImageProblem(file);
    if (problem === 'not-image') { form.setError(t('mobile.settings.imageOnly')); return; }
    if (problem === 'too-large') { form.setError(t('mobile.settings.imageTooLarge')); return; }
    form.setError(null);
    setFile(file);
    setPreview(URL.createObjectURL(file));
  };
  const fromInput = (onFile: (file: File) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  };
  const typed = (setFile: FileSetter, setPreview: PreviewSetter, setUrl: (v: string) => void) =>
    (value: string) => {
      setFile(null);
      setPreview(null);
      setUrl(value);
    };

  const uploadingAvatar = form.uploading === 'picture';
  const uploadingBanner = form.uploading === 'banner';

  return {
    myPubkey: myPubkey ?? '',
    name: form.name,
    about: form.about,
    nip05: form.nip05,
    lud16: form.lud16,
    website: form.website,
    setName: form.setName,
    setAbout: form.setAbout,
    setNip05: form.setNip05,
    setLud16: form.setLud16,
    setWebsite: form.setWebsite,
    /** The URL fields read empty while a picked file stands in for them. */
    pictureUrl: form.pictureFile ? '' : form.picture,
    bannerUrl: form.bannerFile ? '' : form.banner,
    pictureFilePicked: form.pictureFile !== null,
    bannerFilePicked: form.bannerFile !== null,
    setPictureUrl: typed(form.setPictureFile, setPicturePreview, form.setPicture),
    setBannerUrl: typed(form.setBannerFile, setBannerPreview, form.setBanner),
    onPictureFile: fromInput((file) => pick(file, form.setPictureFile, setPicturePreview)),
    onBannerFile: fromInput((file) => pick(file, form.setBannerFile, setBannerPreview)),
    /** What the avatar and banner show: the picked file's preview, else the URL. */
    currentPicture: picturePreview || form.picture,
    currentBanner: bannerPreview || form.banner,
    uploadingAvatar,
    uploadingBanner,
    busy: form.busy,
    error: form.error,
    saveDisabled: !form.nameValid || form.busy,
    /** The save buttons' label while busy, `null` when idle. */
    busyLabel: form.saving ? t('common.saving') : uploadingAvatar || uploadingBanner ? t('common.uploading') : null,
    save: () => { void form.save(); },
    goBack,
  };
}

export type EditProfileScreenModel = ReturnType<typeof useEditProfileScreen>;
