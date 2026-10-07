import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { useSidebarMe } from '@/hooks/shell/panes/sidebar/useSidebarMe';
import { openSettings } from '@/services/settings/open-settings';
import { useChatStore } from '@/store/chat';

function setup(seed: Record<string, unknown> = {}) {
  return renderHook(() => useSidebarMe(), {
    wrapper: bridgeWrapper(fakeBridge({ userMetadata: { [BRIDGE_MOCK_PUBKEY]: userMetadataFixture({ name: 'ana', nip05: '_@x.test' }) }, ...seed })),
  });
}

describe('useSidebarMe', () => {
  it('names the account and its handle', () => {
    const { result } = setup();
    expect(result.current.name).toBe('ana');
    expect(result.current.handle).toBe('x.test');
  });

  it('the gear opens on general, closing forgets the section', () => {
    const { result } = setup();
    act(() => result.current.openPreferences());
    expect(result.current.editing).toBe(true);
    expect(result.current.initialTab).toBe('general');
    act(() => result.current.closePanel());
    expect(result.current.editing).toBe(false);
    expect(result.current.initialTab).toBe('profile');
  });

  it('an open-settings request opens on that section, and stops listening once unmounted', () => {
    const { result, unmount } = setup();
    act(() => openSettings('relays'));
    expect(result.current.editing).toBe(true);
    expect(result.current.initialTab).toBe('relays');
    unmount();
    expect(() => openSettings('general')).not.toThrow();
  });

  it('openProfile anchors the profile preview at the pointer', () => {
    const openProfilePopup = vi.fn();
    useChatStore.setState({ openProfilePopup } as never);
    const { result } = setup();
    result.current.openProfile({ clientX: 1, clientY: 2 } as never);
    expect(openProfilePopup).toHaveBeenCalledWith(BRIDGE_MOCK_PUBKEY, { x: 1, y: 2 });
  });
});
