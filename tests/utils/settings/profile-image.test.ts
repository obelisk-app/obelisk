import { profileImageProblem } from '@/utils/identity/profile-image';
import { describe, expect, it } from 'vitest';
import { withPickedFile, withTypedUrl } from '@/utils/settings/profile-image';
import { MAX_IMAGE_BYTES } from '@/constants/attachments/attachments-limits';

const file = (type: string, size: number) => {
  const f = new File(['x'], 'f', { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const EMPTY = { pictureUrl: 'p', bannerUrl: 'b', pictureFile: null, bannerFile: null };

describe('profile image helpers', () => {
  it('profileImageProblem refuses a non-image and an oversized image', () => {
    expect(profileImageProblem(file('image/png', 10))).toBeNull();
    expect(profileImageProblem(file('text/plain', 10))).toBe('not-image');
    expect(profileImageProblem(file('image/png', MAX_IMAGE_BYTES + 1))).toBe('too-large');
    expect(profileImageProblem(file('image/png', MAX_IMAGE_BYTES))).toBeNull();
  });

  it('stages a picked file on its own target', () => {
    const f = file('image/png', 1);
    expect(withPickedFile(EMPTY, 'picture', f)).toEqual({ ...EMPTY, pictureFile: f });
    expect(withPickedFile(EMPTY, 'banner', f)).toEqual({ ...EMPTY, bannerFile: f });
  });

  it('a typed URL replaces the staged file of its target only', () => {
    const f = file('image/png', 1);
    const staged = { ...EMPTY, pictureFile: f, bannerFile: f };
    expect(withTypedUrl(staged, 'picture', 'https://x/p.png')).toEqual({ ...staged, pictureUrl: 'https://x/p.png', pictureFile: null });
    expect(withTypedUrl(staged, 'banner', 'https://x/b.png')).toEqual({ ...staged, bannerUrl: 'https://x/b.png', bannerFile: null });
  });
});
