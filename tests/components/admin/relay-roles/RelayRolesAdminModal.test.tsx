import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import RelayRolesAdminModal from '@/components/admin/relay-roles/RelayRolesAdminModal';
import * as roles from '@/services/relay/relay-roles';
import type { RelayRoles } from '@/services/relay/relay-roles';
import { LocaleProvider } from '@tests/support/intl';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


const PEOPLE = [
  { pubkey: 'b'.repeat(64), displayName: 'Bob Builder', nip05: 'bob@obelisk.ar', role: 'member' as const },
  { pubkey: 'c'.repeat(64), displayName: 'Carol Danvers', role: 'admin' as const },
];

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock, userMetadataFixture } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    useUserMetadata: () => userMetadataFixture({ displayName: 'Alice' }),
    useRelayPeople: () => PEOPLE,
  });
});

const RELAY = 'wss://relay.test';
const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

const SAVED: RelayRoles = {
  roles: [
    { id: 'mod', name: 'Moderator', tier: 2, color: '#ff0000', emoji: '🛡️' },
    { id: 'og', name: 'OG', tier: 1, color: '#00ff00', emoji: '' },
  ],
  holders: { mod: [ALICE], og: [] },
  updatedAt: 10,
};

afterEach(() => vi.restoreAllMocks());

describe('RelayRolesAdminModal', () => {
  it('offers nothing to save until something actually changes', () => {
    const { rerender } = renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={roles.EMPTY_RELAY_ROLES} onClose={() => {}} />);

    // Opened before the catalog arrived: the draft must adopt it, not read as
    // an edit that would publish an empty catalog over the relay's roles.
    rerender(<LocaleProvider initialLocale="en">{<><RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} /></>}</LocaleProvider>);

    expect(screen.getByDisplayValue('Moderator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save roles' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('mod name'), { target: { value: 'Mods' } });
    expect(screen.getByRole('button', { name: 'Save roles' })).not.toBeDisabled();
  });

  it('keeps local edits when a newer catalog arrives', () => {
    const { rerender } = renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('mod name'), { target: { value: 'Mods' } });
    rerender(<LocaleProvider initialLocale="en">{<><RelayRolesAdminModal relayUrl={RELAY} roles={{ ...SAVED, updatedAt: 20, holders: { mod: [ALICE, BOB], og: [] } }} onClose={() => {}} /></>}</LocaleProvider>);

    expect(screen.getByDisplayValue('Mods')).toBeInTheDocument();
  });

  it('treats a reorder back to the original order as no change', () => {
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move OG up' }));
    expect(screen.getByRole('button', { name: 'Save roles' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Move OG down' }));
    expect(screen.getByRole('button', { name: 'Save roles' })).toBeDisabled();
  });

  it('publishes a new role at the bottom of the ladder', async () => {
    const publish = vi.spyOn(roles, 'publishRoleCatalog').mockResolvedValue(undefined);
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('New role name'), { target: { value: 'Contributor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }));

    await waitFor(() => expect(publish).toHaveBeenCalledWith(RELAY, [
      { id: 'mod', name: 'Moderator', tier: 3, color: '#ff0000', emoji: '🛡️' },
      { id: 'og', name: 'OG', tier: 2, color: '#00ff00', emoji: '' },
      { id: 'contributor', name: 'Contributor', tier: 1, color: roles.DEFAULT_ROLE_COLOR, emoji: '' },
    ]));
  });

  it('re-tiers roles when the operator moves one up', async () => {
    const publish = vi.spyOn(roles, 'publishRoleCatalog').mockResolvedValue(undefined);
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move OG up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }));

    await waitFor(() => expect(publish).toHaveBeenCalledWith(RELAY, [
      { id: 'og', name: 'OG', tier: 2, color: '#00ff00', emoji: '' },
      { id: 'mod', name: 'Moderator', tier: 1, color: '#ff0000', emoji: '🛡️' },
    ]));
  });

  it('grants and revokes a role for one member', async () => {
    // Each publish settles only when the test says so, so the order is fixed.
    let settle = () => {};
    const publish = vi.spyOn(roles, 'publishRoleHolders')
      .mockImplementation(() => new Promise<void>((resolve) => { settle = resolve; }));
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '1 member' }));
    const panel = screen.getByTestId('role-members-mod');
    fireEvent.click(within(panel).getByRole('button', { name: 'Grant Moderator to Bob Builder' }));

    await waitFor(() => expect(publish).toHaveBeenCalledWith(RELAY, 'mod', [ALICE, BOB]));

    // The grant's publish keeps every holder button disabled until it settles,
    // and a click before that is dropped: wait for the button to come back.
    const revoke = within(panel).getByRole('button', { name: /^Revoke Moderator from/ });
    expect(revoke).toBeDisabled();
    settle();
    await waitFor(() => expect(revoke).toBeEnabled());
    fireEvent.click(revoke);
    settle();

    await waitFor(() => expect(publish).toHaveBeenLastCalledWith(RELAY, 'mod', []));
  });

  it('labels a role holder by short npub, never by hex', () => {
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '1 member' }));
    const panel = screen.getByTestId('role-members-mod');
    const npub = nip19.npubEncode(ALICE);
    expect(within(panel).getByText(`${npub.slice(0, 10)}…${npub.slice(-4)}`)).toBeInTheDocument();
    expect(within(panel).queryByText(new RegExp(`^${ALICE.slice(0, 16)}`))).toBeNull();
    expect(within(panel).getByRole('button', { name: /^Revoke Moderator from npub1/ })).toHaveClass('text-red-300');
  });

  it('searches relay members by name and NIP-05', () => {
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '1 member' }));
    const panel = screen.getByTestId('role-members-mod');
    // Everyone on the relay is offered until the search narrows it.
    expect(within(panel).getByText('Bob Builder')).toBeInTheDocument();
    expect(within(panel).getByText('Carol Danvers')).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText('Grant Moderator to'), { target: { value: 'carol' } });
    expect(within(panel).queryByText('Bob Builder')).not.toBeInTheDocument();
    expect(within(panel).getByText('Carol Danvers')).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText('Grant Moderator to'), { target: { value: 'bob@obelisk' } });
    expect(within(panel).getByText('Bob Builder')).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText('Grant Moderator to'), { target: { value: 'nobody here' } });
    expect(within(panel).getByText('No members match that search.')).toBeInTheDocument();
  });

  it('hides existing holders from the candidate list', () => {
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={{ ...SAVED, holders: { mod: [ALICE, BOB], og: [] } }} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '2 members' }));
    const candidates = screen.getByTestId('role-candidates-mod');
    expect(within(candidates).queryByText('Bob Builder')).not.toBeInTheDocument();
    expect(within(candidates).getByText('Carol Danvers')).toBeInTheDocument();
  });

  it('still grants to a pubkey pasted for a stranger', async () => {
    const publish = vi.spyOn(roles, 'publishRoleHolders').mockResolvedValue(undefined);
    const stranger = 'd'.repeat(64);
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '1 member' }));
    const panel = screen.getByTestId('role-members-mod');
    fireEvent.change(within(panel).getByLabelText('Grant Moderator to'), { target: { value: nip19.npubEncode(stranger) } });
    fireEvent.click(within(panel).getByRole('button', { name: /not a member of this relay yet/ }));

    await waitFor(() => expect(publish).toHaveBeenCalledWith(RELAY, 'mod', [ALICE, stranger]));
  });

  it('defers assignment until a freshly added role exists on the relay', () => {
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('New role name'), { target: { value: 'Contributor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));

    const row = screen.getByTestId('role-row-contributor');
    expect(within(row).getByRole('button', { name: '0 members' })).toBeDisabled();
  });

  it('picks a badge emoji for a role and clears it again', async () => {
    const publish = vi.spyOn(roles, 'publishRoleCatalog').mockResolvedValue(undefined);
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'og emoji' }));
    fireEvent.click(screen.getByTitle('grinning'));
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }));

    await waitFor(() => expect(publish).toHaveBeenCalledWith(RELAY, [
      { id: 'mod', name: 'Moderator', tier: 2, color: '#ff0000', emoji: '🛡️' },
      { id: 'og', name: 'OG', tier: 1, color: '#00ff00', emoji: '😀' },
    ]));

    // Clearing puts the draft back to what the relay already has, so the row
    // returns to its placeholder and there is nothing left to publish.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save roles' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Clear og emoji' }));

    expect(screen.getByRole('button', { name: 'og emoji' })).toHaveTextContent('+');
    expect(screen.queryByRole('button', { name: 'Clear og emoji' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save roles' })).toBeDisabled();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('opens the emoji picker in a fixed layer the panel cannot clip', () => {
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'og emoji' }));

    // Absolutely positioned inside the row it would be clipped by the panel's
    // overflow-hidden, and right-aligned it would run off the left edge.
    const popover = screen.getByTestId('role-emoji-popover-og');
    expect(popover).toHaveClass('fixed');
    expect(screen.getByRole('dialog', { name: 'Emoji picker' })).toHaveClass('left-0', 'top-full');
    expect(screen.getByRole('button', { name: 'og emoji' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByTestId('role-emoji-backdrop'));
    expect(screen.queryByTestId('role-emoji-popover-og')).not.toBeInTheDocument();
  });

  it('shows the saved emoji on its role row', () => {
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);

    expect(screen.getByRole('button', { name: 'mod emoji' })).toHaveTextContent('🛡️');
    expect(screen.getByRole('button', { name: 'og emoji' })).toHaveTextContent('+');
  });

  it('names every field, closes with the icon button and never reads avatar letters off hex', () => {
    renderLocalized(<RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} />);
    expect(screen.getByLabelText('mod color')).toHaveAttribute('type', 'color');
    const close = screen.getByRole('button', { name: 'Close' }); // one Close: the header's
    expect(close.querySelector('svg')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '1 member' }));
    const carol = within(screen.getByTestId('role-candidates-mod')).getByRole('button', { name: /Carol Danvers/ });
    expect(carol).toHaveTextContent(/^CD/);
  });

  it('counts roles and members with plurals in the reader\'s language', () => {
    render(<LocaleProvider initialLocale="pt"><RelayRolesAdminModal relayUrl={RELAY} roles={SAVED} onClose={() => {}} /></LocaleProvider>);

    expect(screen.getByText('2 cargos · só o operador do relay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 membro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'nenhum membro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar cargos' })).toBeDisabled();
  });
});
