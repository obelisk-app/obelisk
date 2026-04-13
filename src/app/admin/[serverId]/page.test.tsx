import { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const mockPush = vi.fn();
const mockRouter = { push: mockPush, replace: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    isConnected: true,
    profile: { pubkey: 'owner-pk', name: 'Owner' },
  }),
}));

import AdminServerPage from './page';

interface MockOpts {
  role?: 'owner' | 'admin' | 'member';
  instanceOwner?: boolean;
  members?: any[];
  servers?: any[];
  serverData?: any;
  wotEnabled?: boolean;
}

function mockFetch({ role = 'owner', instanceOwner = false, members = [], servers, serverData, wotEnabled = false }: MockOpts) {
  const defaultServers = [
    { id: 'srv1', name: 'Test Server', icon: null, role: 'owner', viaInstanceOwner: instanceOwner },
  ];
  const defaultServer = {
    id: 'srv1',
    name: 'Test Server',
    icon: null,
    banner: null,
    joinMode: 'open',
    wotEnabled,
    ownerPubkey: 'owner-pk',
  };

  return vi.fn((url: string, opts?: any) => {
    if (url.startsWith('/api/auth/me/role')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            role,
            pubkey: 'owner-pk',
            serverId: 'srv1',
            instanceOwner,
          }),
      });
    }
    if (url.startsWith('/api/admin/servers')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ servers: servers ?? defaultServers, instanceOwner }),
      });
    }
    if (url.startsWith('/api/admin/members') && (!opts || opts.method === undefined || opts.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(members),
      });
    }
    if (url.startsWith('/api/admin/server') && (!opts || !opts.method || opts.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(serverData ?? defaultServer),
      });
    }
    if (url.startsWith('/api/admin/categories')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ categories: [], uncategorizedChannels: [] }),
      });
    }
    if (url.startsWith('/api/admin/emojis')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ emojis: [] }) });
    }
    if (url.startsWith('/api/admin/roles')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    // AccessControlPanel + AccessPanel + InviteManager probes
    if (url.includes('/access')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          joinMode: 'open',
          wotEnabled,
          referentePubkey: null,
          referenteFetchedAt: null,
          minDaysActive: 7,
          minMessages: 20,
          invitesPerUser: 3,
          inviteExpiryHours: 168,
        }),
      });
    }
    if (url.includes('/wot/overrides')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ overrides: [] }) });
    }
    if (url.includes('/wot')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [], total: 0 }) });
    }
    if (url.includes('/invitations')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ invitations: [] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

// Reuse a single resolved promise so React.use() returns synchronously.
const params = Promise.resolve({ serverId: 'srv1' });

describe('AdminServerPage', () => {
  beforeAll(async () => {
    // Ensure the params promise is settled before any render so that
    // React.use() returns synchronously on the first test.
    await params;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows access denied for member role', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'member' }));
    render(<Suspense fallback={null}><AdminServerPage params={params} /></Suspense>);

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });
  });

  it('renders all 5 tabs for owner', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'owner' }));
    render(<Suspense fallback={null}><AdminServerPage params={params} /></Suspense>);

    await waitFor(() => {
      expect(screen.getByText('Members')).toBeInTheDocument();
    });
    expect(screen.getByText('Channels')).toBeInTheDocument();
    expect(screen.getByText('Access Control')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText(/^Bans/)).toBeInTheDocument();
    // Invitations is no longer a top-level tab — it lives inside Access Control
    expect(screen.queryByText('Invitations')).not.toBeInTheDocument();
  });

  it('renders members tab with member rows', async () => {
    const members = [
      {
        id: 'm1',
        pubkey: 'pk1',
        role: 'member',
        displayName: 'Alice',
        picture: null,
        nip05: null,
        joinedAt: new Date().toISOString(),
        banned: false,
      },
    ];
    vi.stubGlobal('fetch', mockFetch({ role: 'owner', members }));
    render(<Suspense fallback={null}><AdminServerPage params={params} /></Suspense>);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  it('switches to channels tab', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'owner' }));
    const user = userEvent.setup();
    render(<Suspense fallback={null}><AdminServerPage params={params} /></Suspense>);

    await waitFor(() => expect(screen.getByText('Channels')).toBeInTheDocument());
    await user.click(screen.getByText('Channels'));

    await waitFor(() => {
      expect(screen.getByTestId('channels-tab')).toBeInTheDocument();
    });
  });

  it('shows instance-owner badge when caller is instance owner', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'owner', instanceOwner: true }));
    render(<Suspense fallback={null}><AdminServerPage params={params} /></Suspense>);

    await waitFor(() => {
      expect(screen.getByTestId('instance-owner-badge')).toBeInTheDocument();
    });
  });

  it('hides instance-owner badge when caller is a regular owner', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'owner', instanceOwner: false }));
    render(<Suspense fallback={null}><AdminServerPage params={params} /></Suspense>);

    await waitFor(() => {
      expect(screen.getByText('Members')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('instance-owner-badge')).not.toBeInTheDocument();
  });

  it('shows ownership transfer field only for instance owner', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'owner', instanceOwner: true }));
    const user = userEvent.setup();
    render(<Suspense fallback={null}><AdminServerPage params={params} /></Suspense>);

    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument());
    await user.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByTestId('ownership-section')).toBeInTheDocument();
    });
    expect(screen.getByTestId('owner-pubkey-input')).toBeInTheDocument();
  });

  it('hides ownership transfer field for non-instance owner', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'owner', instanceOwner: false }));
    const user = userEvent.setup();
    render(<Suspense fallback={null}><AdminServerPage params={params} /></Suspense>);

    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument());
    await user.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-tab')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('ownership-section')).not.toBeInTheDocument();
  });

  it('Settings tab links to Access Control tab instead of duplicating it', async () => {
    vi.stubGlobal('fetch', mockFetch({ role: 'owner', wotEnabled: false }));
    const user = userEvent.setup();
    render(<Suspense fallback={null}><AdminServerPage params={params} /></Suspense>);

    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument());
    await user.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByTestId('goto-access-control')).toBeInTheDocument();
    });
    // The legacy joinmode buttons no longer live in Settings
    expect(screen.queryByTestId('joinmode-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('joinmode-invite-only')).not.toBeInTheDocument();
  });

  it('renders the server picker when caller has multiple servers', async () => {
    const servers = [
      { id: 'srv1', name: 'Test Server', icon: null, role: 'owner', viaInstanceOwner: false },
      { id: 'srv2', name: 'Other', icon: null, role: 'admin', viaInstanceOwner: false },
    ];
    vi.stubGlobal('fetch', mockFetch({ role: 'owner', servers }));
    render(<Suspense fallback={null}><AdminServerPage params={params} /></Suspense>);

    await waitFor(() => {
      expect(screen.getByTestId('server-picker-trigger')).toBeInTheDocument();
    });
  });
});
