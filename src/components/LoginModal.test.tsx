import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/nostr', () => ({
  connectNDK: vi.fn().mockResolvedValue(undefined),
  getNDK: vi.fn(() => ({})),
  loginWithExtension: vi.fn(),
  loginWithNsec: vi.fn(),
  loginWithBunker: vi.fn(),
  createNewAccount: vi.fn(),
  createNostrConnectSession: vi.fn(),
}));

vi.mock('@/lib/backend-auth', () => ({
  authenticateWithBackend: vi.fn().mockResolvedValue(undefined),
  performBackendAuth: vi.fn().mockResolvedValue({ pubkey: 'abc123' }),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn(() => ({
    setUser: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
    isLoading: false,
    error: null,
  })),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => null,
}));

vi.mock('@/components/ProfileEditor', () => ({
  default: ({ mode, onComplete, onSkip }: { mode: string; onComplete: () => void; onSkip?: () => void }) => (
    <div data-testid="profile-editor">
      <div>{mode === 'setup' ? 'profileEditor.setupTitle' : 'profileEditor.editTitle'}</div>
      <button onClick={onComplete}>complete</button>
      {onSkip && <button onClick={onSkip}>skip</button>}
    </div>
  ),
}));

import LoginModal from './LoginModal';
import { createNewAccount } from '@/lib/nostr';
import type { NDKUser } from '@nostr-dev-kit/ndk';
import { useAuthStore } from '@/store/auth';

describe('LoginModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  const mockSetUser = vi.fn();
  const mockSetLoading = vi.fn();
  const mockSetError = vi.fn();
  const mockSyncProfile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as any).mockReturnValue({
      setUser: mockSetUser,
      setLoading: mockSetLoading,
      setError: mockSetError,
      syncProfile: mockSyncProfile,
      isLoading: false,
      error: null,
    });
    Object.defineProperty(window, 'nostr', { value: undefined, writable: true, configurable: true });
  });

  it('renders method selection when open', () => {
    render(<LoginModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Connect to Nostr')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<LoginModal isOpen={false} onClose={mockOnClose} />);
    expect(screen.queryByText('Connect to Nostr')).not.toBeInTheDocument();
  });

  it('shows Create New Account button', () => {
    render(<LoginModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Create New Account')).toBeInTheDocument();
    expect(screen.getByText('Generate a fresh Nostr identity')).toBeInTheDocument();
  });

  it('shows nsec backup screen after creating account', async () => {
    const user = userEvent.setup();
    vi.mocked(createNewAccount).mockResolvedValue({
      user: { pubkey: "abc123", fetchProfile: vi.fn() } as unknown as NDKUser,
      nsec: 'nsec1testkey123',
    });

    render(<LoginModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    await user.click(screen.getByText('Create New Account'));

    await waitFor(() => {
      expect(screen.getByText('Account Created')).toBeInTheDocument();
    });

    // Shows the nsec
    expect(screen.getByText('nsec1testkey123')).toBeInTheDocument();

    // Shows backup warning
    expect(screen.getByText(/If you lose this key, you lose your account/)).toBeInTheDocument();

    // Shows nostr-wot recommendation with download links
    expect(screen.getByText('Chrome Web Store')).toBeInTheDocument();
    expect(screen.getByText('nostr-wot.com/downloads')).toBeInTheDocument();

    // Shows continue button
    expect(screen.getByText("I've saved my key — Continue")).toBeInTheDocument();

    // Shows download backup button
    expect(screen.getByText('Download backup (.txt)')).toBeInTheDocument();

    // Shows backup confirmation checkbox
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('disables continue until backup is confirmed via checkbox', async () => {
    const user = userEvent.setup();
    vi.mocked(createNewAccount).mockResolvedValue({
      user: { pubkey: "abc123", fetchProfile: vi.fn() } as unknown as NDKUser,
      nsec: 'nsec1testkey123',
    });

    render(<LoginModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    await user.click(screen.getByText('Create New Account'));

    await waitFor(() => {
      expect(screen.getByText('Account Created')).toBeInTheDocument();
    });

    const continueBtn = screen.getByText("I've saved my key — Continue");
    expect(continueBtn).toBeDisabled();

    // Clicking while disabled should not advance
    await user.click(continueBtn);
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(mockOnSuccess).not.toHaveBeenCalled();

    // Tick the confirmation checkbox
    await user.click(screen.getByRole('checkbox'));
    expect(continueBtn).not.toBeDisabled();
  });

  it('shows profile setup when continue clicked after confirming backup', async () => {
    const user = userEvent.setup();
    vi.mocked(createNewAccount).mockResolvedValue({
      user: { pubkey: "abc123", fetchProfile: vi.fn() } as unknown as NDKUser,
      nsec: 'nsec1testkey123',
    });

    render(<LoginModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    await user.click(screen.getByText('Create New Account'));

    await waitFor(() => {
      expect(screen.getByText('Account Created')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByText("I've saved my key — Continue"));

    // Should now show profile setup instead of closing
    await waitFor(() => {
      expect(screen.getByText('profileEditor.setupTitle')).toBeInTheDocument();
    });
  });

  it('downloads nsec as a txt file when download backup clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(createNewAccount).mockResolvedValue({
      user: { pubkey: "abc123", fetchProfile: vi.fn() } as unknown as NDKUser,
      nsec: 'nsec1testkey123',
    });

    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<LoginModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    await user.click(screen.getByText('Create New Account'));

    await waitFor(() => {
      expect(screen.getByText('Account Created')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Download backup (.txt)'));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  it('shows extension button text with nostr-wot first', () => {
    Object.defineProperty(window, 'nostr', { value: { getPublicKey: vi.fn() }, writable: true, configurable: true });
    render(<LoginModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('nostr-wot, Amber, nos2x, or similar')).toBeInTheDocument();
  });

  it('shows nsec and bunker login options', () => {
    render(<LoginModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Private Key (nsec)')).toBeInTheDocument();
    expect(screen.getByText('Nostr Bunker')).toBeInTheDocument();
  });

  it('navigates to nsec input screen', async () => {
    const user = userEvent.setup();
    render(<LoginModal isOpen={true} onClose={mockOnClose} />);
    await user.click(screen.getByText('Private Key (nsec)'));
    expect(screen.getByPlaceholderText('nsec1...')).toBeInTheDocument();
  });
});
