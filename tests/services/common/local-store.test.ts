import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStore } from '@/services/common/local-store';

describe('local storage blobs', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('round-trips and removes only its own key', () => {
    const store = createLocalStore('example', ['default']);
    localStorage.setItem('unrelated', 'keep');
    expect(store.load()).toEqual(['default']);
    store.save(['saved']);
    expect(store.load()).toEqual(['saved']);
    store.remove();
    expect(store.load()).toEqual(['default']);
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('returns defaults for malformed JSON', () => {
    localStorage.setItem('example', '{broken');
    expect(createLocalStore('example', []).load()).toEqual([]);
  });

  it('degrades safely when storage operations are denied', () => {
    const store = createLocalStore('example', ['default']);
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException('Denied', 'SecurityError');
      });
    }
    expect(store.load()).toEqual(['default']);
    expect(() => store.save(['new'])).not.toThrow();
    expect(() => store.remove()).not.toThrow();
  });
});
