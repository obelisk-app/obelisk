import { describe, expect, it } from 'vitest';
import { clipPath, clipPosterPath } from '@/utils/guides/clip-paths';

describe('clip paths', () => {
  it('places the video under the media kit by its full name', () => {
    expect(clipPath('relay/install')).toBe('/media-kit/video/relay/install.mp4');
  });

  it('places the poster with the guide screenshots, prefixed clip- on the last segment only', () => {
    expect(clipPosterPath('relay/install')).toBe('/og/guides/relay/clip-install.jpg');
    expect(clipPosterPath('a/b/c')).toBe('/og/guides/a/b/clip-c.jpg');
  });

  it('leaves a name with no directory alone', () => {
    expect(clipPosterPath('install')).toBe('/og/guides/install.jpg');
  });
});
