import { describe, expect, it } from 'vitest';
import type { SyntheticEvent } from 'react';
import { hideBrokenImage } from '@/utils/media/remote/hide-broken-image';

describe('hideBrokenImage', () => {
  it('hides the image that failed to load', () => {
    const img = document.createElement('img');
    hideBrokenImage({ currentTarget: img } as SyntheticEvent<HTMLImageElement>);
    expect(img.style.display).toBe('none');
  });
});
