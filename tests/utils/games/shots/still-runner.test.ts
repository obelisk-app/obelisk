import { describe, expect, it, vi } from 'vitest';
import { stackerWell } from '@/utils/games/shots/fixtures';
import { stillRunner } from '@/utils/games/shots/still-runner';

describe('stillRunner', () => {
  it('hands its one state to a listener once and has nothing to unsubscribe', () => {
    const state = stackerWell();
    const runner = stillRunner(state);
    const listener = vi.fn();
    const off = runner.onFrame(listener);
    expect(runner.state).toBe(state);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(state);
    expect(() => off()).not.toThrow();
  });
});
