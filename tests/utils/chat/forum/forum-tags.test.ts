import { describe, expect, it } from 'vitest';
import { newForumTagId, removeTagAt, tagEmojiValue, threadTagChoice, toggleThreadTag, updateTagAt, withNewTag } from '@/utils/chat/forum/forum-tags';
import { MAX_FORUM_TAGS } from '@/constants/chat/forum';

const tag = (id: string) => ({ id, name: id, emoji: null, color: null });

describe('forum tag list helpers', () => {
  it('mints an 8-character slug', () => {
    expect(newForumTagId()).toMatch(/^[a-z0-9]{1,8}$/);
  });

  it('patches and removes by index without touching the input', () => {
    const tags = [tag('a'), tag('b')];
    expect(updateTagAt(tags, 1, { name: 'B' })[1].name).toBe('B');
    expect(removeTagAt(tags, 0).map((t) => t.id)).toEqual(['b']);
    expect(tags.map((t) => t.name)).toEqual(['a', 'b']);
  });

  it('appends a blank tag until the list is full', () => {
    const next = withNewTag([tag('a')]);
    expect(next).toHaveLength(2);
    expect(next?.[1]).toMatchObject({ name: '', emoji: null, color: null });
    expect(withNewTag(Array.from({ length: MAX_FORUM_TAGS }, (_, i) => tag(String(i))))).toBeNull();
  });

  it('caps an emoji at 4 code units and treats empty as none', () => {
    expect(tagEmojiValue('🌐🌐🌐')).toBe('🌐🌐');
    expect(tagEmojiValue('')).toBeNull();
  });
});

describe('threadTagChoice', () => {
  it('a picked tag stays enabled; an unpicked one locks once the maximum is picked', () => {
    expect(threadTagChoice(['a'], 'a', 2)).toEqual({ active: true, disabled: false });
    expect(threadTagChoice(['a'], 'b', 2)).toEqual({ active: false, disabled: false });
    expect(threadTagChoice(['a', 'c'], 'b', 2)).toEqual({ active: false, disabled: true });
    expect(threadTagChoice(['a', 'c'], 'a', 2)).toEqual({ active: true, disabled: false });
  });
});

describe('toggleThreadTag', () => {
  it('picks up to the maximum and unpicks a picked one', () => {
    expect(toggleThreadTag([], 'a', 2)).toEqual(['a']);
    expect(toggleThreadTag(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
    expect(toggleThreadTag(['a', 'b'], 'a', 2)).toEqual(['b']);
  });
});
