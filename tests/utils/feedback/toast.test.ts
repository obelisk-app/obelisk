import { describe, expect, it } from 'vitest';
import { TOAST_AUTO_DISMISS_MS, toastRemainingMs } from '@/utils/feedback/toast';

describe('toastRemainingMs', () => {
  it('counts down from when the toast was pushed and never goes below zero', () => {
    expect(toastRemainingMs(1000, 1000)).toBe(TOAST_AUTO_DISMISS_MS);
    expect(toastRemainingMs(1000, 3000)).toBe(TOAST_AUTO_DISMISS_MS - 2000);
    expect(toastRemainingMs(0, TOAST_AUTO_DISMISS_MS * 3)).toBe(0);
  });
});
