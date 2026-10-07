import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useCreateChannelSheet } from '@/hooks/shell/mobile/sheets/channel/useCreateChannelSheet';

describe('useCreateChannelSheet', () => {
  it('hands the new channel on, then closes the sheet', async () => {
    const order: string[] = [];
    const onCreated = vi.fn(() => order.push('created'));
    const close = vi.fn(() => order.push('closed'));
    const createGroup = vi.fn().mockResolvedValue('g9');
    const { result } = renderHook(() => useCreateChannelSheet(onCreated, close), {
      wrapper: bridgeWrapper(fakeBridge({}, { createGroup } as never)),
    });
    act(() => result.current.setName('  lounge '));
    await act(() => result.current.submit());
    expect(createGroup).toHaveBeenCalledWith({ name: 'lounge', isPublic: true, isOpen: true });
    expect(onCreated).toHaveBeenCalledWith('g9');
    expect(order).toEqual(['created', 'closed']);
  });

  it('stays open when the relay refuses', async () => {
    const close = vi.fn();
    const { result } = renderHook(() => useCreateChannelSheet(vi.fn(), close), {
      wrapper: bridgeWrapper(fakeBridge({}, { createGroup: vi.fn().mockRejectedValue(new Error('no')) } as never)),
    });
    act(() => result.current.setName('x'));
    await act(() => result.current.submit());
    expect(close).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });
});
