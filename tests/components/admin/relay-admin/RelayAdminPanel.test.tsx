import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { ConfirmDialogHost } from '@/components/ui/overlays/ConfirmDialog';
import RelayAdminPanel from '@/components/admin/relay-admin/RelayAdminPanel';
import { safeNpub, shortNpubLabel } from '@/utils/identity/short-npub';

const ADMIN = 'a'.repeat(64);
const MEMBER = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);

function mount(onClose = vi.fn(), extraMembership = false) {
  const removeUser = vi.fn(async () => {});
  const removePermission = vi.fn(async () => {});
  const bridge = fakeBridge(
    {
      groups: [groupFixture({ id: 'g1', name: 'general' }), groupFixture({ id: 'g2', name: 'random' })],
      adminsByGroup: { g1: [ADMIN] },
      membersByGroup: { g1: [ADMIN, MEMBER], g2: extraMembership ? [OTHER, ADMIN] : [OTHER] },
      userMetadata: { [ADMIN]: {
        pubkey: ADMIN, name: 'Fabricio', displayName: null, picture: 'https://images.example/avatar.png',
        about: null, banner: null, nip05: null, lud16: null, website: null,
      } },
    },
    { removeUser, removePermission, ensureUserMetadata: async () => {} },
  );
  renderWithBridge(<><RelayAdminPanel onClose={onClose} /><ConfirmDialogHost /></>, bridge);
  return { onClose, removeUser, removePermission };
}

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const filterInput = () => screen.getByPlaceholderText('Search by name, public key, or channel…');

describe('RelayAdminPanel', () => {
  it('shows the admin title and its explanatory subtitle', () => {
    mount();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Relay admins & members');
    expect(screen.getByText(/Select channel memberships/)).toBeInTheDocument();
  });

  it('closes from the header close button', () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lists one row per admin or member per channel, with the role', () => {
    mount();
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Fabricio');
    expect(rows[0]).toHaveTextContent(shortNpubLabel(ADMIN));
    expect(rows[0].querySelector('img')).toHaveAttribute('src', 'https://images.example/avatar.png');
    expect(rows[0]).not.toHaveTextContent(ADMIN);
    expect(rows[0]).toHaveTextContent('general');
    expect(within(rows[0]).getByText('admin')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Member')).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent('random');
    expect(screen.getByText('0 selected · 3 memberships shown · 3 total')).toBeInTheDocument();
  });

  it('links to the profile and shows multiple channel roles under one person', () => {
    mount(vi.fn(), true);
    expect(bodyRows()).toHaveLength(3);
    const profile = screen.getByRole('link', { name: /Fabricio/ });
    expect(profile).toHaveAttribute('href', `/p/${safeNpub(ADMIN)}`);
    expect(profile).toHaveAttribute('target', '_blank');
    const row = within(bodyRows()[0]);
    const admin = row.getByRole('checkbox', { name: 'Select Fabricio in general' });
    const member = row.getByRole('checkbox', { name: 'Select Fabricio in random' });
    fireEvent.click(member);
    expect(admin).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Demote' })).toBeDisabled();
    fireEvent.click(admin);
    expect(screen.getByRole('button', { name: 'Demote' })).toBeEnabled();
  });

  it('filters by text, by role and by channel', () => {
    mount();
    fireEvent.change(filterInput(), { target: { value: 'fabricio' } });
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('Fabricio');
    fireEvent.change(filterInput(), { target: { value: 'rand' } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(filterInput(), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('All roles'), { target: { value: 'admin' } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(screen.getByDisplayValue('Admins only'), { target: { value: 'all' } });
    fireEvent.change(screen.getByDisplayValue('All channels'), { target: { value: 'g2' } });
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent(shortNpubLabel(OTHER));
  });

  it('lists every channel in the channel filter', () => {
    mount();
    const options = within(screen.getByLabelText('Channel')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All channels', 'general', 'random']);
  });

  it('shows the empty copy instead of the table when nothing matches', () => {
    mount();
    fireEvent.change(filterInput(), { target: { value: 'zzz' } });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('No entries match the current filters.')).toBeInTheDocument();
  });

  it('selecting rows updates the count and enables the kick action', () => {
    mount();
    const kick = screen.getByRole('button', { name: 'Kick' });
    expect(kick).toBeDisabled();
    fireEvent.click(within(bodyRows()[1]).getByRole('checkbox'));
    expect(screen.getByText('1 selected · 3 memberships shown · 3 total')).toBeInTheDocument();
    expect(kick).toBeEnabled();
  });

  it('enables demote only when an admin is selected', () => {
    mount();
    const demote = screen.getByRole('button', { name: 'Demote' });
    fireEvent.click(within(bodyRows()[1]).getByRole('checkbox'));
    expect(demote).toBeDisabled();
    fireEvent.click(within(bodyRows()[0]).getByRole('checkbox'));
    expect(demote).toBeEnabled();
  });

  it('kicks every selected person after the confirmation, then clears the selection', async () => {
    const { removeUser } = mount();
    fireEvent.click(within(bodyRows()[1]).getByRole('checkbox'));
    fireEvent.click(within(bodyRows()[2]).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Kick' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('general');
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(removeUser).toHaveBeenCalledTimes(2));
    expect(removeUser).toHaveBeenCalledWith('g1', MEMBER);
    expect(removeUser).toHaveBeenCalledWith('g2', OTHER);
    await waitFor(() => expect(screen.getByText('0 selected · 3 memberships shown · 3 total')).toBeInTheDocument());
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const { removeUser, removePermission } = mount();
    fireEvent.click(within(bodyRows()[0]).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Demote' }));
    fireEvent.click(await screen.findByTestId('confirm-dialog-cancel'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(removeUser).not.toHaveBeenCalled();
    expect(removePermission).not.toHaveBeenCalled();
    expect(screen.getByText('1 selected · 3 memberships shown · 3 total')).toBeInTheDocument();
  });
});

describe('RelayAdminPanel accessibility', () => {
  it('names the filter input, both selects and the table', () => {
    mount();
    expect(screen.getByLabelText('Search by name, public key, or channel…').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Role').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Channel').tagName).toBe('SELECT');
    expect(screen.getByRole('table', { name: 'Relay admins & members' })).toBeInTheDocument();
    screen.getAllByRole('columnheader').forEach((h) => expect(h).toHaveAttribute('scope', 'col'));
  });

  it('names each row checkbox after the person it selects', () => {
    mount();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    expect(boxes[2]).toHaveAccessibleName(expect.stringMatching(/^Select npub1/));
  });
});
