import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { draftAfterPick, dmTextTags, filesFromClipboard, nextId } from '@/components/chat/dm-composer/pending';
import { usePreviewUrls } from '@/components/chat/dm-composer/usePreviewUrls';

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

describe('usePreviewUrls', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('revokes released URLs at once and the rest on unmount', () => {
    let n = 0;
    const createObjectURL = vi.fn(() => `blob:${n++}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const { result, unmount } = renderHook(() => usePreviewUrls());
    const a = result.current.preview(new Blob(['a']));
    const b = result.current.preview(new Blob(['b']));
    result.current.release(a);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:0');
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith(b);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('returns null when the browser refuses an object URL', () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => { throw new Error('no'); }, revokeObjectURL: vi.fn() }));
    const { result } = renderHook(() => usePreviewUrls());
    expect(result.current.preview(new Blob(['a']))).toBeNull();
  });
});
