import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmUnlock } from '@/components/chat/dm/unlock/DmUnlock';
import { setPreference } from '@/services/preferences/preferences';
import type { DmLockState } from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

function mount(lock: DmLockState, locale: 'en' | 'es' | 'pt' = 'en') {
  const unlockDirectMessages = vi.fn(async () => undefined);
  const bridge = fakeBridge({ dmLock: lock }, { unlockDirectMessages });
  renderWithBridge(<DmUnlock />, bridge, { locale });
  return { bridge, unlockDirectMessages };
}

afterEach(() => setPreference('directMessagesEnabled', false));

describe('DmUnlock', () => {
  it('the list waits for explicit discovery and shows nothing once open', () => {
    setPreference('directMessagesEnabled', true);
    const { bridge, unlockDirectMessages } = mount({ status: 'locked', unopened: [] });
    expect(unlockDirectMessages).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('dm-discover'));
    expect(unlockDirectMessages).toHaveBeenCalledTimes(1);
    act(() => bridge.stores.dmLock.set({ status: 'unlocked', unopened: [] }));
    expect(screen.queryByTestId('dm-unlocking')).toBeNull();
    expect(screen.queryByTestId('dm-unlock-failed')).toBeNull();
    expect(unlockDirectMessages).toHaveBeenCalledTimes(1);
  });

  it('offers an explicit retry for message failures after the store is unlocked', () => {
    setPreference('directMessagesEnabled', true);
    const { unlockDirectMessages } = mount({ status: 'unlocked', unopened: [], failedDecryptions: 2 });
    expect(screen.getByTestId('dm-unlock-failed')).toHaveTextContent('2 messages could not be decrypted');
    expect(unlockDirectMessages).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('dm-unlock-retry'));
    expect(unlockDirectMessages).toHaveBeenCalledTimes(1);
  });

  it('offers discovery from a known thread when unidentified envelopes remain', () => {
    setPreference('directMessagesEnabled', true);
    const unlockDirectMessages = vi.fn(async () => undefined);
    const bridge = fakeBridge({ dmLock: { status: 'unlocked', unopened: [1000] } }, { unlockDirectMessages });
    renderWithBridge(<DmUnlock peer="alice" />, bridge);
    expect(unlockDirectMessages).toHaveBeenCalledWith('alice');
    fireEvent.click(screen.getByTestId('dm-discover'));
    expect(unlockDirectMessages).toHaveBeenLastCalledWith();
  });

  it('asks nothing while DMs are turned off', () => {
    setPreference('directMessagesEnabled', false);
    const { unlockDirectMessages } = mount({ status: 'locked', unopened: [] });
    expect(unlockDirectMessages).not.toHaveBeenCalled();
  });

  it('says the signer is being asked, then offers a retry when it said no, and never asks again by itself', () => {
    setPreference('directMessagesEnabled', true);
    const { bridge, unlockDirectMessages } = mount({ status: 'unlocking', unopened: [] });
    expect(screen.getByTestId('dm-unlocking')).toHaveTextContent('Your signer may ask you to approve');
    act(() => bridge.stores.dmLock.set({ status: 'failed', unopened: [] }));
    expect(screen.getByTestId('dm-unlock-failed')).toHaveTextContent('still locked');
    expect(unlockDirectMessages).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('dm-unlock-retry'));
    expect(unlockDirectMessages).toHaveBeenCalledTimes(1);
  });

  it('speaks Spanish and Portuguese', () => {
    setPreference('directMessagesEnabled', true);
    mount({ status: 'failed', unopened: [] }, 'es');
    expect(screen.getByTestId('dm-unlock-retry')).toHaveTextContent('Probar de nuevo');
  });
});
