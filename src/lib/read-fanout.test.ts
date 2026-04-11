import { describe, it, expect, vi } from 'vitest';
import { fanOutReadUpdate } from './read-fanout';

describe('fanOutReadUpdate', () => {
  it('emits to every sibling socket except the sender', () => {
    const pubkeySockets = new Map<string, Set<string>>([
      ['pub1', new Set(['s1', 's2', 's3'])],
    ]);
    const emit = vi.fn();

    const count = fanOutReadUpdate(
      pubkeySockets,
      'pub1',
      's1',
      'read-update',
      { channelId: 'ch1' },
      emit,
    );

    expect(count).toBe(2);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('s2', 'read-update', { channelId: 'ch1' });
    expect(emit).toHaveBeenCalledWith('s3', 'read-update', { channelId: 'ch1' });
  });

  it('returns 0 and emits nothing when the user has only one socket', () => {
    const pubkeySockets = new Map<string, Set<string>>([['pub1', new Set(['s1'])]]);
    const emit = vi.fn();

    const count = fanOutReadUpdate(
      pubkeySockets,
      'pub1',
      's1',
      'read-update',
      { channelId: 'ch1' },
      emit,
    );

    expect(count).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('returns 0 when the pubkey has no tracked sockets', () => {
    const pubkeySockets = new Map<string, Set<string>>();
    const emit = vi.fn();

    const count = fanOutReadUpdate(
      pubkeySockets,
      'ghost',
      'anything',
      'read-update',
      {},
      emit,
    );

    expect(count).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('passes dm-read-update payload through untouched', () => {
    const pubkeySockets = new Map<string, Set<string>>([['pub1', new Set(['s1', 's2'])]]);
    const emit = vi.fn();

    fanOutReadUpdate(
      pubkeySockets,
      'pub1',
      's1',
      'dm-read-update',
      { pubkey: 'other' },
      emit,
    );

    expect(emit).toHaveBeenCalledWith('s2', 'dm-read-update', { pubkey: 'other' });
  });
});
