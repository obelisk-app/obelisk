vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock({
    useIsLoggedIn: () => mockBridge.isLoggedIn,
    useMyLoginMethod: () => mockBridge.loginMethod,
  });
});
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@tests/support/intl';

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LocaleProvider });
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelayAccessState } from '@/services/nostr-bridge';

const mockBridge = vi.hoisted(() => ({
  isLoggedIn: true,
  connectionState: 'Connected',
  relayAccess: 'ok' as RelayAccessState,
  loginMethod: 'nsec' as 'nsec' | 'nip07' | 'bunker' | null,
  relayUrl: 'wss://public.obelisk.ar',
}));

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({

    useConnectionState: () => mockBridge.connectionState,
    useRelayAccess: () => mockBridge.relayAccess,

    useCurrentRelayUrl: () => mockBridge.relayUrl,
  });
});

import RelayStatusBanner from '@/components/feedback/RelayStatusBanner';

describe('RelayStatusBanner test ids', () => {
  beforeEach(() => {
    mockBridge.isLoggedIn = true;
    mockBridge.connectionState = 'Connected';
    mockBridge.relayAccess = 'ok';
    mockBridge.loginMethod = 'nsec';
    mockBridge.relayUrl = 'wss://public.obelisk.ar';
  });

  it('surfaces restricted relay access through the e2e relay-access banner selector', () => {
    mockBridge.relayAccess = 'restricted';

    render(<RelayStatusBanner />);

    const banner = screen.getByTestId('relay-access-banner');
    expect(banner).toHaveAttribute('data-state', 'restricted');
    expect(banner).toHaveTextContent('Not whitelisted');
    expect(banner).toHaveClass('rounded-xl');
    expect(banner).not.toHaveClass('border-b');
  });

  it('lets the mobile top signer status own authentication notices', () => {
    mockBridge.relayAccess = 'authenticating';
    const { rerender } = render(<RelayStatusBanner hideAuthenticating />);
    expect(screen.queryByTestId('relay-access-banner')).toBeNull();

    mockBridge.relayAccess = 'auth-required';
    rerender(<RelayStatusBanner hideAuthenticating />);
    expect(screen.queryByTestId('relay-access-banner')).toBeNull();

    mockBridge.connectionState = 'Disconnected';
    rerender(<RelayStatusBanner hideAuthenticating />);
    expect(screen.getByTestId('connection-loss-banner')).toHaveTextContent('Connection lost');
  });

  it('surfaces offline mode with cached-content guidance', () => {
    mockBridge.connectionState = 'Offline';

    render(<RelayStatusBanner />);

    const banner = screen.getByTestId('connection-loss-banner');
    expect(banner).toHaveAttribute('data-state', 'offline');
    expect(banner).toHaveTextContent('You’re offline');
    expect(banner).toHaveTextContent('Cached channels and messages remain available');
  });

  it('surfaces socket loss through the e2e connection-loss banner selector', () => {
    mockBridge.connectionState = 'Disconnected';

    render(<RelayStatusBanner />);

    const banner = screen.getByTestId('connection-loss-banner');
    expect(banner).toHaveAttribute('data-state', 'disconnected');
    expect(banner).toHaveTextContent('Connection lost');
  });

  it('speaks the reader\'s language, host included', () => {
    mockBridge.relayAccess = 'restricted';

    rtlRender(<LocaleProvider initialLocale="es"><RelayStatusBanner /></LocaleProvider>);

    const banner = screen.getByTestId('relay-access-banner');
    expect(banner).toHaveTextContent('No estás en la whitelist de public.obelisk.ar');
    expect(banner).toHaveTextContent('Pedile al operador que te agregue');
  });
});
