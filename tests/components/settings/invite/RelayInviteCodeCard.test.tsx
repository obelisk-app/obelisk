import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@tests/support/intl';
import RelayInviteCodeCard from '@/components/settings/invite/RelayInviteCodeCard';
import type { RelayInviteCode } from '@/types/relay/relay-invite';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: (pk: string) => (pk === 'a'.repeat(64) ? { name: 'Alice', picture: null } : { name: null, picture: null }),
}));
const revokeInviteCode = vi.fn();
vi.mock('@/services/relay/relay-invite-api', () => ({
  revokeInviteCode: (...args: unknown[]) => revokeInviteCode(...args),
}));

const RELAY = 'wss://public.obelisk.ar';
const LINK = 'https://obelisk.ar/invite/abc?relay=public.obelisk.ar';
const NOW = Math.floor(Date.now() / 1000);

function invite(over: Partial<RelayInviteCode> = {}): RelayInviteCode {
  return {
    code: 'abc', label: 'meetup', status: 'active', created_at: 1, max_uses: 5, uses: 2,
    expires_at: NOW + 7 * 86_400 - 60,
    redemptions: [{ pubkey: ALICE, npub: '', at: NOW - 120 }, { pubkey: BOB, npub: '', at: NOW - 3600, evicted_at: NOW - 60 }],
    ...over,
  };
}

function card(over: Partial<RelayInviteCode> = {}) {
  const onChanged = vi.fn();
  render(
    <LocaleProvider>
      <RelayInviteCodeCard relay={RELAY} relayName="Public" invite={invite(over)} link={LINK} at={Date.now()} onChanged={onChanged} />
    </LocaleProvider>,
  );
  return { onChanged };
}

afterEach(() => {
  revokeInviteCode.mockReset();
});

describe('RelayInviteCodeCard', () => {
  it('shows the label, the link, uses, expiry and who joined, with removed people marked', () => {
    card();
    expect(screen.getByText('meetup')).toBeTruthy();
    expect(screen.getByText(LINK)).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('2 of 5 people joined')).toBeTruthy();
    expect(screen.getByText(/expires in 7 days/)).toBeTruthy();
    expect(screen.getByText('Who joined (2)')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    const people = screen.getAllByTestId('relay-invite-joined-person');
    expect(people[0]).not.toHaveAttribute('data-removed');
    expect(people[1]).toHaveAttribute('data-removed', 'true');
    expect(people[1]).toHaveTextContent('removed');
  });

  it('asks inline before turning a link off, and reads the list again after', async () => {
    const user = userEvent.setup();
    revokeInviteCode.mockResolvedValue(undefined);
    const { onChanged } = card();
    await user.click(screen.getByTestId('relay-invite-revoke'));
    expect(revokeInviteCode).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('relay-invite-revoke-no'));
    expect(screen.queryByTestId('relay-invite-revoke-confirm')).toBeNull();
    await user.click(screen.getByTestId('relay-invite-revoke'));
    await user.click(screen.getByTestId('relay-invite-revoke-yes'));
    expect(revokeInviteCode).toHaveBeenCalledWith(RELAY, 'abc');
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('reads Copied after a copy that worked', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    card();
    await user.click(screen.getByTestId('relay-invite-copy'));
    expect(screen.getByTestId('relay-invite-copy')).toHaveTextContent('Copied ✓');
  });

  it('offers no actions on a link that no longer admits anyone, and says nobody joined', () => {
    card({ status: 'exhausted', uses: 0, redemptions: [] });
    expect(screen.getByText('Used up')).toBeTruthy();
    expect(screen.queryByTestId('relay-invite-copy')).toBeNull();
    expect(screen.queryByTestId('relay-invite-revoke')).toBeNull();
    expect(screen.getByText(/Nobody has joined yet/)).toBeTruthy();
  });
});
