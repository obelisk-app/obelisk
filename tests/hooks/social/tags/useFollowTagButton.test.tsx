import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useToastStore } from '@/store/feedback/toast';

const mocks = vi.hoisted(() => ({ toggle: vi.fn(), ready: true, following: false }));
vi.mock('@/hooks/social/tags/useInterests', () => ({
  useInterests: () => ({ tags: [], isFollowing: () => mocks.following, toggle: mocks.toggle, ready: mocks.ready }),
}));

import { useFollowTagButton } from '@/hooks/social/tags/useFollowTagButton';

const click = () => ({ stopPropagation: vi.fn(), preventDefault: vi.fn() }) as never;

beforeEach(() => {
  mocks.toggle.mockReset().mockResolvedValue(undefined);
  mocks.ready = true;
  mocks.following = false;
  useToastStore.getState().clearToasts();
});

describe('useFollowTagButton', () => {
  it('is hidden with nobody signed in', () => {
    const { result } = renderHook(() => useFollowTagButton('x'), { wrapper: bridgeWrapper(fakeBridge({ myPubkey: null })) });
    expect(result.current.visible).toBe(false);
  });

  it('toggles the tag and keeps the click to itself', async () => {
    const { result } = renderHook(() => useFollowTagButton('x'), { wrapper: bridgeWrapper(fakeBridge()) });
    const event = click() as unknown as { stopPropagation: () => void; preventDefault: () => void };
    await act(async () => { result.current.onClick(event as never); });
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(mocks.toggle).toHaveBeenCalledWith('x');
    expect(result.current.disabled).toBe(false);
  });

  it('does nothing until the list has loaded', async () => {
    mocks.ready = false;
    const { result } = renderHook(() => useFollowTagButton('x'), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.disabled).toBe(true);
    await act(async () => { result.current.onClick(click()); });
    expect(mocks.toggle).not.toHaveBeenCalled();
  });

  it('reports a failed write', async () => {
    mocks.toggle.mockRejectedValue(new Error('no'));
    const { result } = renderHook(() => useFollowTagButton('art'), { wrapper: bridgeWrapper(fakeBridge()) });
    await act(async () => { result.current.onClick(click()); });
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ body: '#art' });
  });
});
