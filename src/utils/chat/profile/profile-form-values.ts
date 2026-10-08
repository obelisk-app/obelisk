import type { ProfileAppearanceValue } from '@/utils/settings/profile-image';

/** A kind 0 profile as the editor reads it (any field may be missing). */
export interface ProfileEditorInitial {
  readonly displayName?: string | null;
  readonly name?: string | null;
  readonly about?: string | null;
  readonly picture?: string | null;
  readonly banner?: string | null;
  readonly nip05?: string | null;
  readonly lud16?: string | null;
  readonly website?: string | null;
}

/** The profile editor's fields: the seven kind 0 texts and the picked picture and banner files (uploaded on save). */
export type ProfileFormValues = {
  name: string;
  about: string;
  picture: string;
  banner: string;
  nip05: string;
  lud16: string;
  website: string;
  pictureFile: File | null;
  bannerFile: File | null;
};

/** The editor's starting values from a profile, or blank ones before it has arrived. The name is the display name, else the name. */
export function profileFormValues(initial: ProfileEditorInitial | null): ProfileFormValues {
  return {
    name: initial?.displayName || initial?.name || '',
    about: initial?.about || '',
    picture: initial?.picture || '',
    banner: initial?.banner || '',
    nip05: initial?.nip05 || '',
    lud16: initial?.lud16 || '',
    website: initial?.website || '',
    pictureFile: null,
    bannerFile: null,
  };
}

/** The picture and banner as the appearance editor holds them. */
export function profileAppearance(values: ProfileFormValues): ProfileAppearanceValue {
  return { pictureUrl: values.picture, bannerUrl: values.banner, pictureFile: values.pictureFile, bannerFile: values.bannerFile };
}

/** The appearance editor's change, as the fields it sets. */
export function profileAppearancePatch(next: ProfileAppearanceValue): Partial<ProfileFormValues> {
  return { picture: next.pictureUrl, banner: next.bannerUrl, pictureFile: next.pictureFile, bannerFile: next.bannerFile };
}
