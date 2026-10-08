import { beforeEach, expect, it, vi } from 'vitest';
import { invalidateRuntimeCaches } from '@/services/local-data/runtime-caches';
import { NOTE_PREVIEW_CACHE_LIMIT } from '@/constants/social/cache';

const { fetchNote } = vi.hoisted(() => ({ fetchNote: vi.fn() }));
vi.mock('@nostr-wot/data', async (importOriginal) => ({
  ...await importOriginal<typeof import('@nostr-wot/data')>(), fetchNote,
}));
import { __resetNotePreviewCache, getCachedNotePreview, loadNotePreview } from '@/services/social/note-preview';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  __resetNotePreviewCache();
  fetchNote.mockReset();
});

it('does not publish stale results or remove a newer request after account invalidation', async () => {
  const old = deferred<{ id: string; pubkey: string; content: string }>();
  const fresh = deferred<{ id: string; pubkey: string; content: string }>();
  fetchNote.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const first = loadNotePreview('same');
  invalidateRuntimeCaches({ scope: 'account' });
  const second = loadNotePreview('same');
  old.resolve({ id: 'same', pubkey: 'old', content: 'old-account' });
  expect(await first).toBeNull();
  expect(getCachedNotePreview('same')).toBeUndefined();
  const shared = loadNotePreview('same');
  expect(fetchNote).toHaveBeenCalledTimes(2);
  fresh.resolve({ id: 'same', pubkey: 'new', content: 'new-account' });
  expect(await second).toEqual(await shared);
  expect(getCachedNotePreview('same')?.content).toBe('new-account');
});

it('bounds misses and previews while retaining recently read entries', async () => {
  fetchNote.mockImplementation(async (id: string) => id === 'miss' ? null : ({ id, pubkey: 'pk', content: id }));
  await loadNotePreview('miss');
  for (let i = 0; i < NOTE_PREVIEW_CACHE_LIMIT - 1; i++) await loadNotePreview(String(i));
  expect(getCachedNotePreview('miss')).toBeNull();
  await loadNotePreview('extra');
  expect(getCachedNotePreview('0')).toBeUndefined();
  expect(getCachedNotePreview('miss')).toBeNull();
  invalidateRuntimeCaches({ categories: ['channels'] });
  expect(getCachedNotePreview('miss')).toBeUndefined();
});
