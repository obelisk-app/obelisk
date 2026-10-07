import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, translator } from '@tests/support/intl';
import { fakeBridge } from '@tests/support/fake-bridge';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { encodeRelayShareCode } from '@/utils/relay-url/relay-share-link';

const replace = vi.fn();
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
}));

import { useRelayShareLanding } from '@/hooks/relay/useRelayShareLanding';

const addRelay = vi.fn();
const switchRelay = vi.fn();
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  addRelay.mockResolvedValue(undefined);
  switchRelay.mockResolvedValue(undefined);
  registerBridge(fakeBridge({}, { addRelay, switchRelay }));
});

afterEach(() => unregisterBridge());

describe('useRelayShareLanding', () => {
  it('decodes the relay and opens the app on its host once joined', async () => {
    const { result } = renderHook(() => useRelayShareLanding(encodeRelayShareCode('wss://relay.example:7777')), { wrapper });
    expect(result.current).toMatchObject({ relayUrl: 'wss://relay.example:7777', error: null });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/app?relay=relay.example%3A7777'));
  });

  it('turns a failed join into a sentence, and an invalid code into another', async () => {
    switchRelay.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRelayShareLanding(encodeRelayShareCode('wss://relay.example')), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
    const invalid = renderHook(() => useRelayShareLanding('!!!'), { wrapper }).result.current;
    expect(invalid).toMatchObject({ relayUrl: null, error: translator('en')('settings.relayShare.invalid') });
  });

  it('goes to the app from the error', () => {
    const { result } = renderHook(() => useRelayShareLanding('!!!'), { wrapper });
    result.current.goToApp();
    expect(replace).toHaveBeenCalledWith('/app');
  });
});
