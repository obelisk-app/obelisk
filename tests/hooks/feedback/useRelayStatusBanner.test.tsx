import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { relayBannerTestId, useRelayStatusBanner } from '@/hooks/feedback/useRelayStatusBanner';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { BRIDGE_MOCK_RELAY } from '@tests/support/mocks/nostr-bridge';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';

const render = (hide: boolean, fake = fakeBridge()) =>
  ({ fake, ...renderHook(() => useRelayStatusBanner(hide), { wrapper: bridgeWrapper(fake) }) });

describe('relayBannerTestId', () => {
  it('names lost sockets and offline as the connection-loss banner, the rest as relay access', () => {
    expect(relayBannerTestId('disconnected')).toBe('connection-loss-banner');
    expect(relayBannerTestId('offline')).toBe('connection-loss-banner');
    expect(relayBannerTestId('restricted')).toBe('relay-access-banner');
  });
});

describe('useRelayStatusBanner', () => {
  it('has nothing to say on a healthy connection or when signed out', () => {
    const { result, fake } = render(false);
    expect(result.current).toBeNull();
    act(() => { fake.stores.connectionState.set('Disconnected'); fake.stores.isLoggedIn.set(false); });
    expect(result.current).toBeNull();
  });

  it('reports a lost connection with its test id', () => {
    const { result, fake } = render(false);
    act(() => { fake.stores.connectionState.set('Disconnected'); });
    expect(result.current).toMatchObject({ state: 'disconnected', testId: 'connection-loss-banner' });
  });

  it('leaves authentication to the signer dot when asked', () => {
    const fake = fakeBridge({ relayAccess: { [normalizeRelayUrl(BRIDGE_MOCK_RELAY)]: 'authenticating' } });
    expect(render(false, fake).result.current?.state).toBe('authenticating');
    expect(render(true, fake).result.current).toBeNull();
  });
});
