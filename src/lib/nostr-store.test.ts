import { describe, it, expect, vi } from 'vitest';
import { createKeyedObservable } from './nostr-store';

describe('createKeyedObservable', () => {
  it('returns an empty slot for unknown keys', () => {
    const obs = createKeyedObservable<string, number>();
    const slot = obs.get('a');
    expect(slot.value).toBeUndefined();
    expect(slot.status).toBe('idle');
    expect(slot.lastFetched).toBe(0);
  });

  it('set marks the slot fresh, bumps lastFetched, fires subscribers', () => {
    const obs = createKeyedObservable<string, number>();
    const cb = vi.fn();
    obs.subscribe('a', cb);
    obs.set('a', 42);
    const slot = obs.get('a');
    expect(slot.value).toBe(42);
    expect(slot.status).toBe('fresh');
    expect(slot.lastFetched).toBeGreaterThan(0);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(slot);
  });

  it('per-key subscribers only fire for their key', () => {
    const obs = createKeyedObservable<string, number>();
    const cbA = vi.fn();
    const cbB = vi.fn();
    obs.subscribe('a', cbA);
    obs.subscribe('b', cbB);
    obs.set('a', 1);
    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbB).not.toHaveBeenCalled();
  });

  it('subscribeAll fires for any key', () => {
    const obs = createKeyedObservable<string, number>();
    const cb = vi.fn();
    obs.subscribeAll(cb);
    obs.set('a', 1);
    obs.set('b', 2);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenNthCalledWith(1, 'a', expect.objectContaining({ value: 1 }));
    expect(cb).toHaveBeenNthCalledWith(2, 'b', expect.objectContaining({ value: 2 }));
  });

  it('unsubscribe stops further notifications', () => {
    const obs = createKeyedObservable<string, number>();
    const cb = vi.fn();
    const unsub = obs.subscribe('a', cb);
    obs.set('a', 1);
    unsub();
    obs.set('a', 2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('content-equality short-circuit: bumps lastFetched, suppresses notification', () => {
    const obs = createKeyedObservable<string, { v: number }>({
      equal: (a, b) => a.v === b.v,
    });
    const cb = vi.fn();
    obs.subscribe('a', cb);
    obs.set('a', { v: 1 });
    expect(cb).toHaveBeenCalledTimes(1);
    const firstFetch = obs.get('a').lastFetched;
    // Wait a tick so the timestamp comparison is observable.
    return new Promise<void>((resolve) => setTimeout(() => {
      obs.set('a', { v: 1 }); // same content
      expect(cb).toHaveBeenCalledTimes(1); // no new notification
      const secondFetch = obs.get('a').lastFetched;
      expect(secondFetch).toBeGreaterThan(firstFetch);
      // Content change → notification fires.
      obs.set('a', { v: 2 });
      expect(cb).toHaveBeenCalledTimes(2);
      resolve();
    }, 5));
  });

  it('setStatus updates status without changing value, fires subscribers', () => {
    const obs = createKeyedObservable<string, number>();
    obs.set('a', 1);
    const cb = vi.fn();
    obs.subscribe('a', cb);
    obs.setStatus('a', 'loading');
    expect(obs.get('a').status).toBe('loading');
    expect(obs.get('a').value).toBe(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('setStatus is a no-op when status is unchanged', () => {
    const obs = createKeyedObservable<string, number>();
    const cb = vi.fn();
    obs.subscribe('a', cb);
    obs.setStatus('a', 'idle'); // already idle (empty slot)
    expect(cb).not.toHaveBeenCalled();
  });

  it('setStatus carries an error payload', () => {
    const obs = createKeyedObservable<string, number>();
    const err = new Error('boom');
    obs.setStatus('a', 'error', err);
    const slot = obs.get('a');
    expect(slot.status).toBe('error');
    expect(slot.error).toBe(err);
  });

  it('snapshot reference is stable across reads until set is called', () => {
    const obs = createKeyedObservable<string, number>();
    obs.set('a', 1);
    const ref1 = obs.get('a');
    const ref2 = obs.get('a');
    expect(ref1).toBe(ref2);
    obs.set('a', 2);
    const ref3 = obs.get('a');
    expect(ref3).not.toBe(ref1);
  });

  it('_reset drops slots and subscribers', () => {
    const obs = createKeyedObservable<string, number>();
    const cb = vi.fn();
    obs.subscribe('a', cb);
    obs.set('a', 1);
    obs._reset();
    expect(obs.get('a').value).toBeUndefined();
    obs.set('a', 2);
    expect(cb).toHaveBeenCalledTimes(1); // only the pre-reset call
  });
});
