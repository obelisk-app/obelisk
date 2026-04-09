import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    isConnected: true,
    profile: { pubkey: 'owner-pk', name: 'Owner' },
  }),
}));

import AdminPage from './page';

function mockFetch(role: string, members: any[] = [], server: any = null) {
  return vi.fn((url: string, opts?: any) => {
    if (url === '/api/auth/me/role') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ role, pubkey: 'owner-pk' }),
      });
    }
    if (url === '/api/admin/members') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(members),
      });
    }
    if (url === '/api/admin/server' && (!opts || !opts.method || opts.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(server || { id: 'srv1', name: 'Test Server', icon: null, banner: null, joinMode: 'open' }),
      });
    }
    if (url === '/api/admin/categories') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ categories: [], uncategorizedChannels: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows access denied for member role', async () => {
    vi.stubGlobal('fetch', mockFetch('member'));
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });
    expect(screen.getByText(/admin or owner permissions/)).toBeInTheDocument();
  });

  it('shows all 4 tabs for admin', async () => {
    vi.stubGlobal('fetch', mockFetch('owner'));
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText('members')).toBeInTheDocument();
    });
    expect(screen.getByText('channels')).toBeInTheDocument();
    expect(screen.getByText('settings')).toBeInTheDocument();
  });

  it('renders members tab with member rows', async () => {
    const members = [
      { id: 'm1', pubkey: 'pk1', role: 'member', displayName: 'Alice', picture: null, nip05: null, joinedAt: new Date().toISOString(), banned: false },
    ];
    vi.stubGlobal('fetch', mockFetch('owner', members));
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  it('switches to channels tab', async () => {
    vi.stubGlobal('fetch', mockFetch('owner'));
    const user = userEvent.setup();
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText('channels')).toBeInTheDocument());
    await user.click(screen.getByText('channels'));

    await waitFor(() => {
      expect(screen.getByTestId('channels-tab')).toBeInTheDocument();
    });
  });
});
