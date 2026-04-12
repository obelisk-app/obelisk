import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@/i18n/context';
import ProfilePanel from '../ProfilePanel';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderPanel(onClose = vi.fn(), onLogout = vi.fn()) {
  return render(
    <LocaleProvider initialLocale="en">
      <ProfilePanel onClose={onClose} onLogout={onLogout} />
    </LocaleProvider>
  );
}

describe('ProfilePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up auth store with a profile
    useAuthStore.setState({
      isConnected: true,
      profile: {
        pubkey: 'abc123def456',
        npub: 'npub1abc123def456abc123def456abc123def456abc123def456abc123def456ab',
        displayName: 'TestUser',
        name: 'testuser',
        picture: 'https://example.com/avatar.jpg',
        nip05: 'test@example.com',
        about: 'I am a test user',
        banner: 'https://example.com/banner.jpg',
      },
    });
    // Set active server for nickname loading
    useChatStore.setState({ activeServerId: 'server-1' });
    // Mock GET /api/members/me?serverId=... to return empty nickname
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ nickname: '' }) });
  });

  it('renders profile information', () => {
    renderPanel();
    expect(screen.getByText('TestUser')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('I am a test user')).toBeInTheDocument();
  });

  it('renders avatar image', () => {
    renderPanel();
    const img = screen.getByAltText('TestUser');
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('renders Sync from Nostr button', () => {
    renderPanel();
    expect(screen.getByText('Sync from Nostr')).toBeInTheDocument();
  });

  it('renders nickname input', () => {
    renderPanel();
    expect(screen.getByPlaceholderText('Leave empty to use your Nostr name')).toBeInTheDocument();
  });

  it('calls onLogout when disconnect button clicked', async () => {
    const onLogout = vi.fn();
    renderPanel(vi.fn(), onLogout);

    const logoutBtn = screen.getByText('Disconnect');
    await userEvent.click(logoutBtn);
    expect(onLogout).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', async () => {
    const onClose = vi.fn();
    const { container } = renderPanel(onClose);

    // The backdrop is the first child div with fixed inset-0
    const backdrop = container.querySelector('.fixed.inset-0');
    if (backdrop) await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows syncing state when sync button clicked', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('sync-nostr')) {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, json: async () => ({ displayName: 'Updated' }) }), 100);
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderPanel();
    const syncBtn = screen.getByText('Sync from Nostr');
    await userEvent.click(syncBtn);
    expect(screen.getByText('Syncing...')).toBeInTheDocument();
  });

  it('shows success message after successful sync', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('sync-nostr')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            displayName: 'Updated',
            picture: 'pic.jpg',
            nip05: null,
            about: null,
            banner: null,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderPanel();
    await userEvent.click(screen.getByText('Sync from Nostr'));

    await waitFor(() => {
      expect(screen.getByText('Profile updated from Nostr')).toBeInTheDocument();
    });
  });

  it('shows error message when sync fails', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('sync-nostr')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderPanel();
    await userEvent.click(screen.getByText('Sync from Nostr'));

    await waitFor(() => {
      expect(screen.getByText('Could not fetch profile')).toBeInTheDocument();
    });
  });

  it('returns null when no profile', () => {
    useAuthStore.setState({ profile: null });
    const { container } = renderPanel();
    expect(container.innerHTML).toBe('');
  });
});
