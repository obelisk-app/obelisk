import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout } from './promise';

describe('withTimeout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('resolves with the inner promise when it settles first', async () => {
    const p = Promise.resolve('done');
    await expect(withTimeout(p, 1000)).resolves.toBe('done');
  });

  it('rejects with the default "timeout" message after ms', async () => {
    const p = new Promise(() => {});
    const raced = withTimeout(p, 500);
    vi.advanceTimersByTime(500);
    await expect(raced).rejects.toThrow('timeout');
  });

  it('rejects with a custom message when provided', async () => {
    const p = new Promise(() => {});
    const raced = withTimeout(p, 500, 'custom error');
    vi.advanceTimersByTime(500);
    await expect(raced).rejects.toThrow('custom error');
  });

  it('rejects with the inner error when the promise rejects before the deadline', async () => {
    const p = Promise.reject(new Error('boom'));
    await expect(withTimeout(p, 1000)).rejects.toThrow('boom');
  });
});
