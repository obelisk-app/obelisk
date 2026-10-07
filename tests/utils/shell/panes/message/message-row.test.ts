import { describe, expect, it } from 'vitest';
import { isInteractiveClick, pickedEmojiTags } from '@/utils/shell/panes/message/message-row';

describe('isInteractiveClick', () => {
  it('is true inside a link, a button, a field or a data-no-msg-menu element', () => {
    document.body.innerHTML = '<div id="body"><span id="text">x</span><a href="#"><b id="link">l</b></a>'
      + '<button id="btn"></button><input id="in" /><textarea id="ta"></textarea><div data-no-msg-menu><i id="marked"></i></div></div>';
    const el = (id: string) => document.getElementById(id)!;
    expect(isInteractiveClick(el('text'))).toBe(false);
    expect(isInteractiveClick(el('body'))).toBe(false);
    for (const id of ['link', 'btn', 'in', 'ta', 'marked']) expect(isInteractiveClick(el(id))).toBe(true);
  });
});

describe('pickedEmojiTags', () => {
  it('maps a custom emoji to its tag and leaves unicode alone', () => {
    expect(pickedEmojiTags({ name: 'cat', url: 'https://x.test/c.png' })).toEqual({ cat: 'https://x.test/c.png' });
    expect(pickedEmojiTags(undefined)).toBeUndefined();
  });
});
