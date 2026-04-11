import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ code: 'test-code' }),
}));

// Stub the LoginModal so we don't have to wire up NDK + Nostr internals.
vi.mock('@/components/LoginModal', () => ({
  default: ({ isOpen, onSuccess }: { isOpen: boolean; onSuccess?: () => void }) =>
    isOpen ? (
      <div data-testid="login-modal">
        <button data-testid="mock-login-success" onClick={() => onSuccess?.()}>
          simulate-login
        </button>
      </div>
    ) : null,
}));

// Controllable auth store mock.
let isConnectedMock = false;
const restoreSessionMock = vi.fn(async () => isConnectedMock);
vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    isConnected: isConnectedMock,
    restoreSession: restoreSessionMock,
  }),
}));

import InvitePage from './page';

const serverInfo = {
  id: 'srv1',
  name: 'Test Server',
  icon: null,
  banner: null,
  _count: { members: 3 },
};

function mockInvitationGet() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ server: serverInfo }),
  } as Response);
}

describe('InvitePage (auth flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isConnectedMock = false;
  });

  it('shows "Log in to Accept Invite" when the user is not authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn(() => mockInvitationGet()));

    render(<InvitePage />);

    await waitFor(() => {
      expect(screen.getByTestId('accept-invite-btn')).toHaveTextContent(
        'Log in to Accept Invite'
      );
    });
    expect(
      screen.getByText(/You need to log in or create an account/i)
    ).toBeInTheDocument();
  });

  it('opens the login modal when an unauthenticated user clicks accept', async () => {
    vi.stubGlobal('fetch', vi.fn(() => mockInvitationGet()));

    render(<InvitePage />);

    const btn = await screen.findByTestId('accept-invite-btn');
    fireEvent.click(btn);

    expect(screen.getByTestId('login-modal')).toBeInTheDocument();
  });

  it('auto-retries the join after a successful login', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ alreadyMember: false }),
        } as Response);
      }
      return mockInvitationGet();
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<InvitePage />);

    const btn = await screen.findByTestId('accept-invite-btn');
    fireEvent.click(btn);

    // Modal opened; simulate login success — the join should fire automatically.
    isConnectedMock = true;
    fireEvent.click(screen.getByTestId('mock-login-success'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/invitations/test-code',
        expect.objectContaining({ method: 'POST' })
      );
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/chat');
    });
  });

  it('opens the login modal if the join POST returns 401 (stale session)', async () => {
    isConnectedMock = true; // client thinks it's logged in...
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Unauthorized' }),
        } as Response);
      }
      return mockInvitationGet();
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<InvitePage />);

    const btn = await screen.findByTestId('accept-invite-btn');
    await waitFor(() => {
      expect(btn).toHaveTextContent('Accept Invite');
    });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByTestId('login-modal')).toBeInTheDocument();
    });
  });

  it('joins directly when the user is already authenticated', async () => {
    isConnectedMock = true;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ alreadyMember: true }),
        } as Response);
      }
      return mockInvitationGet();
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<InvitePage />);

    const btn = await screen.findByTestId('accept-invite-btn');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/chat');
    });
    expect(screen.queryByTestId('login-modal')).not.toBeInTheDocument();
  });
});
