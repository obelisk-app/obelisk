import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InviteManager from './InviteManager';

describe('InviteManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeletons initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as any;
    render(<InviteManager serverId="srv1" />);
    expect(document.querySelectorAll('.lc-skeleton').length).toBeGreaterThan(0);
  });

  it('renders empty state', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invitations: [] }),
    }) as any;

    render(<InviteManager serverId="srv1" />);
    await waitFor(() => {
      expect(screen.getByText('No invitations yet')).toBeInTheDocument();
    });
  });

  it('renders invitations', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        invitations: [
          { id: 'inv1', code: 'abcdef1234567890', createdBy: 'pk1', targetPubkey: null, maxUses: 5, uses: 2, expiresAt: null, createdAt: '2026-04-09' },
        ],
      }),
    }) as any;

    render(<InviteManager serverId="srv1" />);
    await waitFor(() => {
      expect(screen.getByText('abcdef123456...')).toBeInTheDocument();
      expect(screen.getByText('2/5 uses')).toBeInTheDocument();
    });
  });

  it('renders the joined-members list under an invite', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        invitations: [
          {
            id: 'inv1',
            code: 'abcdef1234567890',
            createdBy: 'pk1',
            targetPubkey: null,
            maxUses: 10,
            uses: 2,
            expiresAt: null,
            createdAt: '2026-04-09',
            members: [
              { id: 'm1', pubkey: 'aaaaaaaa11111111', displayName: 'Alice', picture: null, nip05: null, joinedAt: '2026-04-10' },
              { id: 'm2', pubkey: 'bbbbbbbb22222222', displayName: 'Bob', picture: null, nip05: null, joinedAt: '2026-04-10' },
            ],
          },
        ],
      }),
    }) as any;

    render(<InviteManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getByTestId('invite-joined-members')).toBeInTheDocument();
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Joined via this link')).toBeInTheDocument();
  });

  it('does not render the joined-members section when no one has used the invite', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        invitations: [
          {
            id: 'inv1',
            code: 'abcdef1234567890',
            createdBy: 'pk1',
            targetPubkey: null,
            maxUses: 10,
            uses: 0,
            expiresAt: null,
            createdAt: '2026-04-09',
            members: [],
          },
        ],
      }),
    }) as any;

    render(<InviteManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getByText('0/10 uses')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('invite-joined-members')).not.toBeInTheDocument();
  });

  it('shows a Revoke button on active invites and hits the DELETE endpoint', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn((url: string, opts?: any) => {
      if (opts?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            invitation: {
              id: 'inv1',
              code: 'abcdef1234567890',
              createdBy: 'pk1',
              targetPubkey: null,
              maxUses: 5,
              uses: 2,
              expiresAt: null,
              createdAt: '2026-04-09',
              revokedAt: '2026-04-11T12:00:00Z',
              revokedBy: 'admin-pk',
              members: [
                { id: 'm1', pubkey: 'aaaaaaaa11111111', displayName: 'Alice', picture: null, nip05: null, joinedAt: '2026-04-10' },
              ],
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          invitations: [
            {
              id: 'inv1',
              code: 'abcdef1234567890',
              createdBy: 'pk1',
              targetPubkey: null,
              maxUses: 5,
              uses: 2,
              expiresAt: null,
              createdAt: '2026-04-09',
              revokedAt: null,
              revokedBy: null,
              members: [
                { id: 'm1', pubkey: 'aaaaaaaa11111111', displayName: 'Alice', picture: null, nip05: null, joinedAt: '2026-04-10' },
              ],
            },
          ],
        }),
      });
    });
    global.fetch = fetchMock as any;

    render(<InviteManager serverId="srv1" />);
    await waitFor(() => {
      expect(screen.getByTestId('revoke-invite-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('revoke-invite-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('invite-revoked-badge')).toBeInTheDocument();
    });

    // History preserved after revoke — the joined member still renders.
    expect(screen.getByTestId('invite-joined-members')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();

    // Revoke button is hidden once revoked; copy link is also gone.
    expect(screen.queryByTestId('revoke-invite-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('copy-invite-btn')).not.toBeInTheDocument();

    // DELETE endpoint was hit
    const deleteCall = fetchMock.mock.calls.find(([, opts]: any) => opts?.method === 'DELETE');
    expect(deleteCall?.[0]).toBe('/api/servers/srv1/invitations/inv1');

    confirmSpy.mockRestore();
  });

  it('does not call DELETE when revoke is cancelled in the confirm dialog', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        invitations: [
          {
            id: 'inv1',
            code: 'abcdef1234567890',
            createdBy: 'pk1',
            targetPubkey: null,
            maxUses: 5,
            uses: 2,
            expiresAt: null,
            createdAt: '2026-04-09',
            revokedAt: null,
            revokedBy: null,
            members: [],
          },
        ],
      }),
    });
    global.fetch = fetchMock as any;

    render(<InviteManager serverId="srv1" />);
    await waitFor(() => {
      expect(screen.getByTestId('revoke-invite-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('revoke-invite-btn'));

    expect(fetchMock.mock.calls.some(([, opts]: any) => opts?.method === 'DELETE')).toBe(false);

    confirmSpy.mockRestore();
  });

  it('renders a revoked invite with its badge and keeps the joined-members history', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        invitations: [
          {
            id: 'inv1',
            code: 'abcdef1234567890',
            createdBy: 'pk1',
            targetPubkey: null,
            maxUses: 10,
            uses: 2,
            expiresAt: null,
            createdAt: '2026-04-09',
            revokedAt: '2026-04-11T12:00:00Z',
            revokedBy: 'abcdef0123456789',
            members: [
              { id: 'm1', pubkey: 'aaaaaaaa11111111', displayName: 'Alice', picture: null, nip05: null, joinedAt: '2026-04-10' },
            ],
          },
        ],
      }),
    }) as any;

    render(<InviteManager serverId="srv1" />);

    await waitFor(() => {
      expect(screen.getByTestId('invite-revoked-badge')).toBeInTheDocument();
    });
    expect(screen.getByTestId('invite-joined-members')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByTestId('invite-revoked-by')).toBeInTheDocument();
    expect(screen.queryByTestId('revoke-invite-btn')).not.toBeInTheDocument();
  });

  it('creates an invitation', async () => {
    const user = userEvent.setup();
    let callCount = 0;
    global.fetch = vi.fn((url: string, opts?: any) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            invitation: { id: 'new', code: 'newcode12345678', createdBy: 'pk1', targetPubkey: null, maxUses: 1, uses: 0, expiresAt: null, createdAt: '2026-04-09' },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ invitations: [] }),
      });
    }) as any;

    render(<InviteManager serverId="srv1" />);
    await waitFor(() => {
      expect(screen.getByTestId('create-invite-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('create-invite-btn'));
    await waitFor(() => {
      expect(screen.getByText('newcode12345...')).toBeInTheDocument();
    });
  });
});
