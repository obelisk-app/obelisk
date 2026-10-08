import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uploadToBlossom: vi.fn(),
  saveMediaPack: vi.fn(),
}));

vi.mock('@/services/media/blossom', () => ({ uploadToBlossom: mocks.uploadToBlossom }));
vi.mock('@/services/nostr-bridge', () => ({ nostrActions: { saveMediaPack: mocks.saveMediaPack } }));

import { usePackEditor } from '@/hooks/media/library/usePackEditor';
import { LocaleProvider } from '@tests/support/intl';
import type { EditablePack } from '@/types/media/library';

const PACK: EditablePack = { identifier: 'p1', title: ' Cats ', description: '', image: '', items: [] };

function fileList(files: File[]): FileList {
  return files as unknown as FileList;
}

beforeEach(() => {
  mocks.uploadToBlossom.mockReset();
  mocks.saveMediaPack.mockReset().mockResolvedValue(undefined);
});

describe('usePackEditor', () => {
  it('uploads images only, with unique shortcodes in the chosen kind', async () => {
    mocks.uploadToBlossom.mockResolvedValueOnce('https://cdn/a.png').mockResolvedValueOnce('https://cdn/b.png');
    const { result } = renderHook(() => usePackEditor(PACK, 'gif', vi.fn()), { wrapper: LocaleProvider });
    await act(() => result.current.addFiles(fileList([
      new File(['a'], 'cat.png', { type: 'image/png' }),
      new File(['b'], 'cat.png', { type: 'image/png' }),
      new File(['c'], 'notes.txt', { type: 'text/plain' }),
    ])));
    const items = result.current.draft.items;
    expect(items).toHaveLength(2);
    expect(items[0].name).not.toBe(items[1].name);
    expect(items.every((item) => item.kind === 'gif')).toBe(true);
  });

  it('reports a failed upload', async () => {
    mocks.uploadToBlossom.mockRejectedValueOnce(new Error('blossom down'));
    const { result } = renderHook(() => usePackEditor(PACK, 'gif', vi.fn()), { wrapper: LocaleProvider });
    await act(() => result.current.addFiles(fileList([new File(['a'], 'a.png', { type: 'image/png' })])));
    expect(result.current.error).toBe('Upload failed.');
    expect(result.current.busy).toBe(false);
  });

  it('refuses a pack with no name', async () => {
    const { result } = renderHook(() => usePackEditor({ ...PACK, title: '   ' }, 'gif', vi.fn()), { wrapper: LocaleProvider });
    await act(() => result.current.save());
    expect(result.current.error).toBe('Pack name is required.');
    expect(mocks.saveMediaPack).not.toHaveBeenCalled();
  });

  it('refuses a non-HTTP URL and a duplicate shortcode', async () => {
    const { result } = renderHook(() => usePackEditor({
      ...PACK,
      items: [{ name: 'cat', url: 'javascript:alert(1)', kind: 'sticker' }],
    }, 'gif', vi.fn()), { wrapper: LocaleProvider });
    await act(() => result.current.save());
    expect(result.current.error).toMatch(/HTTP\(S\)/);

    const dup = renderHook(() => usePackEditor({
      ...PACK,
      items: [
        { name: 'cat', url: 'https://x/a.png', kind: 'sticker' },
        { name: 'cat', url: 'https://x/b.png', kind: 'sticker' },
      ],
    }, 'gif', vi.fn()), { wrapper: LocaleProvider });
    await act(() => dup.result.current.save());
    expect(dup.result.current.error).toBe('Duplicate shortcode: :cat:');
    expect(mocks.saveMediaPack).not.toHaveBeenCalled();
  });

  it('saves a trimmed title and hands the saved pack back', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePackEditor({
      ...PACK,
      items: [{ name: 'cat', url: 'https://x/a.png', kind: 'sticker' }],
    }, 'gif', onSaved), { wrapper: LocaleProvider });
    await act(() => result.current.save());
    expect(mocks.saveMediaPack).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cats' }));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cats' }));
  });

  it('edits, adds and removes rows', () => {
    const { result } = renderHook(() => usePackEditor(PACK, 'emoji', vi.fn()), { wrapper: LocaleProvider });
    act(() => result.current.addUrlItem());
    expect(result.current.draft.items).toEqual([{ name: '', url: '', kind: 'emoji' }]);
    act(() => result.current.updateItem(0, { name: 'wave' }));
    expect(result.current.draft.items[0].name).toBe('wave');
    act(() => result.current.removeItem(0));
    expect(result.current.draft.items).toEqual([]);
  });

  it('a picked file list is added, then the input is cleared to allow the same pick again', async () => {
    mocks.uploadToBlossom.mockResolvedValueOnce('https://cdn/a.png');
    const { result } = renderHook(() => usePackEditor(PACK, 'gif', vi.fn()), { wrapper: LocaleProvider });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { configurable: true, value: fileList([new File(['a'], 'a.png', { type: 'image/png' })]) });
    const cleared = vi.spyOn(input, 'value', 'set');
    await act(async () => { result.current.filesPicked(input); });
    expect(cleared).toHaveBeenCalledWith('');
    expect(result.current.draft.items.map((item) => item.url)).toEqual(['https://cdn/a.png']);
  });
});
