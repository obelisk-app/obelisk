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

  it('calls onLogout when disconnect button clicked', async () => {
    const onLogout = vi.fn();
    renderPanel(vi.fn(), onLogout);

    const logoutBtn = screen.getByText('Disconnect');
    await userEvent.click(logoutBtn);
    expect(onLogout).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', async () => {
    const onClose = vi.fn();
    renderPanel(onClose);

    const backdrop = document.body.querySelector('.fixed.inset-0') as HTMLElement | null;
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });

  it('returns null when no profile', () => {
    useAuthStore.setState({ profile: null });
    const { container } = renderPanel();
    expect(container.innerHTML).toBe('');
  });
});
