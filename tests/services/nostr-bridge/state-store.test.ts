import { describe, expect, it, vi } from 'vitest';
import { StateStore, updatePending } from '@/services/nostr-bridge/state-store';

describe('StateStore', () => {
  it('replays the current value on subscribe and pushes every change', () => {
    const store = new StateStore(1);
    const seen: number[] = [];
    const unsub = store.subscribe((v) => seen.push(v));
    store.set(2);
    store.update((v) => v + 1);
    unsub();
    store.set(99);
    expect(seen).toEqual([1, 2, 3]);
    expect(store.get()).toBe(99);
  });

  it('does not notify when the same reference is set again', () => {
    const value = { a: 1 };
    const store = new StateStore(value);
    const cb = vi.fn();
    store.subscribe(cb);
    store.set(value);
    store.update((prev) => prev);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('updatePending', () => {
  type Msg = { id: string; clientTag?: string; status: string };
  const make = () => new StateStore<Record<string, Msg[]>>({
    g: [{ id: 'pending:t1', clientTag: 't1', status: 'pending' }, { id: 'x', status: 'sent' }],
  });

  it('patches only the message with the matching clientTag', () => {
    const store = make();
    updatePending(store, 'g', 't1', { status: 'failed' });
    expect(store.get().g.map((m) => m.status)).toEqual(['failed', 'sent']);
  });

  it('removes the message when the patch is null', () => {
    const store = make();
    updatePending(store, 'g', 't1', null);
    expect(store.get().g.map((m) => m.id)).toEqual(['x']);
  });

  it('keeps the previous reference when nothing matches, so subscribers are not woken', () => {
    const store = make();
    const before = store.get();
    const cb = vi.fn();
    store.subscribe(cb);
    updatePending(store, 'g', 'missing', { status: 'failed' });
    updatePending(store, 'other', 't1', null);
    expect(store.get()).toBe(before);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
