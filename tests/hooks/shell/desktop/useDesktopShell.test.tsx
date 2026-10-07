import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDesktopShell } from '@/hooks/shell/desktop/useDesktopShell';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

function setup(seed: Parameters<typeof fakeBridge>[0] = {}) {
  const fake = fakeBridge(seed, { setActiveGroup: vi.fn(), switchRelay: vi.fn() });
  return renderHook(() => useDesktopShell(), { wrapper: bridgeWrapper(fake) });
}

describe('useDesktopShell', () => {
  it('opens the shell for a signed-in session', () => {
    expect(setup().result.current.gate).toBe('shell');
  });

  it('shows the reconnecting screen while a stored session rehydrates', () => {
    window.localStorage.setItem('obelisk-dex/session', '{}');
    try {
      expect(setup({ isLoggedIn: false }).result.current.gate).toBe('rehydrating');
    } finally {
      window.localStorage.removeItem('obelisk-dex/session');
    }
  });

  it('shows the login screen once mounted with no stored session', () => {
    expect(setup({ isLoggedIn: false }).result.current.gate).toBe('logged-out');
  });

  it('opens a channel, then leaving DMs empties the view and closes the drawer', () => {
    const { result } = setup();
    act(() => result.current.openSidebar());
    expect(result.current.chrome.sidebarOpen).toBe(true);
    act(() => result.current.openDm('pk'));
    expect(result.current.view).toEqual({ kind: 'dm', peer: 'pk' });
    expect(result.current.railMode).toEqual({ kind: 'dm' });
    act(() => result.current.leaveDms());
    expect(result.current.view).toEqual({ kind: 'empty' });
    expect(result.current.chrome.sidebarOpen).toBe(false);
  });

  it('hides the member list while a profile is explored, and toggles it otherwise', () => {
    const { result } = setup();
    const before = result.current.showMembers;
    act(() => result.current.toggleMembers());
    expect(result.current.showMembers).toBe(!before);
    act(() => result.current.openProfile('pk'));
    expect(result.current.showMembers).toBe(false);
    expect(result.current.hintSurface).toBe('settings-profile');
  });

  it('"message" from an explored profile opens the thread and closes the pane', () => {
    const { result } = setup();
    act(() => result.current.openProfile('pk'));
    act(() => result.current.messageFromProfile('pk'));
    expect(result.current.view).toEqual({ kind: 'dm', peer: 'pk' });
    expect(result.current.exploredProfilePubkey).toBeNull();
  });

  it('the feed toggle closes the drawer and opens the feed', () => {
    const { result } = setup();
    act(() => result.current.openSidebar());
    act(() => result.current.toggleFeed());
    expect(result.current.chrome.sidebarOpen).toBe(false);
    expect(result.current.feed.feedOpen).toBe(true);
    expect(result.current.onSocialSurface).toBe(true);
  });

  it('jumps to a channel and consumes a pending message id', () => {
    const { result } = setup();
    act(() => result.current.jumpToChannel('g1'));
    expect(result.current.view).toEqual({ kind: 'group', groupId: 'g1' });
    act(() => result.current.consumePendingMessageId());
    expect(result.current.nav.pendingMessageId).toBeNull();
  });
});
