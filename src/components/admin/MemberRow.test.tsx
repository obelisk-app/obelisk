import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import MemberRow from './MemberRow';

const baseMember = {
  id: 'm1',
  pubkey: '1111aaaa2222bbbb3333cccc4444dddd5555eeee6666ffff7777888899990000',
  role: 'member' as const,
  displayName: 'Alice',
  picture: null,
  nip05: null,
  joinedAt: new Date().toISOString(),
  banned: false,
};

const noop = vi.fn();

describe('MemberRow', () => {
  it('renders member name and role badge', () => {
    render(
      <MemberRow member={baseMember} isOwner={false} onRoleChange={noop} onKick={noop} onBan={noop} onUnban={noop} />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByTestId('role-badge')).toHaveTextContent('member');
  });

  it('shows kick and ban buttons for non-owner targets', () => {
    render(
      <MemberRow member={baseMember} isOwner={false} onRoleChange={noop} onKick={noop} onBan={noop} onUnban={noop} />
    );
    expect(screen.getByText('Kick')).toBeInTheDocument();
    expect(screen.getByText('Ban')).toBeInTheDocument();
  });

  it('hides action buttons for owner targets', () => {
    const owner = { ...baseMember, role: 'owner' as const };
    render(
      <MemberRow member={owner} isOwner={false} onRoleChange={noop} onKick={noop} onBan={noop} onUnban={noop} />
    );
    expect(screen.queryByText('Kick')).not.toBeInTheDocument();
    expect(screen.queryByText('Ban')).not.toBeInTheDocument();
  });

  it('shows role select only when isOwner=true', () => {
    const { rerender } = render(
      <MemberRow member={baseMember} isOwner={false} onRoleChange={noop} onKick={noop} onBan={noop} onUnban={noop} />
    );
    expect(screen.queryByTestId('role-select')).not.toBeInTheDocument();

    rerender(
      <MemberRow member={baseMember} isOwner={true} onRoleChange={noop} onKick={noop} onBan={noop} onUnban={noop} />
    );
    expect(screen.getByTestId('role-select')).toBeInTheDocument();
  });

  it('clicking kick opens ConfirmDialog', async () => {
    const user = userEvent.setup();
    render(
      <MemberRow member={baseMember} isOwner={false} onRoleChange={noop} onKick={noop} onBan={noop} onUnban={noop} />
    );
    await user.click(screen.getByText('Kick'));
    expect(screen.getByText('Kick Member')).toBeInTheDocument();
  });

  it('clicking ban opens BanReasonDialog with reason input', async () => {
    const user = userEvent.setup();
    render(
      <MemberRow member={baseMember} isOwner={false} onRoleChange={noop} onKick={noop} onBan={noop} onUnban={noop} />
    );
    await user.click(screen.getByText('Ban'));
    expect(screen.getByTestId('ban-reason-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('ban-reason-input')).toBeInTheDocument();
  });

  it('confirming ban calls onBan with pubkey and reason', async () => {
    const onBan = vi.fn();
    const user = userEvent.setup();
    render(
      <MemberRow member={baseMember} isOwner={false} onRoleChange={noop} onKick={noop} onBan={onBan} onUnban={noop} />
    );
    await user.click(screen.getByText('Ban'));
    await user.type(screen.getByTestId('ban-reason-input'), 'Spamming');
    await user.click(screen.getByTestId('ban-confirm-btn'));
    expect(onBan).toHaveBeenCalledWith(baseMember.pubkey, 'Spamming');
  });

  it('shows unban button for banned members', () => {
    const banned = { ...baseMember, banned: true };
    render(
      <MemberRow member={banned} isOwner={false} onRoleChange={noop} onKick={noop} onBan={noop} onUnban={noop} />
    );
    expect(screen.getByText('Unban')).toBeInTheDocument();
    expect(screen.queryByText('Kick')).not.toBeInTheDocument();
  });
});
