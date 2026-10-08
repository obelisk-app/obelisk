'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { profileImageProblem } from '@/utils/identity/profile-image';
import { takePickedFile } from '@/utils/media/upload/picked-file';
import {
  withPickedFile, withTypedUrl, type ProfileAppearanceValue, type ProfileImageTarget,
} from '@/utils/settings/profile-image';

type Previews = Record<ProfileImageTarget, string | null>;

/**
 * The profile header editor's view model: a picked file is checked, shown
 * from an object URL and staged on the value (uploaded on save, so an
 * abandoned edit burns no Blossom storage); a typed URL replaces it.
 */
export function useProfileAppearanceEditor(value: ProfileAppearanceValue, onChange: (next: ProfileAppearanceValue) => void) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Previews>({ picture: null, banner: null });

  // Object URLs leak until revoked, and a person can swap the image many
  // times before saving.
  useEffect(() => () => {
    if (previews.picture) URL.revokeObjectURL(previews.picture);
    if (previews.banner) URL.revokeObjectURL(previews.banner);
  }, [previews.picture, previews.banner]);

  const replacePreview = (target: ProfileImageTarget, next: string | null) => {
    setPreviews((current) => {
      const old = current[target];
      if (old) URL.revokeObjectURL(old);
      return { ...current, [target]: next };
    });
  };

  const pick = (target: ProfileImageTarget, file: File | undefined) => {
    if (!file) return;
    const problem = profileImageProblem(file);
    if (problem) {
      setError(t(problem === 'not-image' ? 'settings.profileAppearance.notImage' : 'settings.profileAppearance.tooLarge'));
      return;
    }
    setError(null);
    replacePreview(target, URL.createObjectURL(file));
    onChange(withPickedFile(value, target, file));
  };

  const setUrl = (target: ProfileImageTarget, url: string) => {
    replacePreview(target, null);
    onChange(withTypedUrl(value, target, url));
  };

  return {
    error,
    bannerSrc: previews.banner || value.bannerUrl,
    pictureSrc: previews.picture || value.pictureUrl,
    picked: (target: ProfileImageTarget, input: HTMLInputElement) => pick(target, takePickedFile(input)),
    setUrl,
  };
}
