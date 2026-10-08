export type ProfileImageTarget = 'picture' | 'banner';

export type ProfileAppearanceValue = {
  pictureUrl: string;
  bannerUrl: string;
  pictureFile: File | null;
  bannerFile: File | null;
};

/** The value with a file staged for one target (uploaded on save). */
export function withPickedFile(value: ProfileAppearanceValue, target: ProfileImageTarget, file: File): ProfileAppearanceValue {
  return target === 'picture' ? { ...value, pictureFile: file } : { ...value, bannerFile: file };
}

/**
 * The value with a typed URL for one target. Typing supersedes a staged
 * file: otherwise save() would upload the file and silently ignore what the
 * person just typed.
 */
export function withTypedUrl(value: ProfileAppearanceValue, target: ProfileImageTarget, url: string): ProfileAppearanceValue {
  return target === 'picture'
    ? { ...value, pictureUrl: url, pictureFile: null }
    : { ...value, bannerUrl: url, bannerFile: null };
}
