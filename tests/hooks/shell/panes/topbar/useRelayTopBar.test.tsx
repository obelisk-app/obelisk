import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useRelayTopBar } from '@/hooks/shell/panes/topbar/useRelayTopBar';
import type { DmNotification, MentionNotification } from '@/store/notifications';

vi.mock('@/services/relay/relay-info', () => ({
  faviconFor: () => null,
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
}));

function setup() {
  const onJumpToChannel = vi.fn();
  const onJumpToDm = vi.fn();
  const view = renderHook(() => useRelayTopBar({ relay: 'wss://relay.test/', onJumpToChannel, onJumpToDm }), {
    wrapper: bridgeWrapper(fakeBridge()),
  });
  return { ...view, onJumpToChannel, onJumpToDm };
}

describe('useRelayTopBar', () => {
  it('names the relay by its host and links its website', () => {
    const { result } = setup();
    expect(result.current.displayName).toBe('relay.test');
    expect(result.current.website).toBe('https://relay.test');
  });

  it('keeps the bell and help panels mutually exclusive', () => {
    const { result } = setup();
    act(() => result.current.toggleNotif());
    expect([result.current.notifOpen, result.current.helpOpen]).toEqual([true, false]);
    act(() => result.current.toggleHelp());
    expect([result.current.notifOpen, result.current.helpOpen]).toEqual([false, true]);
    act(() => result.current.closeHelp());
    expect(result.current.helpOpen).toBe(false);
  });

  it('a notification click jumps and closes the bell', () => {
    const { result, onJumpToChannel, onJumpToDm } = setup();
    act(() => result.current.toggleNotif());
    act(() => result.current.onMentionClick({ channelId: 'ch1' } as MentionNotification));
    expect(onJumpToChannel).toHaveBeenCalledWith('ch1');
    expect(result.current.notifOpen).toBe(false);
    act(() => result.current.toggleNotif());
    act(() => result.current.onDmClick({ senderPubkey: 'p' } as DmNotification));
    expect(onJumpToDm).toHaveBeenCalledWith('p');
    act(() => result.current.toggleNotif());
    act(() => result.current.onOpenDms());
    expect(onJumpToDm).toHaveBeenLastCalledWith(null);
    expect(result.current.notifOpen).toBe(false);
  });
});
