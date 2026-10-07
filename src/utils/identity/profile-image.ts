import { MAX_IMAGE_BYTES } from '@/utils/attachments/attachments-limits';

/** Why a picked profile picture or banner cannot be used. */
export type ProfileImageProblem = 'not-image' | 'too-large';

/**
 * Check a file picked for the profile picture or banner: it must be an
 * image of at most 10 MB. `null` when it is fine.
 */
export function profileImageProblem(file: Pick<File, 'type' | 'size'>): ProfileImageProblem | null {
  if (!file.type.startsWith('image/')) return 'not-image';
  if (file.size > MAX_IMAGE_BYTES) return 'too-large';
  return null;
}
