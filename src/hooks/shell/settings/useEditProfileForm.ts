'use client';

import { useEffect, useRef } from 'react';
import { useProfileEditorForm, type ProfileEditorInitial } from '@/hooks/chat/profile/useProfileEditorForm';
import type { ProfileAppearanceValue } from '@/utils/settings/profile-image';

/**
 * The desktop profile editor: the shared profile form, the name field
 * focused on open, and the picture/banner editor's changes fanned out to
 * their four fields.
 */
export function useEditProfileForm(initial: ProfileEditorInitial | null, onSaved: () => void) {
  const form = useProfileEditorForm(initial, onSaved);
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => { firstField.current?.focus(); }, []);
  return {
    ...form,
    firstField,
    appearance: { pictureUrl: form.picture, bannerUrl: form.banner, pictureFile: form.pictureFile, bannerFile: form.bannerFile },
    setAppearance: (next: ProfileAppearanceValue) => {
      form.setPicture(next.pictureUrl);
      form.setBanner(next.bannerUrl);
      form.setPictureFile(next.pictureFile);
      form.setBannerFile(next.bannerFile);
    },
    saveProfile: () => void form.save(),
  };
}
