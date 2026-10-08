import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { leaveRelay, shareRelayInvite } from '@/services/shell/mobile/relay-menu';

const INVITE = { title: 'Alpha', text: 'Join Alpha', url: 'wss://a' };

afterEach(() => {
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  unregisterBridge();
});

describe('shareRelayInvite', () => {
  it('rejects when neither sharing nor clipboard is available', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await expect(shareRelayInvite(INVITE)).rejects.toThrow();
  });

  it('uses the system share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await expect(shareRelayInvite(INVITE)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith(INVITE);
  });

  it('copies the text otherwise', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(shareRelayInvite(INVITE)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Join Alpha');
  });

  it('rejects when the person cancels the share', async () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue(new Error('AbortError')), configurable: true });
    await expect(shareRelayInvite(INVITE)).rejects.toThrow();
  });
});

describe('leaveRelay', () => {
  it('removes the relay and moves to the next one in the rail', async () => {
    const removeRelay = vi.fn().mockResolvedValue(undefined);
    const switchRelay = vi.fn().mockResolvedValue(undefined);
    registerBridge(fakeBridge({}, { removeRelay, switchRelay } as never));
    await leaveRelay('wss://a', ['wss://a', 'wss://b', 'wss://c']);
    expect(removeRelay).toHaveBeenCalledWith('wss://a');
    expect(switchRelay).toHaveBeenCalledWith('wss://b');
  });

  it('switches nowhere when it was the only relay', async () => {
    const switchRelay = vi.fn();
    registerBridge(fakeBridge({}, { removeRelay: vi.fn().mockResolvedValue(undefined), switchRelay } as never));
    await leaveRelay('wss://a', ['wss://a']);
    expect(switchRelay).not.toHaveBeenCalled();
  });
});
