import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDmOptInGate } from '@/hooks/shell/dm/useDmOptInGate';
import { isDmOptInEnabled, setDmOptInEnabled } from '@/services/chat/dm/opt-in';

describe('useDmOptInGate', () => {
  beforeEach(() => {
    localStorage.clear();
    setDmOptInEnabled(false);
  });

  it('turns DMs on, then calls the host back', () => {
    const onEnable = vi.fn(() => expect(isDmOptInEnabled()).toBe(true));
    const { result } = renderHook(() => useDmOptInGate(onEnable));
    result.current.enable();
    expect(onEnable).toHaveBeenCalledTimes(1);
  });

  it('works with no callback', () => {
    const { result } = renderHook(() => useDmOptInGate());
    result.current.enable();
    expect(isDmOptInEnabled()).toBe(true);
  });
});
