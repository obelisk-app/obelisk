import { describe, expect, it } from 'vitest';
import { completeHexColor } from '@/utils/settings/appearance-color';

describe('completeHexColor', () => {
  it('takes a whole #rrggbb, lowercased, and nothing else', () => {
    expect(completeHexColor('#ABCDEF')).toBe('#abcdef');
    expect(completeHexColor('#12')).toBeNull();
    expect(completeHexColor('abcdef')).toBeNull();
    expect(completeHexColor('#abcdefg')).toBeNull();
    expect(completeHexColor('#ggggggg'.slice(0, 7))).toBeNull();
  });
});
