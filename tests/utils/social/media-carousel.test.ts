import { describe, expect, it } from 'vitest';
import { carouselStills, slideAspectRatio, slideAt, wrapIndex } from '@/utils/social/media-carousel';

describe('slideAt', () => {
  it('rounds to the nearest slide and survives a zero-width track', () => {
    expect(slideAt(0, 300)).toBe(0);
    expect(slideAt(160, 300)).toBe(1);
    expect(slideAt(140, 300)).toBe(0);
    expect(slideAt(5, 0)).toBe(5);
  });
});

describe('carouselStills', () => {
  it('keeps the images and drops items typed as video', () => {
    expect(carouselStills([
      { url: 'a.jpg' }, { url: 'b.mp4', mimeType: 'video/mp4' }, { url: 'c.png', mimeType: 'image/png' },
    ])).toEqual(['a.jpg', 'c.png']);
  });

  it('drops a video known only by its extension, as the slide does', () => {
    expect(carouselStills([{ url: 'https://x/clip.mp4' }, { url: 'https://x/a.jpg' }])).toEqual(['https://x/a.jpg']);
  });
});

describe('wrapIndex', () => {
  it('wraps both ways and keeps a closed lightbox closed', () => {
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(1, 1, 3)).toBe(2);
    expect(wrapIndex(null, 1, 3)).toBeNull();
  });
});

describe('slideAspectRatio', () => {
  it('reserves space only with both dimensions', () => {
    expect(slideAspectRatio({ width: 4, height: 3 })).toBe('4/3');
    expect(slideAspectRatio({ width: 4 })).toBeUndefined();
    expect(slideAspectRatio({ width: 0, height: 3 })).toBeUndefined();
  });
});
