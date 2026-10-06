import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withDeadline } from '@/services/nostr-bridge/with-deadline';

describe('withDeadline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves with the value when the promise settles first', async () => {
    const result = withDeadline(Promise.resolve('ok'), 1000, 'too slow');
    await expect(result).resolves.toBe('ok');
  });

  it('rejects with the given message once the deadline passes', async () => {
    const never = new Promise<string>(() => {});
    const result = withDeadline(never, 1000, 'too slow');
    const assertion = expect(result).rejects.toThrow('too slow');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('carries a code for the reader: signer-timeout unless told otherwise', async () => {
    const never = new Promise<string>(() => {});
    const signer = expect(withDeadline(never, 1000, 'too slow')).rejects.toMatchObject({ code: 'signer-timeout' });
    const search = expect(withDeadline(never, 1000, 'too slow', 'search-timeout')).rejects.toMatchObject({ code: 'search-timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await signer;
    await search;
  });

  it('clears its timer when the promise wins, leaving nothing pending', async () => {
    await withDeadline(Promise.resolve(1), 1000, 'too slow');
    expect(vi.getTimerCount()).toBe(0);
  });
});
