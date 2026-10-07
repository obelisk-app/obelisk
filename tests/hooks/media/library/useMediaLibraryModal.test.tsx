import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useMediaLibraryModal } from '@/hooks/media/library/useMediaLibraryModal';

const author = 'a'.repeat(64);
const items = [
  { name: 'party_cat', url: 'https://cdn.example/cat-1.webp', kind: 'sticker' as const },
  { name: 'cat_2', url: 'https://cdn.example/cat-2.webp', kind: 'sticker' as const },
];
const pack = { address: `30030:${author}:cats`, identifier: 'cats', author, title: 'Cat pack', description: '', image: '', items, createdAt: 10 };

function setup(opts: { initialSelection?: { pack?: typeof pack; item: typeof items[number] } } = {}) {
  const saveMediaFavorites = vi.fn().mockResolvedValue(undefined);
  const bridge = fakeBridge({ mediaPacks: { [pack.address]: pack }, myPubkey: author }, { saveMediaFavorites });
  const onClose = vi.fn();
  const hook = renderHook(() => useMediaLibraryModal({
    onClose, initialTab: 'discover', initialKind: 'all', initialSelection: opts.initialSelection,
  }), { wrapper: bridgeWrapper(bridge) });
  return { ...hook, onClose, saveMediaFavorites };
}

describe('useMediaLibraryModal', () => {
  it('is the whole library when opened plainly', () => {
    const { result } = setup();
    expect(result.current.mode).toBe('library');
    expect(result.current.closeOnEscape).toBe(true);
    expect(result.current.emptyKey).toBe('media.empty.none');
    expect(result.current.editorKind).toBe('sticker');
  });

  it('opened with an item it is that item, then its pack, and closing either closes the library', () => {
    const { result, onClose } = setup({ initialSelection: { pack, item: items[0] } });
    expect(result.current.mode).toBe('item');
    act(() => result.current.viewSelectedPack());
    expect(result.current.mode).toBe('pack');
    expect(result.current.viewingPack).toBe(pack);
    result.current.closeViewer();
    result.current.closeItemMenu();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('favouriting the launching item saves it and closes; in the library it only closes the menu', async () => {
    const launched = setup({ initialSelection: { pack, item: items[0] } });
    await act(async () => launched.result.current.favoriteSelected());
    expect(launched.saveMediaFavorites).toHaveBeenCalledWith({ items: [items[0]], packAddresses: [] });
    expect(launched.onClose).toHaveBeenCalledOnce();

    const plain = setup();
    act(() => plain.result.current.openItem(pack, items[1]));
    expect(plain.result.current.closeOnEscape).toBe(false);
    await act(async () => plain.result.current.favoriteSelected());
    expect(plain.result.current.selectedMedia).toBeNull();
    expect(plain.onClose).not.toHaveBeenCalled();
  });

  it('starts a pack with the selected item, named after it', () => {
    const { result } = setup({ initialSelection: { pack, item: items[0] } });
    act(() => result.current.createPackFromSelected());
    expect(result.current.editing?.title).toBe('party_cat pack');
    expect(result.current.editing?.items).toEqual([items[0]]);
    expect(result.current.selectedMedia).toBeNull();
  });

  it('opened with an item, starting a pack from its pack viewer leaves the viewer for the editor', () => {
    const { result } = setup({ initialSelection: { pack, item: items[0] } });
    act(() => result.current.viewSelectedPack());
    act(() => result.current.openItem(pack, items[1]));
    act(() => result.current.createPackFromSelected());
    expect(result.current.viewingPack).toBeNull();
    expect(result.current.mode).toBe('library');
    expect(result.current.editing?.title).toBe('cat_2 pack');
  });

  it('opens a favourite with the pack holding it, and a saved editor lands on my packs', async () => {
    const { result } = setup();
    act(() => result.current.openFavorite(items[1]));
    expect(result.current.selectedMedia).toEqual({ pack, item: items[1] });
    act(() => result.current.createPack());
    expect(result.current.editing?.items).toEqual([]);
    await act(async () => result.current.editorSaved());
    expect(result.current.editing).toBeNull();
    expect(result.current.tab).toBe('mine');
  });
});
