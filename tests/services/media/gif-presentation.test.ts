import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectGifPresentation } from '@/services/media/gif-presentation';
import { inspectRuntimeCaches, invalidateRuntimeCaches } from '@/services/local-data/runtime-caches';

const images: HTMLImageElement[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  invalidateRuntimeCaches({ scope: 'account' });
  images.length = 0;
  vi.stubGlobal('Image', class {
    constructor() {
      const image = document.createElement('img');
      images.push(image);
      return image;
    }
  });
});
afterEach(() => {
  invalidateRuntimeCaches({ scope: 'account' });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GIF presentation cache', () => {
  it('shares work and cancels pending images on account invalidation', async () => {
    const old = detectGifPresentation('https://cdn.example/a.gif');
    expect(detectGifPresentation('https://cdn.example/a.gif')).toBe(old);
    invalidateRuntimeCaches({ scope: 'account' });
    expect(await old).toBe('gif');
    expect(images[0].onload).toBeNull();
    expect(images[0].hasAttribute('src')).toBe(false);
    const current = detectGifPresentation('https://cdn.example/a.gif');
    expect(current).not.toBe(old);
    expect(images).toHaveLength(2);
  });

  it('bounds cached work and resolves timed-out images', async () => {
    const oldest = detectGifPresentation('https://cdn.example/0.gif');
    for (let i = 1; i <= 500; i++) void detectGifPresentation(`https://cdn.example/${i}.gif`);
    expect(await oldest).toBe('gif');
    expect(images[0].hasAttribute('src')).toBe(false);
    expect(inspectRuntimeCaches().find((cache) => cache.id === 'gif-presentation')?.entries).toBe(500);
    const pending = detectGifPresentation('https://cdn.example/500.gif');
    vi.advanceTimersByTime(10_000);
    expect(await pending).toBe('gif');
    expect(images[500].onerror).toBeNull();
  });

  it('does not load non-GIF assets', async () => {
    expect(await detectGifPresentation('https://cdn.example/a.png')).toBe('emoji');
    expect(images).toHaveLength(0);
  });
});
