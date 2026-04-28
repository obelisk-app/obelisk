import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InviteCreditPolicy from './InviteCreditPolicy';

describe('InviteCreditPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with current values', () => {
    render(
      <InviteCreditPolicy
        serverId="srv1"
        invitesPerUser={3}
        inviteExpiryHours={168}
        minDaysActive={7}
      />
    );
    expect(screen.getByTestId('invite-credit-policy')).toBeInTheDocument();
    expect(screen.getByTestId('member-invites-toggle')).toHaveTextContent('Enabled');
  });

  it('shows Disabled when invitesPerUser is 0', () => {
    render(
      <InviteCreditPolicy
        serverId="srv1"
        invitesPerUser={0}
        inviteExpiryHours={168}
        minDaysActive={7}
      />
    );
    expect(screen.getByTestId('member-invites-toggle')).toHaveTextContent('Disabled');
    expect(screen.queryByTestId('invites-per-user')).not.toBeInTheDocument();
  });

  it('shows Save button when values change', async () => {
    const user = userEvent.setup();
    render(
      <InviteCreditPolicy
        serverId="srv1"
        invitesPerUser={3}
        inviteExpiryHours={168}
        minDaysActive={7}
      />
    );

    expect(screen.queryByTestId('save-credit-policy')).not.toBeInTheDocument();

    const input = screen.getByTestId('invites-per-user');
    await user.clear(input);
    await user.type(input, '5');

    expect(screen.getByTestId('save-credit-policy')).toBeInTheDocument();
  });

  it('calls PATCH on save', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;

    render(
      <InviteCreditPolicy
        serverId="srv1"
        invitesPerUser={3}
        inviteExpiryHours={168}
        minDaysActive={7}
        onSaved={onSaved}
      />
    );

    const input = screen.getByTestId('invites-per-user');
    await user.clear(input);
    await user.type(input, '5');
    await user.click(screen.getByTestId('save-credit-policy'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/servers/srv1/access',
        expect.objectContaining({ method: 'PATCH' })
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('toggles between enabled and disabled', async () => {
    const user = userEvent.setup();
    render(
      <InviteCreditPolicy
        serverId="srv1"
        invitesPerUser={3}
        inviteExpiryHours={168}
        minDaysActive={7}
      />
    );

    await user.click(screen.getByTestId('member-invites-toggle'));
    expect(screen.getByTestId('member-invites-toggle')).toHaveTextContent('Disabled');
    expect(screen.queryByTestId('invites-per-user')).not.toBeInTheDocument();
  });
});
