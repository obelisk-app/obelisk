import { describe, expect, it } from 'vitest';
import { emojiPickerClasses } from '@/utils/chat/picker/emoji-picker-classes';
import { sectionEmojis } from '@/utils/chat/picker/emoji-sections';
import { EMOJI_SECTIONS } from '@/constants/chat/picker';
import { EMOJI_CATEGORIES } from '@/lib/emoji';

describe('emojiPickerClasses', () => {
  it('positions the popover by placement and alignment, and sizes the grid by columns', () => {
    const popover = emojiPickerClasses({ placement: 'below', align: 'left' });
    expect(popover.isSheet).toBe(false);
    expect(popover.containerClass).toContain('left-0');
    expect(popover.containerClass).toContain('top-full');
    expect(emojiPickerClasses({ variant: 'floating' }).containerClass.startsWith('flex h-[430px]')).toBe(true);
    expect(emojiPickerClasses({ variant: 'sheet' }).gridClass).toBe('grid grid-cols-7 gap-1.5');
    expect(emojiPickerClasses({ columns: 12 }).gridClass).toBe('grid grid-cols-12 gap-0.5');
  });
});

describe('sectionEmojis', () => {
  it('joins a section\'s categories in order', () => {
    const smileys = EMOJI_SECTIONS[0];
    expect(sectionEmojis(smileys)).toEqual([...EMOJI_CATEGORIES.Smileys, ...EMOJI_CATEGORIES.Gestures]);
  });
  it('skips a category the emoji set does not have', () => {
    expect(sectionEmojis({ categories: ['Nope'] })).toEqual([]);
  });
});
