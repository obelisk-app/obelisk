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
