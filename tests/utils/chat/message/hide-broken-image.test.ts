import { describe, expect, it } from 'vitest';
import { hideBrokenImage } from '@/utils/chat/message/hide-broken-image';

describe('hideBrokenImage', () => {
  it('hides the image that failed', () => {
    const img = document.createElement('img');
    hideBrokenImage({ target: img } as unknown as React.SyntheticEvent<HTMLImageElement>);
    expect(img.style.display).toBe('none');
  });
});
