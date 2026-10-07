import { describe, expect, it } from 'vitest';
import { clampMenuPosition, subMenuShift, MUTE_OPTIONS, NOTIFY_OPTIONS } from '@/utils/chat/channel/channel-menu-options';
import { MUTED_FOREVER } from '@/store/chat/channel-prefs';

describe('clampMenuPosition', () => {
  it('leaves a menu that fits where it was opened', () => {
    expect(clampMenuPosition(100, 100, 240, 300, 1280, 800)).toEqual({ left: 100, top: 100, flipSub: false });
  });

  it('pulls a menu back inside the right and bottom edges, 8px in', () => {
    expect(clampMenuPosition(1200, 700, 240, 300, 1280, 800)).toEqual({ left: 1032, top: 492, flipSub: true });
  });

  it('never goes above or left of 8px', () => {
    const out = clampMenuPosition(-50, -50, 240, 900, 1280, 800);
    expect(out.left).toBe(8);
    expect(out.top).toBe(8);
  });

  it('flips submenus when there is no room for one to the right', () => {
    expect(clampMenuPosition(900, 100, 240, 300, 1280, 800).flipSub).toBe(true);
    expect(clampMenuPosition(700, 100, 240, 300, 1280, 800).flipSub).toBe(false);
  });
});

describe('subMenuShift', () => {
  it('is 0 when the submenu fits', () => {
    expect(subMenuShift(100, 400, 800)).toBe(0);
  });

  it('slides up by the overflow, but not past the top edge', () => {
    expect(subMenuShift(600, 900, 800)).toBe(-108);
    expect(subMenuShift(50, 900, 800)).toBe(-42);
  });
});

describe('menu options', () => {
  it('ends the mute choices with "until I turn it back on" and offers three notify levels', () => {
    expect(MUTE_OPTIONS.at(-1)?.ms).toBe(MUTED_FOREVER);
    expect(NOTIFY_OPTIONS.map((o) => o.level)).toEqual(['all', 'mentions', 'nothing']);
  });
});
