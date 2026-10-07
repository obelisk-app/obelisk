import { describe, expect, it } from 'vitest';
import { EMPTY_REACTIONS, reactionsFor, replyParentOf } from '@/utils/shell/mobile/channel-timeline';
import { replyPreviewText } from '@/utils/shell/mobile/labels';

describe('the phone timeline row props', () => {
  const parent: { id: string; replyToId: string | null } = { id: 'p', replyToId: null };
  const byId = new Map([['p', parent]]);

  it('finds the same parent object from the lookup, or null', () => {
    expect(replyParentOf({ id: 'r', replyToId: 'p' }, byId)).toBe(parent);
    expect(replyParentOf({ id: 'r', replyToId: 'gone' }, byId)).toBeNull();
    expect(replyParentOf({ id: 'r', replyToId: null }, byId)).toBeNull();
  });

  it('hands every reactionless message the one shared empty list', () => {
    const list = [{ id: 'x' }];
    expect(reactionsFor({ m: list }, 'm')).toBe(list);
    expect(reactionsFor({}, 'n')).toBe(EMPTY_REACTIONS);
    expect(reactionsFor({}, 'o')).toBe(reactionsFor({}, 'n'));
  });
});

describe('replyPreviewText', () => {
  it('folds whitespace and cuts at 120 characters', () => {
    expect(replyPreviewText('a\n\n b\tc')).toBe('a b c');
    expect(replyPreviewText('y'.repeat(130))).toHaveLength(120);
  });
});
