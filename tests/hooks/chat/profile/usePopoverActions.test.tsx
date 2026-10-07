import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePopoverActions } from '@/hooks/chat/profile/usePopoverActions';
import { OPEN_SETTINGS_EVENT } from '@/constants/settings/open-settings';

describe('usePopoverActions', () => {
  it('each action closes the card first, then acts', () => {
    const order: string[] = [];
    const onClose = vi.fn(() => order.push('close'));
    const onExplore = vi.fn(() => order.push('explore'));
    const onMessage = vi.fn(() => order.push('message'));
    const { result } = renderHook(() => usePopoverActions('pk', onClose, onExplore, onMessage));
    result.current.explore();
    result.current.message();
    expect(order).toEqual(['close', 'explore', 'close', 'message']);
    expect(onExplore).toHaveBeenCalledWith('pk');
    expect(onMessage).toHaveBeenCalledWith('pk');
  });

  it('edit and preferences open their settings sections', () => {
    const seen: string[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail.section);
    window.addEventListener(OPEN_SETTINGS_EVENT, listener);
    const { result } = renderHook(() => usePopoverActions('pk', () => {}, () => {}));
    result.current.editProfile();
    result.current.openPreferences();
    result.current.message();
    window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
    expect(seen).toEqual(['profile', 'general']);
  });
});
