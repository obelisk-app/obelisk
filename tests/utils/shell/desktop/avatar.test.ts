import { describe, expect, it } from 'vitest';
import { avatarHue } from '@/utils/shell/desktop/avatar';

describe('desktop avatar helpers', () => {
  it('derives the hue from the first 24 bits of the key', () => {
    expect(avatarHue('000000ff')).toBe(0);
    expect(avatarHue('0001ff' + 'a'.repeat(58))).toBe(0x1ff % 360);
    expect(avatarHue('ffffff')).toBe(0xffffff % 360);
  });
});
