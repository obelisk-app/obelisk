import { describe, expect, it } from 'vitest';
import { profileImageProblem } from '@/utils/identity/profile-image';

describe('profileImageProblem', () => {
  it('accepts an image of up to 10 MB', () => {
    expect(profileImageProblem({ type: 'image/png', size: 1 })).toBeNull();
    expect(profileImageProblem({ type: 'image/webp', size: 10 * 1024 * 1024 })).toBeNull();
  });

  it('refuses anything that is not an image', () => {
    expect(profileImageProblem({ type: 'text/plain', size: 1 })).toBe('not-image');
    expect(profileImageProblem({ type: '', size: 1 })).toBe('not-image');
  });

  it('refuses an image over 10 MB', () => {
    expect(profileImageProblem({ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 })).toBe('too-large');
  });

  it('reports the type before the size', () => {
    expect(profileImageProblem({ type: 'video/mp4', size: 99 * 1024 * 1024 })).toBe('not-image');
  });
});
