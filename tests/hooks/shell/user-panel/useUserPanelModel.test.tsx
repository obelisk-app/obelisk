import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUserPanel } from '@/hooks/shell/user-panel/useUserPanel';
import { userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const PK = 'a'.repeat(64);

function setup(over: Partial<Parameters<typeof useUserPanel>[0]> = {}) {
  const onClose = vi.fn();
  const logout = vi.fn().mockResolvedValue(undefined);
  const ensureUserMetadata = vi.fn().mockResolvedValue(undefined);
  const wrapper = bridgeWrapper(fakeBridge({ myPubkey: PK, userMetadata: { [PK]: userMetadataFixture({ pubkey: PK, name: 'Alice', displayName: 'Alice' }) } }, { logout, ensureUserMetadata }));
  const view = renderHook(() => useUserPanel({ pubkey: PK, onClose, initialEditing: false, initialTab: 'profile', ...over }), { wrapper });
  return { ...view, onClose, logout, ensureUserMetadata };
}

describe('useUserPanel', () => {
  it('reads the session profile without starting a duplicate fetch', () => {
    const { result, ensureUserMetadata } = setup();
    expect(ensureUserMetadata).not.toHaveBeenCalled();
    expect(result.current.displayName).toBe('Alice');
    expect(result.current.npub).toMatch(/^npub1/);
    expect(result.current.displayName).not.toBe('');
  });

  it('lands the legacy preferences tab on General', () => {
    expect(setup({ initialTab: 'preferences' }).result.current.settingsTab).toBe('general');
    expect(setup({ initialTab: 'relays' }).result.current.settingsTab).toBe('relays');
  });

  it('opens settings, and finishing closes them and the panel', () => {
    const { result, onClose } = setup();
    act(() => result.current.startEditing());
    expect(result.current.editing).toBe(true);
    act(() => result.current.finishEditing());
    expect(result.current.editing).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('logs out through the host when it has a handler', () => {
    const onLogout = vi.fn();
    const { result, onClose, logout } = setup({ onLogout });
    result.current.logout();
    expect(onClose).toHaveBeenCalled();
    expect(onLogout).toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out through the bridge otherwise', async () => {
    const { result, onClose, logout } = setup();
    result.current.logout();
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  it('dismisses editing on Escape and restores the previous scroll policy on unmount', () => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    const { onClose, unmount } = setup({ initialEditing: true });
    try {
      expect(document.body.style.overflow).toBe('hidden');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      unmount();
      expect(document.body.style.overflow).toBe('auto');
    } finally {
      unmount();
      document.body.style.overflow = previous;
    }
  });
});
