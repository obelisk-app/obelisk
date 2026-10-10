import { describe, expect, it } from 'vitest';
import { draftAfterPick, dmTextTags, filesFromClipboard, nextId } from '@/utils/chat/dm/pending';

describe('DM composer helpers', () => {
  it('mints distinct ids', () => {
    expect(nextId()).not.toBe(nextId());
  });

  it('keeps only the files of a paste', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const items = [
      { kind: 'string', getAsFile: () => null },
      { kind: 'file', getAsFile: () => file },
      { kind: 'file', getAsFile: () => null },
    ] as unknown as DataTransferItem[];
    expect(filesFromClipboard(items)).toEqual([file]);
    expect(filesFromClipboard(undefined)).toEqual([]);
  });

  it('places a pick by kind: sticker replaces, GIF on its own line, emoji appends', () => {
    expect(draftAfterPick('hi', ':stk:', 'sticker')).toBe(':stk:');
    expect(draftAfterPick(' hi ', 'https://g/1.gif', 'gif')).toBe('hi\nhttps://g/1.gif');
    expect(draftAfterPick('  ', 'https://g/1.gif', 'gif')).toBe('https://g/1.gif');
    expect(draftAfterPick('hi', '😀')).toBe('hi😀');
  });

  it('tags custom emoji and keeps only the sticker half of a sticker', () => {
    const sticker = { name: 'cat', url: 'https://x/cat.png' };
    const tags = dmTextTags(':cat:', { cat: 'https://x/cat.png' }, sticker);
    expect(tags.filter((tag) => tag[0] === 'emoji')).toHaveLength(1);
    expect(tags.filter((tag) => tag[0] === 'sticker')).toHaveLength(1);
    expect(dmTextTags('plain', {}, null)).toEqual([]);
  });
});
