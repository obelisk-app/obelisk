import { describe, expect, it } from 'vitest';
import { tagValue } from '@/utils/social/note-tags';

describe('tagValue', () => {
  it('reads the first tag of a name', () => {
    expect(tagValue({ tags: [['r', 'https://a'], ['r', 'https://b']] }, 'r')).toBe('https://a');
    expect(tagValue({ tags: [['m']] }, 'm')).toBeUndefined();
    expect(tagValue({ tags: [] }, 'url')).toBeUndefined();
  });
});
