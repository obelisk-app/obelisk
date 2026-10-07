import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider, translator } from '@tests/support/intl';
import { fakeBridge } from '@tests/support/fake-bridge';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { encodeRelayShareCode } from '@/utils/relay-url/relay-share-link';

const replace = vi.fn();
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
}));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />, // eslint-disable-line @next/next/no-img-element
}));

import RelayShareLanding from '@/app/[locale]/r/[code]/RelayShareLanding';

const addRelay = vi.fn();
const switchRelay = vi.fn();
const t = translator('en');

const show = (code: string) => render(<LocaleProvider initialLocale="en"><RelayShareLanding code={code} /></LocaleProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  addRelay.mockResolvedValue(undefined);
  switchRelay.mockResolvedValue(undefined);
  registerBridge(fakeBridge({}, { addRelay, switchRelay }));
});

afterEach(() => unregisterBridge());

describe('the shared relay link landing', () => {
  it('adds the relay, switches to it and opens the app on it', async () => {
    show(encodeRelayShareCode('wss://relay.example/'));
    expect(screen.getByRole('heading')).toHaveTextContent(t('common.relayLanding.connecting'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/app?relay=relay.example'));
    expect(addRelay).toHaveBeenCalledWith('wss://relay.example/');
    expect(switchRelay).toHaveBeenCalledWith('wss://relay.example/');
  });

  it('carries on when the relay is already in the rail', async () => {
    addRelay.mockRejectedValue(new Error('Relay already added'));
    show(encodeRelayShareCode('wss://relay.example'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/app?relay=relay.example'));
  });

  it('says it could not open the relay when adding fails for another reason', async () => {
    addRelay.mockRejectedValue(new Error('unreachable'));
    show(encodeRelayShareCode('wss://relay.example'));
    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent(t('common.relayLanding.failed')));
    expect(switchRelay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('common.relayLanding.goToApp') }));
    expect(replace).toHaveBeenCalledWith('/app');
  });

  it('rejects a code that is not a relay without touching the bridge', () => {
    show('!!!');
    expect(screen.getByRole('heading')).toHaveTextContent(t('common.relayLanding.failed'));
    expect(screen.getByText(t('settings.relayShare.invalid'))).toBeInTheDocument();
    expect(addRelay).not.toHaveBeenCalled();
  });

  it('shows the La Crypta relay\'s logo while it connects', () => {
    show(encodeRelayShareCode('wss://lacrypta-relay.obelisk.ar'));
    expect(screen.getByRole('img', { name: 'La Crypta' })).toHaveAttribute('src', '/lacrypta-logo.png');
    expect(screen.getByText('wss://lacrypta-relay.obelisk.ar')).toBeInTheDocument();
  });

  it('does not navigate once the page has been left', async () => {
    let finish!: () => void;
    addRelay.mockReturnValue(new Promise<void>((r) => { finish = r; }));
    const { unmount } = show(encodeRelayShareCode('wss://relay.example'));
    unmount();
    await act(async () => finish());
    expect(switchRelay).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
