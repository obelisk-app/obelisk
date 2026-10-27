import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@tests/support/intl';
import RelayInviteCodeCard from '@/components/settings/invite/RelayInviteCodeCard';
import type { RelayInviteCode } from '@/services/relay/relay-invite-api';

const ALICE = 'a'.repeat(64);
vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: (pk: string) => (pk === 'a'.repeat(64) ? { name: 'Alice', picture: null } : { name: null, picture: null }),
}));

const LINK = 'https://obelisk.ar/invite/abc?relay=public.obelisk.ar';

function invite(over: Partial<RelayInviteCode> = {}): RelayInviteCode {
  return {
    code: 'abc', label: null, status: 'active', created_at: 1, max_uses: 100, uses: 1,
    expires_at: 2_000_000_000, redemptions: [], ...over,
  };
}

function card(over: Partial<Parameters<typeof RelayInviteCodeCard>[0]> = {}) {
  const props = {
    invite: invite(), link: LINK, copied: false, usedPercent: 1, daysLeft: 7,
    joined: [{ pubkey: ALICE, at: Math.floor(Date.now() / 1000) - 120 }],
    busy: false, onCopy: vi.fn(), onRevoke: vi.fn(), ...over,
  };
  render(<LocaleProvider><RelayInviteCodeCard {...props} /></LocaleProvider>);
  return props;
}

describe('RelayInviteCodeCard', () => {
  it('shows the link, how full it is, when it ends and who joined by name', () => {
    card();
    expect(screen.getByText(LINK)).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('1 of 100 people joined')).toBeTruthy();
    expect(screen.getByText(/expires in 7 days/)).toBeTruthy();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Who joined (1)')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('joined 2m')).toBeTruthy();
  });

  it('copies and turns off, and says when the copy worked', async () => {
    const user = userEvent.setup();
    const props = card();
    await user.click(screen.getByTestId('relay-invite-copy'));
    await user.click(screen.getByTestId('relay-invite-revoke'));
    expect(props.onCopy).toHaveBeenCalledOnce();
    expect(props.onRevoke).toHaveBeenCalledOnce();
  });

  it('reads Copied right after a copy', () => {
    card({ copied: true });
    expect(screen.getByTestId('relay-invite-copy')).toHaveTextContent('Copied ✓');
  });

  it('offers no actions on a link that no longer admits anyone, and says nobody joined', () => {
    card({ invite: invite({ status: 'exhausted', uses: 0 }), joined: [] });
    expect(screen.getByText('Used up')).toBeTruthy();
    expect(screen.queryByTestId('relay-invite-copy')).toBeNull();
    expect(screen.getByText(/Nobody has joined yet/)).toBeTruthy();
  });
});
