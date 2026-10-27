import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@tests/support/intl';
import RelayInviteCodeCard from '@/components/settings/invite/RelayInviteCodeCard';
import type { RelayInviteCode } from '@/services/relay/relay-invite-api';

const LINK = 'https://obelisk.ar/invite/abc?relay=public.obelisk.ar';

function invite(over: Partial<RelayInviteCode> = {}): RelayInviteCode {
  return {
    code: 'abc', label: null, status: 'active', created_at: 1, max_uses: 10, uses: 3,
    expires_at: 2_000_000_000, redemptions: [], ...over,
  };
}

describe('RelayInviteCodeCard', () => {
  it('shows the link, its use and who joined, and copies or turns it off', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onRevoke = vi.fn();
    render(
      <LocaleProvider>
        <RelayInviteCodeCard invite={invite()} link={LINK} joined="npub1abc…wxyz" busy={false} onCopy={onCopy} onRevoke={onRevoke} />
      </LocaleProvider>,
    );
    expect(screen.getByText(LINK)).toBeTruthy();
    expect(screen.getByText(/3 of 10 used/)).toBeTruthy();
    expect(screen.getByText(/Joined: npub1abc…wxyz/)).toBeTruthy();
    await user.click(screen.getByTestId('relay-invite-copy'));
    await user.click(screen.getByTestId('relay-invite-revoke'));
    expect(onCopy).toHaveBeenCalledOnce();
    expect(onRevoke).toHaveBeenCalledOnce();
  });

  it('offers no actions on a link that no longer admits anyone', () => {
    render(
      <LocaleProvider>
        <RelayInviteCodeCard invite={invite({ status: 'exhausted', uses: 10 })} link={LINK} joined="" busy={false} onCopy={vi.fn()} onRevoke={vi.fn()} />
      </LocaleProvider>,
    );
    expect(screen.getByText(/Used up/)).toBeTruthy();
    expect(screen.queryByTestId('relay-invite-copy')).toBeNull();
    expect(screen.queryByText(/Joined/)).toBeNull();
  });
});
