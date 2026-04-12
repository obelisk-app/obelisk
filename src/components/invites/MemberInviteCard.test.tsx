import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MemberInviteCard from './MemberInviteCard';

describe('MemberInviteCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as any;
    render(<MemberInviteCard serverId="srv1" />);
    expect(screen.getByTestId('member-invite-card')).toBeInTheDocument();
    expect(document.querySelectorAll('.lc-skeleton').length).toBeGreaterThan(0);
  });

  it('renders nothing when total is 0 (disabled)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        eligible: false,
        used: 0,
        total: 0,
        remaining: 0,
        minDaysActive: 7,
        memberSince: new Date().toISOString(),
        invites: [],
      }),
    }) as any;

    const { container } = render(<MemberInviteCard serverId="srv1" />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="member-invite-card"]')).not.toBeInTheDocument();
    });
  });

  it('shows ineligible message when tenure is too short', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        eligible: false,
        used: 0,
        total: 3,
        remaining: 3,
        minDaysActive: 7,
        memberSince: new Date().toISOString(),
        invites: [],
      }),
    }) as any;

    render(<MemberInviteCard serverId="srv1" />);
    await waitFor(() => {
      expect(screen.getByTestId('invite-not-eligible')).toBeInTheDocument();
      expect(screen.getByText(/7 days/)).toBeInTheDocument();
    });
  });

  it('shows remaining credits and generate button when eligible', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        eligible: true,
        used: 1,
        total: 3,
        remaining: 2,
        minDaysActive: 7,
        memberSince: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        invites: [
          {
            id: 'inv1',
            code: 'abcdef1234567890',
            maxUses: 1,
            uses: 1,
            expiresAt: null,
            createdAt: '2026-04-01',
            revokedAt: null,
            members: [],
          },
        ],
      }),
    }) as any;

    render(<MemberInviteCard serverId="srv1" />);
    await waitFor(() => {
      expect(screen.getByText('2/3 invites remaining')).toBeInTheDocument();
      expect(screen.getByTestId('create-member-invite')).toBeInTheDocument();
    });
  });

  it('does not show generate button when no credits remain', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        eligible: true,
        used: 3,
        total: 3,
        remaining: 0,
        minDaysActive: 7,
        memberSince: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        invites: [],
      }),
    }) as any;

    render(<MemberInviteCard serverId="srv1" />);
    await waitFor(() => {
      expect(screen.getByText('0/3 invites remaining')).toBeInTheDocument();
      expect(screen.queryByTestId('create-member-invite')).not.toBeInTheDocument();
    });
  });

  it('calls POST to create invite', async () => {
    const user = userEvent.setup();
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (opts?.method === 'POST') {
        return { ok: true, json: async () => ({ invitation: { id: 'new1', code: 'newcode123456789' } }) };
      }
      callCount++;
      return {
        ok: true,
        json: async () => ({
          eligible: true,
          used: callCount > 1 ? 1 : 0,
          total: 3,
          remaining: callCount > 1 ? 2 : 3,
          minDaysActive: 7,
          memberSince: new Date(Date.now() - 30 * 86_400_000).toISOString(),
          invites: [],
        }),
      };
    }) as any;

    render(<MemberInviteCard serverId="srv1" />);
    await waitFor(() => {
      expect(screen.getByTestId('create-member-invite')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('create-member-invite'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/servers/srv1/invitations',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
