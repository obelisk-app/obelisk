import { describe, expect, it } from 'vitest';
import { avatarStyle, nameAvatarStyle, paletteFor } from '@/utils/shell/mobile/avatar-style';

describe('paletteFor', () => {
  it('gives the same seed the same palette every time', () => {
    expect(paletteFor('a'.repeat(64))).toEqual(paletteFor('a'.repeat(64)));
  });

  it('hashes with a 31 multiplier: "a" (97) lands on palette 97 % 6 = 1', () => {
    expect(paletteFor('a')).toEqual({ from: '#a85a78', to: '#ff9ec5', text: '#fff' });
    expect(paletteFor('')).toEqual({ from: '#4a78a8', to: '#7ec8ff', text: '#fff' });
  });
});

describe('avatarStyle', () => {
  it('is a 135deg gradient between the palette colours with its text colour', () => {
    expect(avatarStyle('a')).toEqual({ background: 'linear-gradient(135deg, #a85a78, #ff9ec5)', color: '#fff' });
  });
});

describe('nameAvatarStyle', () => {
  it('sizes the tile and scales the font to 36% of it', () => {
    expect(nameAvatarStyle('a', 50)).toMatchObject({ width: 50, height: 50, fontSize: 18, color: '#fff' });
  });

  it('never goes under a 10px font', () => {
    expect(nameAvatarStyle('a', 20).fontSize).toBe(10);
  });
});
