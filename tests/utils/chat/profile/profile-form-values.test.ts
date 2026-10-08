import { describe, expect, it } from 'vitest';
import { profileAppearance, profileAppearancePatch, profileFormValues } from '@/utils/chat/profile/profile-form-values';

const INITIAL = { displayName: 'Ana', name: 'ana', about: 'hi', picture: 'p.png', banner: null, nip05: null, lud16: null, website: null };

describe('profile form values', () => {
  it('starts from the display name, else the name, with every missing field blank', () => {
    expect(profileFormValues(INITIAL)).toMatchObject({ name: 'Ana', about: 'hi', picture: 'p.png', banner: '', nip05: '', pictureFile: null });
    expect(profileFormValues({ ...INITIAL, displayName: '' }).name).toBe('ana');
    expect(profileFormValues(null).name).toBe('');
  });

  it('reads the picture and banner as one appearance value and fans changes back out', () => {
    expect(profileAppearance(profileFormValues(INITIAL))).toEqual({ pictureUrl: 'p.png', bannerUrl: '', pictureFile: null, bannerFile: null });
    const file = new File(['x'], 'b.png', { type: 'image/png' });
    expect(profileAppearancePatch({ pictureUrl: '', bannerUrl: 'b.png', pictureFile: null, bannerFile: file }))
      .toEqual({ picture: '', banner: 'b.png', pictureFile: null, bannerFile: file });
  });
});
