import { describe, expect, it } from 'vitest';
import {
  hasReactionRow, quickReactionSlots, reactionPills, zapPillTotal,
} from '@/utils/shell/panes/message/reaction-pills';
import type { GroupedReaction } from '@/utils/message-text/emoji-shortcodes';

const group = (emoji: string, over: Partial<GroupedReaction> = {}): GroupedReaction => ({
  emoji, customEmojis: {}, pubkeys: new Set(['a']), reactionIds: ['r1', 'r2'], myReactionId: null, count: 1, mine: false, ...over,
});

describe('zapPillTotal / hasReactionRow', () => {
  it('a zero or missing zap total is no pill', () => {
    expect(zapPillTotal(null)).toBeNull();
    expect(zapPillTotal({ totalSats: 0 })).toBeNull();
    const z = { totalSats: 21 };
    expect(zapPillTotal(z)).toBe(z);
  });

  it('the row shows for a reaction or a zap', () => {
    expect(hasReactionRow([], null)).toBe(false);
    expect(hasReactionRow([], { totalSats: 0 })).toBe(false);
    expect(hasReactionRow([], { totalSats: 1 })).toBe(true);
    expect(hasReactionRow([group('x')], null)).toBe(true);
  });
});

describe('reactionPills', () => {
  it('a stranger reaction: plain look, "react", no ids to remove', () => {
    const [p] = reactionPills([group('🔥')], new Set(), false);
    expect(p).toMatchObject({ emoji: '🔥', active: false, titleKey: 'shell.desktop.reactions.react', removeIds: undefined });
    expect(p.resolved).toEqual({ kind: 'unicode', char: '🔥' });
  });

  it('your own reaction is lit and offers to remove it', () => {
    const [p] = reactionPills([group('🔥')], new Set(['🔥']), false);
    expect(p).toMatchObject({ active: true, titleKey: 'shell.desktop.reactions.removeOwn', removeIds: undefined });
  });

  it('an admin removes every reaction of the emoji, whoever sent it', () => {
    const [p] = reactionPills([group('🔥')], new Set(['🔥']), true);
    expect(p).toMatchObject({ active: true, titleKey: 'shell.desktop.reactions.removeEveryone', removeIds: ['r1', 'r2'] });
  });

  it('resolves a custom emoji to its image', () => {
    const [p] = reactionPills([group(':cat:', { customEmojis: { cat: 'https://x.test/c.png' } })], new Set(), false);
    expect(p.resolved).toEqual({ kind: 'custom', name: 'cat', url: 'https://x.test/c.png' });
  });
});

describe('quickReactionSlots', () => {
  it('marks the emojis the viewer already sent', () => {
    const slots = quickReactionSlots([{ char: '🔥' }, { char: '⚡' }], new Set(['⚡']));
    expect(slots.map((s) => [s.emoji.char, s.mine])).toEqual([['🔥', false], ['⚡', true]]);
  });
});
