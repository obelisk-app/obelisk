import { describe, expect, it, vi } from 'vitest';
import { historyBack } from '@/services/shell/mobile/history';

describe('historyBack', () => {
  it('steps back in the browser history', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    historyBack();
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });
});
