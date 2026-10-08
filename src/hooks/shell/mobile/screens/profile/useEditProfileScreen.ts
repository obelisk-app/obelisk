'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useMyPubkey, useSessionProfile, useSessionGeneration } from '@/hooks/session/useSession';
import { useProfileEditorForm } from '@/hooks/session/useProfileEditorForm';
import type { ScreenName } from '@/utils/shell/mobile/url-state';
import { profileImageProblem } from '@/utils/identity/profile-image';
import { takePickedFile } from '@/utils/media/upload/picked-file';

type Go = (s: ScreenName, dir?: 'forward' | 'back') => void;
type PreviewSetter = (url: string | null) => void;
type Image = 'picture' | 'banner';

/**
 * The phone's profile editor (`mobile/screens/profile/EditProfileScreen.tsx`): the
 * kind 0 form from `useProfileEditorForm`, plus what only the phone has, the
 * tap-to-pick banner and avatar with object-URL previews. A picked file and
 * a typed URL replace each other, so save() never uploads a file while
 * silently ignoring what was typed.
 */
export function useEditProfileScreen(go: Go) {
  const t = useTranslations();
  const myPubkey = useMyPubkey();
  const generation = useSessionGeneration();
  const meta = useSessionProfile();
  const goBack = () => go('settings-profile', 'back');
  const form = useProfileEditorForm(meta, goBack);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const [previewAccount, setPreviewAccount] = useState({ pubkey: myPubkey, generation });
  if (previewAccount.pubkey !== myPubkey || previewAccount.generation !== generation) {
    setPreviewAccount({ pubkey: myPubkey, generation });
    setPicturePreview(null);
    setBannerPreview(null);
  }

  // Each preview's object URL is revoked when it is replaced or cleared, and
  // on unmount; one effect per preview, so picking an avatar never revokes
  // the banner still on screen (one shared effect used to revoke both).
  useEffect(() => () => { if (picturePreview) URL.revokeObjectURL(picturePreview); }, [picturePreview]);
  useEffect(() => () => { if (bannerPreview) URL.revokeObjectURL(bannerPreview); }, [bannerPreview]);

  const pick = (file: File, image: Image, setPreview: PreviewSetter) => {
    const problem = profileImageProblem(file);
    if (problem === 'not-image') { form.setError(t('mobile.settings.imageOnly')); return; }
    if (problem === 'too-large') { form.setError(t('mobile.settings.imageTooLarge')); return; }
    form.setError(null);
    form.set(image === 'picture' ? 'pictureFile' : 'bannerFile', file);
    setPreview(URL.createObjectURL(file));
  };
  const fromInput = (onFile: (file: File) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = takePickedFile(e.target);
    if (file) onFile(file);
  };
  const typed = (image: Image, setPreview: PreviewSetter) =>
    (value: string) => {
      setPreview(null);
      form.setValues(image === 'picture' ? { picture: value, pictureFile: null } : { banner: value, bannerFile: null });
    };
  const text = (name: 'name' | 'about' | 'nip05' | 'lud16' | 'website') => (value: string) => form.set(name, value);
  const { values } = form;

  const uploadingAvatar = form.uploading === 'picture';
  const uploadingBanner = form.uploading === 'banner';

  return {
    myPubkey: myPubkey ?? '',
    name: values.name,
    about: values.about,
    nip05: values.nip05,
    lud16: values.lud16,
    website: values.website,
    setName: text('name'),
    setAbout: text('about'),
    setNip05: text('nip05'),
    setLud16: text('lud16'),
    setWebsite: text('website'),
    /** The URL fields read empty while a picked file stands in for them. */
    pictureUrl: values.pictureFile ? '' : values.picture,
    bannerUrl: values.bannerFile ? '' : values.banner,
    pictureFilePicked: values.pictureFile !== null,
    bannerFilePicked: values.bannerFile !== null,
    setPictureUrl: typed('picture', setPicturePreview),
    setBannerUrl: typed('banner', setBannerPreview),
    onPictureFile: fromInput((file) => pick(file, 'picture', setPicturePreview)),
    onBannerFile: fromInput((file) => pick(file, 'banner', setBannerPreview)),
    /** What the avatar and banner show: the picked file's preview, else the URL. */
    currentPicture: picturePreview || values.picture,
    currentBanner: bannerPreview || values.banner,
    uploadingAvatar,
    uploadingBanner,
    busy: form.busy,
    error: form.error,
    saveDisabled: !form.nameValid || form.busy,
    /** The save buttons' label while busy, `null` when idle. */
    busyLabel: form.submitting ? t('common.saving') : uploadingAvatar || uploadingBanner ? t('common.uploading') : null,
    save: () => { void form.submit(); },
    goBack,
  };
}

export type EditProfileScreenModel = ReturnType<typeof useEditProfileScreen>;
