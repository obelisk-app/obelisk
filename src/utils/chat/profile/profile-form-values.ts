import type { ProfileAppearanceValue } from '@/utils/settings/profile-image';

import type { ProfileEditorInitial, ProfileFormValues } from '@/types/session/profile';
export type { ProfileEditorInitial, ProfileFormValues } from '@/types/session/profile';

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
