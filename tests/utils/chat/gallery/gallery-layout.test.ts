import { describe, expect, it } from 'vitest';
import { galleryLayout, mediaGridTiles } from '@/utils/chat/gallery/gallery-layout';
import { FEATURE_EVERY } from '@/constants/chat/gallery';

const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://x/${i}.jpg`);

describe('galleryLayout', () => {
  it('two images: one row at 2:1', () => {
    const l = galleryLayout(urls(2));
    expect(l.gridClass).toBe('grid-cols-2 grid-rows-1');
    expect(l.aspectRatio).toBe('2 / 1');
    expect(l.tiles.map((t) => t.index)).toEqual([0, 1]);
  });

  it('three images: square, the first tile across both rows', () => {
    const l = galleryLayout(urls(3));
    expect(l.gridClass).toBe('grid-cols-2 grid-rows-2');
    expect(l.aspectRatio).toBe('1 / 1');
    expect(l.tiles.map((t) => t.spanClass)).toEqual(['row-span-2', '', '']);
  });

  it('six images: four tiles, the fourth carries +2, keys are unique even for repeated urls', () => {
    const l = galleryLayout(['a', 'a', 'b', 'c', 'd', 'e']);
    expect(l.tiles).toHaveLength(4);
    expect(l.tiles.map((t) => t.more)).toEqual([0, 0, 0, 2]);
    expect(new Set(l.tiles.map((t) => t.key)).size).toBe(4);
  });

  it('exactly four: nothing more to show', () => {
    expect(galleryLayout(urls(4)).tiles.every((t) => t.more === 0)).toBe(true);
  });
});

describe('mediaGridTiles', () => {
  it('features every Nth tile except the first, and marks videos', () => {
    const items = Array.from({ length: FEATURE_EVERY * 2 + 1 }, (_, i) => ({ key: String(i), url: i === 1 ? 'https://x/v.mp4' : `https://x/${i}.jpg` }));
    const tiles = mediaGridTiles(items);
    expect(tiles.filter((t) => t.featured).map((t) => t.item.key)).toEqual([String(FEATURE_EVERY), String(FEATURE_EVERY * 2)]);
    expect(tiles[1].video).toBe(true);
    expect(tiles[0].video).toBe(false);
  });
});
