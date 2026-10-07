import { describe, expect, it } from 'vitest';
import {
  editorKind, favoriteSelection, favoritesOfKind, isFavoriteItem, isServerPack, libraryEmptyKey, packWithItem,
} from '@/utils/media/library/library-view';

const item = (name: string, kind: 'emoji' | 'gif' | 'sticker' = 'sticker', packAddress?: string) =>
  ({ name, url: `https://cdn.example/${name}.webp`, kind, ...(packAddress ? { packAddress } : {}) });
const pack = (address: string, items: ReturnType<typeof item>[]) =>
  ({ address, identifier: address, author: 'a'.repeat(64), title: address, description: '', image: '', items, createdAt: 1 });

describe('library view helpers', () => {
  it('isFavoriteItem matches by URL', () => {
    expect(isFavoriteItem([item('cat')], { url: 'https://cdn.example/cat.webp' })).toBe(true);
    expect(isFavoriteItem([item('cat')], { url: 'https://cdn.example/dog.webp' })).toBe(false);
  });

  it('favoritesOfKind keeps everything under "all" and one kind otherwise', () => {
    const items = [item('a', 'gif'), item('b', 'emoji')];
    expect(favoritesOfKind(items, 'all')).toEqual(items);
    expect(favoritesOfKind(items, 'gif')).toEqual([items[0]]);
  });

  it('favoriteSelection takes the named pack, else the pack holding the URL, else none', () => {
    const cats = pack('cats', [item('cat')]);
    const named = pack('named', []);
    expect(favoriteSelection(item('x', 'gif', 'named'), { named }, [cats])).toEqual({ pack: named, item: item('x', 'gif', 'named') });
    expect(favoriteSelection(item('cat'), {}, [cats])).toEqual({ pack: cats, item: item('cat') });
    expect(favoriteSelection(item('lonely'), {}, [cats])).toEqual({ item: item('lonely') });
    expect(favoriteSelection(item('gone', 'gif', 'missing'), {}, [cats])).toEqual({ item: item('gone', 'gif', 'missing') });
  });

  it('isServerPack reads the relay set, and is false without a relay or a list', () => {
    expect(isServerPack({ emojiSet: { packAddresses: ['p'] } }, 'p')).toBe(true);
    expect(isServerPack({ emojiSet: {} }, 'p')).toBe(false);
    expect(isServerPack(undefined, 'p')).toBe(false);
  });

  it('libraryEmptyKey and editorKind', () => {
    expect(libraryEmptyKey('mine')).toBe('media.empty.mine');
    expect(libraryEmptyKey('favorites')).toBe('media.empty.favorites');
    expect(libraryEmptyKey('discover')).toBe('media.empty.none');
    expect(libraryEmptyKey('server')).toBe('media.empty.none');
    expect(editorKind('all')).toBe('sticker');
    expect(editorKind('gif')).toBe('gif');
  });

  it('packWithItem starts a pack holding just that item', () => {
    const draft = { identifier: 'id', title: 'New pack', description: 'd', image: '', items: [] };
    expect(packWithItem(draft, 'cat pack', item('cat'))).toEqual({ ...draft, title: 'cat pack', items: [item('cat')] });
  });
});
