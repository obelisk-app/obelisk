import { describe, expect, it } from 'vitest';
import { roleBadgeGlyph, roleEmojiPopoverAnchor } from '@/utils/admin/role-emoji';
import { EMOJI_POPOVER_H, EMOJI_POPOVER_W } from '@/constants/admin/role-emoji';

const VIEW = { width: 1200, height: 900 };

describe('roleEmojiPopoverAnchor', () => {
  it('opens 4px below the button when there is room', () => {
    expect(roleEmojiPopoverAnchor({ left: 100, top: 50, bottom: 80 }, VIEW)).toEqual({ left: 100, top: 84 });
  });

  it('flips above near the bottom of the screen, and never above 8px', () => {
    expect(roleEmojiPopoverAnchor({ left: 100, top: 800, bottom: 830 }, VIEW)).toEqual({ left: 100, top: 800 - EMOJI_POPOVER_H - 4 });
    expect(roleEmojiPopoverAnchor({ left: 100, top: 300, bottom: 330 }, { width: 1200, height: 500 }).top).toBe(8);
  });

  it('keeps 8px inside the left and right edges', () => {
    expect(roleEmojiPopoverAnchor({ left: 1100, top: 50, bottom: 80 }, VIEW).left).toBe(VIEW.width - EMOJI_POPOVER_W - 8);
    expect(roleEmojiPopoverAnchor({ left: -20, top: 50, bottom: 80 }, VIEW).left).toBe(8);
  });
});

describe('roleBadgeGlyph', () => {
  it('takes a unicode emoji without its spaces and refuses a custom one or nothing', () => {
    expect(roleBadgeGlyph('🔥')).toBe('🔥');
    expect(roleBadgeGlyph(' 🛡️ ')).toBe('🛡️');
    expect(roleBadgeGlyph(':custom:')).toBeNull();
    expect(roleBadgeGlyph('')).toBeNull();
  });
});
