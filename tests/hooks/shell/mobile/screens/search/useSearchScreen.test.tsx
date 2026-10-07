import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useSearchScreen } from '@/hooks/shell/mobile/screens/search/useSearchScreen';

vi.mock('@/services/relay/relay-info', async (orig) => ({
  ...(await orig<typeof import('@/services/relay/relay-info')>()),
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
  supportsSearch: () => true,
}));

const key = (k: string) => ({ key: k }) as KeyboardEvent;

function setup() {
  const back = vi.fn();
  const selectGroup = vi.fn();
  const { result } = renderHook(() => useSearchScreen({ back, selectGroup }), {
    wrapper: bridgeWrapper(fakeBridge({}, { searchMessages: vi.fn().mockResolvedValue({ hits: [], partial: false }) } as never)),
  });
  return { result, back, selectGroup };
}

describe('useSearchScreen', () => {
  it('starts empty, with nothing to show', () => {
    const { result } = setup();
    expect(result.current.empty).toBe(true);
    expect(result.current.showChannels).toBe(false);
  });

  it('clears on Escape, then leaves', () => {
    const { result, back } = setup();
    act(() => result.current.search.setRaw('x'));
    act(() => result.current.onKeyDown(key('Escape')));
    expect(result.current.search.raw).toBe('');
    act(() => result.current.onKeyDown(key('Escape')));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('opens a hit in its channel and ignores one without a channel', () => {
    const { result, selectGroup } = setup();
    act(() => result.current.openHit({ id: 'm', groupId: null } as never));
    expect(selectGroup).not.toHaveBeenCalled();
    act(() => result.current.openHit({ id: 'm', groupId: 'g9' } as never));
    expect(selectGroup).toHaveBeenCalledWith('g9', 'text');
  });
});
