import { describe, expect, it } from 'vitest';
import { mergePackItems } from '@/utils/media/library/pack-utils';

describe('mergePackItems', () => {
  it('retains destination metadata and makes repeated merges idempotent', () => {
    const destination = [{ name: 'first', url: 'https://example.com/a', kind: 'emoji' as const }];
    const source = [{ name: 'other', url: 'https://example.com/a', kind: 'sticker' as const },
      { name: 'first', url: 'https://example.com/b', kind: 'sticker' as const }];
    const merged = mergePackItems(destination, source);
    expect(merged).toEqual([destination[0], { ...source[1], name: 'first_2' }]);
    expect(mergePackItems(merged, source)).toEqual(merged);
    expect(source[1].name).toBe('first');
  });
  it('preserves distinct query strings', () => {
    const items = ['a', 'b'].map((value) => ({ name: value, url: `https://example.com/image?v=${value}`, kind: 'emoji' as const }));
    expect(mergePackItems([], items)).toHaveLength(2);
  });
  it('keeps suffixed shortcodes inside the protocol length limit', () => {
    const name = 'x'.repeat(64);
    const items = mergePackItems([], [
      { name, url: 'https://example.com/a', kind: 'emoji' },
      { name, url: 'https://example.com/b', kind: 'sticker' },
    ]);
    expect(items[1].name).toHaveLength(64);
    expect(items[1].name).toMatch(/_2$/);
    expect(items[0].name).not.toBe(items[1].name);
  });

});
