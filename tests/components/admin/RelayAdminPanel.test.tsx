import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import { StateStore } from '@/services/nostr-bridge/state-store';

const ADMIN = 'a'.repeat(64);
const MEMBER = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);
const membersByGroup = new StateStore<Record<string, string[]>>({ g1: [ADMIN, MEMBER], g2: [OTHER] });

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock, groupFixture } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    useGroups: () => [groupFixture({ id: 'g1', name: 'general' }), groupFixture({ id: 'g2', name: 'random' })],
    useAdminsByGroup: () => ({ g1: [ADMIN] }),
    getBridgeImpl: () => ({ membersByGroup }),
  });
});

import RelayAdminPanel from '@/components/admin/RelayAdminPanel';

function mount(onClose = vi.fn()) {
  render(<LocaleProvider initialLocale="en"><RelayAdminPanel onClose={onClose} /></LocaleProvider>);
  return { onClose };
}

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('RelayAdminPanel', () => {
  it('shows the admin title and its explanatory subtitle', () => {
    mount();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Relay admins & members');
    expect(screen.getByText(/Bulk cleanup across every channel/)).toBeInTheDocument();
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
    expect(rows[0]).toHaveTextContent(ADMIN);
    expect(rows[0]).toHaveTextContent('general');
    expect(within(rows[0]).getByText('admin')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Member')).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent('random');
    expect(screen.getByText('0 selected · 3 shown · 3 total')).toBeInTheDocument();
  });

  it('filters by text, by role and by channel', () => {
    mount();
    fireEvent.change(screen.getByPlaceholderText('Filter by pubkey or channel name…'), { target: { value: 'rand' } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText('Filter by pubkey or channel name…'), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('All roles'), { target: { value: 'admin' } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(screen.getByDisplayValue('Admins only'), { target: { value: 'all' } });
    fireEvent.change(screen.getByDisplayValue('All channels'), { target: { value: 'g2' } });
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent(OTHER);
  });

  it('shows the empty copy instead of the table when nothing matches', () => {
    mount();
    fireEvent.change(screen.getByPlaceholderText('Filter by pubkey or channel name…'), { target: { value: 'zzz' } });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('No entries match the current filters.')).toBeInTheDocument();
  });

  it('selecting rows updates the count and enables the kick action', () => {
    mount();
    const kick = screen.getByRole('button', { name: 'Kick' });
    expect(kick).toBeDisabled();
    fireEvent.click(within(bodyRows()[1]).getByRole('checkbox'));
    expect(screen.getByText('1 selected · 3 shown · 3 total')).toBeInTheDocument();
    expect(kick).toBeEnabled();
  });
});

describe('RelayAdminPanel accessibility', () => {
  it('names the filter input, both selects and the table', () => {
    mount();
    expect(screen.getByLabelText('Filter by pubkey or channel name…').tagName).toBe('INPUT');
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
