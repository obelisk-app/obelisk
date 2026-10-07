import { describe, expect, it } from 'vitest';
import { groupBadges, groupLabel, groupNodeIndent, wotDistanceTitle } from '@/utils/shell/panes/sidebar/group-node';

describe('groupNodeIndent', () => {
  it('steps in 0.85rem per level past the first', () => {
    expect(groupNodeIndent(0)).toBe('0.5rem');
    expect(groupNodeIndent(1)).toBe('0.5rem');
    expect(groupNodeIndent(3)).toBe('2.2rem');
  });
});

describe('groupLabel', () => {
  it('uses the name, else 12 characters of the id', () => {
    expect(groupLabel({ id: 'x', name: 'general' })).toBe('general');
    expect(groupLabel({ id: 'abcdefghijklmnop', name: null })).toBe('abcdefghijkl');
  });
});

describe('groupBadges', () => {
  const base = { active: false, unfollowed: false, unread: 4, mentions: 1, replies: 2, mentionCards: 0 };

  it('counts unread and mentions plus replies on a row that is not open', () => {
    expect(groupBadges(base)).toEqual({ unread: 4, mentionsOrReplies: 3 });
  });

  it('the open row shows only mention cards still unseen', () => {
    expect(groupBadges({ ...base, active: true, mentionCards: 2 })).toEqual({ unread: 0, mentionsOrReplies: 2 });
  });

  it('an unfollowed channel drops its unread count but keeps mentions', () => {
    expect(groupBadges({ ...base, unfollowed: true })).toEqual({ unread: 0, mentionsOrReplies: 3 });
  });

  it('takes the larger of the counted mentions and the cards', () => {
    expect(groupBadges({ ...base, mentionCards: 9 }).mentionsOrReplies).toBe(9);
  });
});

describe('wotDistanceTitle', () => {
  it('names a distance, including zero, and nothing without one', () => {
    expect(wotDistanceTitle(0)).toBe('WoT 0°');
    expect(wotDistanceTitle(2)).toBe('WoT 2°');
    expect(wotDistanceTitle(null)).toBeUndefined();
    expect(wotDistanceTitle(undefined)).toBeUndefined();
  });
});
