export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type ProfileImageProblem = 'not-image' | 'too-large';

/** Why a picked file cannot be a profile picture or banner, or null when it can. */
export function validateImage(file: File): ProfileImageProblem | null {
  if (!file.type.startsWith('image/')) return 'not-image';
  if (file.size > MAX_IMAGE_BYTES) return 'too-large';
  return null;
}

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
