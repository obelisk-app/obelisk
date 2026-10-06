import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { LocaleProvider } from '@tests/support/intl';
import { CategoryChannelsBlock, NO_CATEGORY, categoryOptions } from '@/app/[locale]/app/mobile/sheets/categories/CategoryChannelsBlock';

describe('categoryOptions', () => {
  it('offers "Uncategorized" first, then the categories in order', () => {
    expect(categoryOptions([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]).map((o) => o.id))
      .toEqual([NO_CATEGORY, 'a', 'b']);
  });
});

describe('CategoryChannelsBlock', () => {
  const channelsById = {
    c1: groupFixture({ id: 'c1', name: 'one', kind: 'text' }),
    c2: groupFixture({ id: 'c2', name: 'two', kind: 'text' }),
  };

  function renderBlock(onAssign = vi.fn(), onMove = vi.fn()) {
    render(
      <LocaleProvider initialLocale="en">
        <CategoryChannelsBlock
          catName="Cat"
          channelIds={['c1', 'c2']}
          channelsById={channelsById}
          catOptions={categoryOptions([{ id: 'cat', name: 'Cat' }])}
          currentCatId="cat"
          onAssign={onAssign}
          onMove={onMove}
        />
      </LocaleProvider>,
    );
    return { onAssign, onMove };
  }

  it('picking "Uncategorized" assigns null, not the sentinel', () => {
    const { onAssign } = renderBlock();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: NO_CATEGORY } });
    expect(onAssign).toHaveBeenCalledWith('c1', null);
  });

  it('cannot move the first channel up or the last one down', () => {
    renderBlock();
    expect(screen.getByLabelText('Move one up')).toBeDisabled();
    expect(screen.getByLabelText('Move two down')).toBeDisabled();
    expect(screen.getByLabelText('Move one down')).not.toBeDisabled();
  });
});
