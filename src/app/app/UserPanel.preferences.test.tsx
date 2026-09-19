import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/context';
import { DM_OPT_IN_STORAGE_KEY } from '@/lib/dm/opt-in';

const mockLogout = vi.hoisted(() => vi.fn());
const mockSelfPqState = vi.hoisted(() => vi.fn());

vi.mock('@/components/settings/WotSettings', () => ({
  default: () => <div data-testid="wot-settings" />,
}));

vi.mock('@/lib/nostr-bridge/cache-clear', () => ({
  clearAllClientCacheExceptSession: () => 0,
}));

vi.mock('@/lib/pq/capability', () => ({
  selfPqState: (...args: unknown[]) => mockSelfPqState(...args),
}));

vi.mock('@/lib/nostr-bridge', () => ({
  nostrActions: {
    ensureUserMetadata: vi.fn().mockResolvedValue(undefined),
    editUserMetadata: vi.fn(),
    logout: (...args: unknown[]) => mockLogout(...args),
  },
  useSignerReady: () => true,
  useMyPubkey: () => 'a'.repeat(64),
  useMyLoginMethod: () => 'nip07',
  useUserMetadata: () => ({
    displayName: 'Alice', name: 'Alice',
    picture: 'https://cdn.example/alice.jpg',
    banner: 'https://cdn.example/banner.jpg',
    about: null,
    nip05: null, website: null, lud16: null, pubkey: 'a'.repeat(64),
  }),
}));

vi.mock('@/components/media/MediaLibraryModal', () => ({
  default: ({ embedded }: { embedded?: boolean }) => <div data-testid="media-library-stub" data-embedded={embedded ? 'true' : 'false'} />,
}));

beforeEach(() => {
  mockSelfPqState.mockReset();
  mockSelfPqState.mockResolvedValue({
    canSend: false, capabilityUnknown: false, hasKeys: false, attestationPublished: false,
  });
});

describe('UserPanel personal media access', () => {
  beforeEach(() => mockLogout.mockClear());
  it('opens the media library inside the desktop settings workspace', async () => {
    const { default: UserPanel } = await import('./UserPanel');
    render(
      <LocaleProvider initialLocale="en">
        <UserPanel pubkey={'a'.repeat(64)} isMe initialEditing onClose={() => {}} />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByTestId('desktop-media-library'));
    expect(screen.getByTestId('media-library-stub')).toHaveAttribute('data-embedded', 'true');
    expect(screen.getByTestId('user-edit-modal')).toContainElement(screen.getByTestId('media-library-stub'));
  });

  it('shows the profile artwork together and logs out from settings', async () => {
    const { default: UserPanel } = await import('./UserPanel');
    const onClose = vi.fn();
    render(
      <LocaleProvider initialLocale="en">
        <UserPanel pubkey={'a'.repeat(64)} isMe initialEditing onClose={onClose} />
      </LocaleProvider>,
    );

    const preview = screen.getByTestId('profile-appearance-preview');
    expect(preview.querySelector('img[alt="Banner"]')).toHaveAttribute('src', 'https://cdn.example/banner.jpg');
    expect(preview.querySelector('img[alt="Picture"]')).toHaveAttribute('src', 'https://cdn.example/alice.jpg');
    expect(screen.getByTestId('save-profile-button')).toHaveClass('lc-pill-primary');
    expect(screen.getByTestId('desktop-logout')).toHaveClass('bg-red-500/20', 'text-red-300', 'hover:bg-red-500/30');

    fireEvent.click(screen.getByTestId('desktop-logout'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('closes settings on Escape instead of falling back to the legacy profile card', async () => {
    const { default: UserPanel } = await import('./UserPanel');
    const onClose = vi.fn();
    render(
      <LocaleProvider initialLocale="en">
        <UserPanel pubkey={'a'.repeat(64)} isMe initialEditing onClose={onClose} />
      </LocaleProvider>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('PreferencesPanel appearance controls', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('includes shared app appearance controls', async () => {
    const { PreferencesPanel } = await import('./UserPanel');

    render(
      <LocaleProvider initialLocale="en">
        <PreferencesPanel />
      </LocaleProvider>,
    );

    expect(screen.queryByTestId('appearance-accent-color')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('desktop-appearance-submenu'));
    expect(screen.getByTestId('appearance-accent-color')).toBeInTheDocument();
    expect(screen.getByTestId('appearance-background-color')).toBeInTheDocument();
    expect(screen.getByTestId('appearance-button-color')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-download-backup')).toBeInTheDocument();
    expect(screen.getByTestId('developer-signature-test')).toBeInTheDocument();
    expect(screen.getByTestId('clear-cache-button')).toHaveClass('bg-red-600', 'text-white');
    expect(screen.getByTestId('desktop-developer-settings')).toBe(screen.getByTestId('desktop-developer-settings').parentElement?.lastElementChild);
  });

  it('includes a direct-message opt-in reset toggle', async () => {
    const { PreferencesPanel } = await import('./UserPanel');

    render(
      <LocaleProvider initialLocale="en">
        <PreferencesPanel />
      </LocaleProvider>,
    );

    const label = screen.getByText('Direct messages');
    const button = label.closest('label')?.querySelector('button');
    expect(button).toBeTruthy();

    fireEvent.click(button!);
    expect(JSON.parse(localStorage.getItem(DM_OPT_IN_STORAGE_KEY) ?? '{}')).toMatchObject({
      directMessagesEnabled: true,
    });
  });

  it('saves an arbitrary number of feed relays, not exactly three', async () => {
    // The old panel had three fixed slots and rejected any other count.
    const { PreferencesPanel } = await import('./UserPanel');

    render(
      <LocaleProvider initialLocale="en">
        <PreferencesPanel />
      </LocaleProvider>,
    );

    // Trim the default list down to a single relay — previously impossible.
    const removeButtons = screen.getAllByRole('button', { name: /^Remove/ });
    for (let i = removeButtons.length - 1; i > 0; i -= 1) {
      fireEvent.click(removeButtons[i]);
    }
    fireEvent.change(screen.getByLabelText('Feed relay 1'), { target: { value: 'wss://one.example' } });
    fireEvent.click(screen.getByTestId('social-relay-save'));

    expect(JSON.parse(localStorage.getItem('obelisk:preferences') ?? '{}')).toMatchObject({
      socialRelays: ['wss://one.example'],
    });
  });

  it('adds a fourth feed relay', async () => {
    const { PreferencesPanel } = await import('./UserPanel');

    render(
      <LocaleProvider initialLocale="en">
        <PreferencesPanel />
      </LocaleProvider>,
    );

    // Relative to whatever is configured — the preferences module is a
    // singleton, so an earlier test in this file may have changed the list.
    const before = screen.getAllByLabelText(/^Feed relay /).length;
    fireEvent.click(screen.getByTestId('social-relay-add'));
    const inputs = screen.getAllByLabelText(/^Feed relay /);
    expect(inputs).toHaveLength(before + 1);
    fireEvent.change(inputs[inputs.length - 1], { target: { value: 'wss://extra.example' } });
    fireEvent.click(screen.getByTestId('social-relay-save'));

    const stored = JSON.parse(localStorage.getItem('obelisk:preferences') ?? '{}');
    expect(stored.socialRelays).toContain('wss://extra.example');
    expect(stored.socialRelays).toHaveLength(before + 1);
  });

  it('renders preference labels from the configured language', async () => {
    const { PreferencesPanel } = await import('./UserPanel');

    render(
      <LocaleProvider initialLocale="es">
        <PreferencesPanel />
      </LocaleProvider>,
    );

    expect(screen.getByText('Idioma')).toBeInTheDocument();
    expect(screen.getByText('Mensajes directos')).toBeInTheDocument();
    expect(screen.getByText(/DMs encriptados de Nostr/i)).toBeInTheDocument();
  });
});

describe('post-quantum status row', () => {
  it('shows a checking state before selfPqState resolves', async () => {
    let resolve!: (v: unknown) => void;
    mockSelfPqState.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { PreferencesPanel } = await import('./UserPanel');

    render(
      <LocaleProvider initialLocale="en">
        <PreferencesPanel />
      </LocaleProvider>,
    );

    expect(screen.getByText('Checking for post-quantum keys…')).toBeInTheDocument();
    resolve({ canSend: false, capabilityUnknown: false, hasKeys: false, attestationPublished: false });
  });

  it('explains the dead-end when keys are published but the signer reports nothing', async () => {
    mockSelfPqState.mockResolvedValue({
      canSend: false, capabilityUnknown: true, hasKeys: true, attestationPublished: true,
    });
    const { PreferencesPanel } = await import('./UserPanel');

    render(
      <LocaleProvider initialLocale="en">
        <PreferencesPanel />
      </LocaleProvider>,
    );

    // "Keys detected" alone would be the dead-end the UX audit found: the
    // user did everything right and nothing changes, unexplained.
    const row = await screen.findByTestId('pq-status-signer-unknown');
    expect(row).toHaveTextContent('Post-quantum keys detected on this account.');
    expect(row).toHaveTextContent('does not report post-quantum support');
    expect(mockSelfPqState).toHaveBeenCalledWith('a'.repeat(64), 'nip07');
  });

  it('confirms sending works once the signer advertises the pq scheme', async () => {
    mockSelfPqState.mockResolvedValue({
      canSend: true, capabilityUnknown: false, hasKeys: true, attestationPublished: true,
    });
    const { PreferencesPanel } = await import('./UserPanel');

    render(
      <LocaleProvider initialLocale="en">
        <PreferencesPanel />
      </LocaleProvider>,
    );

    const row = await screen.findByTestId('pq-status-ready');
    expect(row).toHaveTextContent('Your signer can send post-quantum messages.');
  });

  it('links to the guide when no keys are detected', async () => {
    mockSelfPqState.mockResolvedValue({
      canSend: false, capabilityUnknown: false, hasKeys: false, attestationPublished: false,
    });
    const { PreferencesPanel } = await import('./UserPanel');

    render(
      <LocaleProvider initialLocale="en">
        <PreferencesPanel />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('No post-quantum keys detected on this account.')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Set up post-quantum keys' })).toHaveAttribute(
      'href',
      '/guides/quantum-safe-dms',
    );
  });
});
