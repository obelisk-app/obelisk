import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { EMPTY_LAYOUT } from '@/constants/relay/channel-layout';
import { ManageCategoriesSheet } from '@/app/[locale]/app/mobile/sheets/layout/ManageCategoriesSheet';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const CHANNELS = [group({ id: 'c1', name: 'one' }), group({ id: 'c2', name: 'two' })];

function mount() {
  renderWithBridge(
    <ManageCategoriesSheet relayUrl="wss://relay.test" layout={EMPTY_LAYOUT} channels={CHANNELS} close={vi.fn()} />,
    fakeBridge(),
  );
}

describe('ManageCategoriesSheet editing', () => {
  it('adds a category on Enter and clears the field, and ignores other keys', () => {
    mount();
    const field = screen.getByLabelText('New category');
    fireEvent.change(field, { target: { value: 'Games' } });
    fireEvent.keyDown(field, { key: 'a' });
    expect(screen.queryByDisplayValue('Games', { exact: true })).toBe(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field).toHaveValue('');
    expect(screen.getByDisplayValue('Games')).toBeInTheDocument();
  });

  it('lists the uncategorized channels, each with a category picker that offers the new category', () => {
    mount();
    expect(screen.getByText('#one')).toBeInTheDocument();
    expect(screen.getByText('#two')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New category'), { target: { value: 'Games' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const picker = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).toEqual(['Uncategorized', 'Games']);
    fireEvent.change(picker, { target: { value: picker.options[1].value } });
    expect(screen.getByText('Games · 1')).toBeInTheDocument();
  });
});
