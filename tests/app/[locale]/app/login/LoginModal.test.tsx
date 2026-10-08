import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import LoginModal from '@/app/[locale]/app/login/LoginModal';
import { isTransientNip46Error, signerAppHref } from '@/utils/nip46/signer-link';
import { copyText } from '@/services/common/clipboard';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

const renderLocalized = (ui: React.ReactElement) => renderWithBridge(
  ui, fakeBridge({ isLoggedIn: false, myPubkey: null }, { loginWithNsec, loginWithNip07: vi.fn(), loginWithBunker }),
);

const bunkerFromUri = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const loginWithNsec = vi.fn();
const loginWithBunker = vi.fn();
const publish = vi.fn((_relays: string[], _event: unknown) => [Promise.resolve('ok')]);
let updateDraft: ((patch: Record<string, string>) => void) | undefined;
let sdkProps: Record<string, unknown> = {};

vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({ useRouter: () => ({ push }) }));



vi.mock('nostr-tools/nip46', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nostr-tools/nip46')>();
  return {
    ...actual,
    BunkerSigner: { fromURI: (...args: unknown[]) => bunkerFromUri(...args) },
  };
});

vi.mock('@nostr-wot/data', async (importOriginal) => ({
  ...await importOriginal<typeof import('@nostr-wot/data')>(),
  getPool: () => ({ publish }),
}));

vi.mock('@/utils/identity/display-name', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/utils/identity/display-name')>(),
  randomProfileName: () => 'Brave Badger',
}));

vi.mock('@/app/[locale]/app/login/GeneratedProfileEnhancements', () => ({
  default: ({ onDraftChange }: { onDraftChange: (patch: Record<string, string>) => void }) => {
    updateDraft = onDraftChange;
    return null;
  },
}));

vi.mock('@nostr-wot/ui', async () => {
  const React = await import('react');
  return {
    LoginModal: (props: Record<string, unknown>) => {
      sdkProps = props;
      return React.createElement('div', { className: 'nui-modal-overlay' },
        React.createElement('div', { className: 'nui-modal obelisk-login-modal', 'data-testid': 'sdk-login' },
          React.createElement('button', { 'aria-label': 'Close', onClick: props.onClose }),
          React.createElement('div', { className: 'nui-qr-wrap' },
            React.createElement('div', { className: 'nui-qr', 'data-testid': 'sdk-qr' }),
            React.createElement('a', { className: 'nui-btn', href: 'nostrconnect://test', 'data-testid': 'native-signer-link' }, React.createElement('span', { className: 'nui-btn-label' }, 'Open in signer app')),
            React.createElement('div', { className: 'nui-key-display' }, 'nostrconnect://test'),
          ),
        ),
      );
    },
    Modal: ({ children, classes }: { children: React.ReactNode; classes?: { modal?: string } }) =>
      React.createElement('div', { className: classes?.modal }, children),
    NostrSessionProvider: ({ children }: { children: React.ReactNode }) => children,
    SIGNER_STORAGE_KEY_NSEC: '@nostr-wot/ui:nsec',
  };
});

describe('LoginModal generated identity flow', () => {
  beforeEach(() => {
    sdkProps = {};
    push.mockReset();
    updateDraft = undefined;
    publish.mockClear();
    loginWithNsec.mockReset().mockResolvedValue(undefined);
    loginWithBunker.mockReset().mockResolvedValue(undefined);
    bunkerFromUri.mockReset().mockResolvedValue({ close: vi.fn() });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('navigates home when the SDK close button is pressed', () => {
    renderLocalized(<LoginModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(push).toHaveBeenCalledWith('/');
  });

  it('publishes the complete profile before the npub step and enters without another write', async () => {
    renderLocalized(<LoginModal />);

    expect(sdkProps.profileSetup).toBe(true);
    expect(sdkProps.closeOnSuccess).toBe(false);
    expect(sdkProps.showRememberToggle).toBe(false);
    const permissions = (sdkProps.nip46Perms as string).split(',');
    expect(permissions).toContain('sign_event:22242');
    expect(permissions).not.toContain('nip:42');
    expect(permissions).toContain('nip:29');
    expect(permissions).toContain('sign_event:25052');
    expect(permissions).not.toContain('sign_event');
    expect(sdkProps.nip46Metadata).toEqual({
      name: 'Obelisk',
      url: 'https://obelisk.ar',
    });
    act(() => updateDraft?.({
      name: 'Cosmic Fox',
      picture: 'https://cdn.example/avatar.jpg',
      banner: 'https://cdn.example/banner.jpg',
    }));

    await act(async () => {
      await (sdkProps.onLogin as (args: unknown) => Promise<void>)({
        method: 'generate',
        pubkey: '1'.repeat(64),
        nsec: nip19.nsecEncode(new Uint8Array(32).fill(1)),
      });
    });

    const publishedEvent = publish.mock.calls[0][1] as { content: string };
    expect(JSON.parse(publishedEvent.content)).toMatchObject({
      name: 'Cosmic Fox',
      picture: 'https://cdn.example/avatar.jpg',
      banner: 'https://cdn.example/banner.jpg',
    });
    expect(screen.getByTestId('generated-npub-step')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(loginWithNsec).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Copy my npub' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/^npub1/));

    // An npub is the address; a link is what a recipient can open. Same
    // share target as a note - the Obelisk profile viewer, which renders OG
    // metadata rather than dumping people on a third-party site.
    fireEvent.click(screen.getByTestId('share-generated-profile'));
    await waitFor(() => expect(navigator.clipboard.writeText)
      .toHaveBeenCalledWith(expect.stringMatching(/\/p\/npub1/)));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enter Obelisk' }));
    await waitFor(() => expect(loginWithNsec).toHaveBeenCalledOnce());
  });

  it('publishes a generated name when profile setup is skipped', async () => {
    renderLocalized(<LoginModal />);

    await act(async () => {
      await (sdkProps.onLogin as (args: unknown) => Promise<void>)({
        method: 'generate',
        pubkey: '1'.repeat(64),
        nsec: nip19.nsecEncode(new Uint8Array(32).fill(1)),
      });
    });

    const publishedEvent = publish.mock.calls[0][1] as { content: string };
    expect(JSON.parse(publishedEvent.content)).toMatchObject({
      name: 'Brave Badger',
      display_name: 'Brave Badger',
    });
  });

  it('leaves NIP-46 relay selection to the signer SDK defaults', () => {
    renderLocalized(<LoginModal />);

    expect(sdkProps.nip46Relays).toBeUndefined();
  });

  it('hands the SDK-paired remote signer to the bridge', async () => {
    renderLocalized(<LoginModal />);
    const signer = { getPublicKey: vi.fn(), signEvent: vi.fn() };

    await act(async () => {
      await (sdkProps.onLogin as (args: unknown) => Promise<void>)({
        method: 'nip46',
        pubkey: '1'.repeat(64),
        bunkerUri: 'bunker://remote?relay=wss://relay.nsec.app',
        clientNsec: nip19.nsecEncode(new Uint8Array(32).fill(2)),
        signer,
      });
    });

    expect(loginWithBunker).toHaveBeenCalledWith(
      'bunker://remote?relay=wss://relay.nsec.app',
      expect.objectContaining({ signer, clientSecretHex: '02'.repeat(32) }),
    );
  });

  it('configures native SDK actions with translated labels and existing platform helpers', () => {
    renderLocalized(<LoginModal />);
    const options = sdkProps?.nip46Connection as {
      labels: { openSigner: string; copyUri: string; pasteUri: string };
      signerHref: (uri: string, userAgent: string) => string;
      copyOnOpen: boolean;
      copyUri: (uri: string) => Promise<boolean>;
    };
    expect(options.labels.openSigner).toBe('Open in signer app');
    expect(options.labels.copyUri).toBe('Copy connection URI');
    expect(options.labels.pasteUri).toBe('Use bunker URI');
    expect(options.copyOnOpen).toBe(true);
    expect(options.signerHref('nostrconnect://pairing', 'Android')).toContain('intent://pairing');
    expect(options.copyUri).toBeTypeOf('function');
  });

  it('copies the exact QR URI for Amber manual import', async () => {
    renderLocalized(<LoginModal />);
    const options = sdkProps.nip46Connection as { copyUri: (uri: string) => Promise<boolean> };
    await expect(options.copyUri('nostrconnect://test')).resolves.toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('nostrconnect://test');
  });

  it('falls back to a temporary textarea when the Clipboard API rejects', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
    document.execCommand = vi.fn().mockReturnValue(true);

    await expect(copyText('nostrconnect://complete')).resolves.toBe(true);

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('hands Android the complete QR URI through Amber', () => {
    const uri = 'nostrconnect://abc123?relay=wss%3A%2F%2Fpublic.obelisk.ar&name=Obelisk&perms=sign_event%3A1';

    expect(signerAppHref(uri, 'Mozilla/5.0 (Linux; Android 15)')).toBe(
      'intent://abc123?relay=wss%3A%2F%2Fpublic.obelisk.ar&name=Obelisk&perms=sign_event%3A1#Intent;scheme=nostrconnect;package=com.greenart7c3.nostrsigner;end',
    );
    expect(signerAppHref(uri, 'Mozilla/5.0 (iPhone)')).toBe(uri);
  });

  it('silently rotates the QR after a transient subscription close', async () => {
    expect(isTransientNip46Error('subscription closed before connection was established.')).toBe(true);
    expect(isTransientNip46Error('Remote signer rejected the request')).toBe(false);
    renderLocalized(<LoginModal />);
    const oldQr = screen.getByTestId('sdk-login');

    // The rotation sits behind a real 250 ms retry timer (250 * 2^retries,
    // capped at 5 s). Polling for it with a 1 s ceiling lost under CPU
    // contention; fire the timer instead.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      act(() => {
        (sdkProps.onError as (message: string) => void)('subscription closed before connection was established.');
      });

      expect(sdkProps.styles).toEqual({ error: { display: 'none' } });
      expect(screen.getByTestId('sdk-login')).toBe(oldQr);
      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
      expect(screen.getByTestId('sdk-login')).not.toBe(oldQr);
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(screen.getByText('Open in signer app')).toBeInTheDocument());
  });

  it('uses the native share sheet when the device has one', async () => {
    // On a phone, "copied to clipboard" is a dead end - the point is to send
    // the link to someone, which is what the share sheet is for.
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    renderLocalized(<LoginModal />);

    await act(async () => {
      await (sdkProps.onLogin as (args: unknown) => Promise<void>)({
        method: 'generate',
        pubkey: '1'.repeat(64),
        nsec: nip19.nsecEncode(new Uint8Array(32).fill(1)),
      });
    });

    fireEvent.click(screen.getByTestId('share-generated-profile'));
    await waitFor(() => expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringMatching(/\/p\/npub1/) }),
    ));
    Reflect.deleteProperty(navigator, 'share');
  });

  it('shows an aligned back control on the final generated-profile screen', async () => {
    renderLocalized(<LoginModal />);

    await act(async () => {
      await (sdkProps.onLogin as (args: unknown) => Promise<void>)({
        method: 'generate',
        pubkey: '1'.repeat(64),
        nsec: nip19.nsecEncode(new Uint8Array(32).fill(1)),
      });
    });

    expect(screen.getByTestId('generated-npub-step').parentElement)
      .toHaveClass('obelisk-login-modal', 'obelisk-share-modal');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('sdk-login')).toBeInTheDocument();
  });
});
