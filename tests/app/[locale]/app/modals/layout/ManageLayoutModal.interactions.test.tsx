import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import type { ChannelLayout } from '@/services/relay/channel-layout';
import { ManageLayoutModal } from '@/app/[locale]/app/modals/layout/ManageLayoutModal';

const LAYOUT: ChannelLayout = {
  categories: [
    { id: 'cat-a', name: 'Alpha', position: 0 },
    { id: 'cat-b', name: 'Beta', position: 1 },
  ],
  channels: [
    { id: 'one', categoryId: 'cat-a', position: 0 },
    { id: 'two', categoryId: 'cat-a', position: 1 },
  ],
  updatedAt: 0,
};
const CHANNELS = ['one', 'two', 'three'].map((id) => groupFixture({ id, name: id }));
const transfer = () => ({ effectAllowed: '' });

function mount() {
  render(
    <LocaleProvider initialLocale="en">
      <ManageLayoutModal relayUrl="wss://relay.test" layout={LAYOUT} channels={CHANNELS} onClose={vi.fn()} />
    </LocaleProvider>,
  );
}

const channelsIn = (testId: string) =>
  within(screen.getByTestId(testId)).queryAllByTestId(/^layout-channel-/).map((el) => el.dataset.testid?.replace('layout-channel-', ''));
const categoryOrder = () => screen.getAllByTestId(/^layout-category-/).map((el) => el.dataset.testid?.replace('layout-category-', ''));

describe('ManageLayoutModal interactions', () => {
  it('adds a category on Enter, and only with a name', () => {
    mount();
    const input = screen.getByPlaceholderText('e.g. General, Trading, Voice');
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Gamma' } });
    expect(add).not.toBeDisabled();
    expect(fireEvent.keyDown(input, { key: 'a' })).toBe(true);
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false);
    expect(screen.getByDisplayValue('Gamma')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('drops a grabbed channel before another row', () => {
    mount();
    fireEvent.dragStart(screen.getByLabelText('Grab channel two'), { dataTransfer: transfer() });
    expect(fireEvent.drop(screen.getByTestId('layout-channel-one'), { dataTransfer: transfer() })).toBe(false);
    expect(channelsIn('layout-category-cat-a')).toEqual(['two', 'one']);
  });

  it('a row ignores a drop of itself, so the card takes it', () => {
    mount();
    fireEvent.dragStart(screen.getByLabelText('Grab channel one'), { dataTransfer: transfer() });
    fireEvent.drop(screen.getByTestId('layout-channel-one'), { dataTransfer: transfer() });
    expect(channelsIn('layout-category-cat-a')).toEqual(['two', 'one']);
  });

  it('the uncategorized bucket takes a dragged channel and only then accepts the drag', () => {
    mount();
    const bucket = screen.getByTestId('layout-uncategorized');
    expect(fireEvent.dragOver(bucket, { dataTransfer: transfer() })).toBe(true);
    fireEvent.dragStart(screen.getByLabelText('Grab channel one'), { dataTransfer: transfer() });
    expect(fireEvent.dragOver(bucket, { dataTransfer: transfer() })).toBe(false);
    expect(fireEvent.drop(bucket, { dataTransfer: transfer() })).toBe(false);
    expect(channelsIn('layout-uncategorized')).toEqual(['three', 'one']);
  });

  it('a category card accepts a drag only while something is grabbed', () => {
    mount();
    const card = screen.getByTestId('layout-category-cat-b');
    expect(fireEvent.dragOver(card, { dataTransfer: transfer() })).toBe(true);
    fireEvent.dragStart(screen.getByLabelText('Grab category Alpha'), { dataTransfer: transfer() });
    expect(fireEvent.dragOver(card, { dataTransfer: transfer() })).toBe(false);
    fireEvent.drop(card, { dataTransfer: transfer() });
    expect(categoryOrder()).toEqual(['cat-b', 'cat-a']);
  });

  it('marks a drag as a move', () => {
    mount();
    const data = transfer();
    fireEvent.dragStart(screen.getByLabelText('Grab channel one'), { dataTransfer: data });
    expect(data.effectAllowed).toBe('move');
  });

  it('moves a channel with its picker, and back out with the empty option', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Category for three'), { target: { value: 'cat-b' } });
    expect(channelsIn('layout-category-cat-b')).toEqual(['three']);
    fireEvent.change(screen.getByLabelText('Category for three'), { target: { value: '' } });
    expect(channelsIn('layout-uncategorized')).toEqual(['three']);
  });

  it('moves rows and categories with the arrows, and deletes a category', () => {
    mount();
    const rowOne = screen.getByTestId('layout-channel-one');
    fireEvent.click(within(rowOne).getByRole('button', { name: 'Move down' }));
    expect(channelsIn('layout-category-cat-a')).toEqual(['two', 'one']);
    const cardB = screen.getByTestId('layout-category-cat-b');
    fireEvent.click(within(cardB).getAllByRole('button', { name: 'Move up' })[0]);
    expect(categoryOrder()).toEqual(['cat-b', 'cat-a']);
    fireEvent.click(within(screen.getByTestId('layout-category-cat-a')).getByRole('button', { name: 'Delete' }));
    expect(categoryOrder()).toEqual(['cat-b']);
  });
});
