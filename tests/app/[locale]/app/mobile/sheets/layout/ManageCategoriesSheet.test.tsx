import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { EMPTY_LAYOUT } from '@/services/relay/channel-layout';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({});
});

import { ManageCategoriesSheet } from '@/app/[locale]/app/mobile/sheets/layout/ManageCategoriesSheet';

function mount(close = vi.fn()) {
  const r = render(
    <LocaleProvider initialLocale="en">
      <ManageCategoriesSheet relayUrl="wss://relay.test" layout={EMPTY_LAYOUT} channels={[]} close={close} />
    </LocaleProvider>,
  );
  return { ...r, close };
}

describe('ManageCategoriesSheet', () => {
  it('renders the manage-categories sheet above the relay menu, with its title', () => {
    const { container } = mount();
    const host = container.querySelector('[data-screen="manage-categories"]');
    expect(host).toHaveClass('sheet-host');
    expect(host).toHaveStyle({ zIndex: 20 });
    expect(screen.getByText('Categories & order')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-categories-save')).toBeInTheDocument();
  });

  it('closes on a backdrop tap', () => {
    const { container, close } = mount();
    fireEvent.click(container.querySelector('.sheet-backdrop')!);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('ManageCategoriesSheet accessibility', () => {
  it('names the new-category field, each rename field and each channel picker', async () => {
    const { groupFixture } = await import('@tests/support/mocks/nostr-bridge');
    render(
      <LocaleProvider initialLocale="en">
        <ManageCategoriesSheet
          relayUrl="wss://relay.test"
          layout={{ categories: [{ id: 'c1', name: 'Dev', position: 0 }], channels: [{ id: 'rly/general', categoryId: 'c1', position: 0 }], updatedAt: 0 }}
          channels={[groupFixture({ id: 'rly/general', name: 'general' })]}
          close={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(screen.getByLabelText('New category')).toHaveClass('setup-input');
    expect(screen.getByLabelText('Category name')).toHaveValue('Dev');
    const picker = screen.getByLabelText('Category for general');
    expect(picker.tagName).toBe('SELECT');
    expect(picker).toHaveStyle({ maxWidth: '110px' });
    expect(picker.className).toBe('');
  });
});

describe('ManageCategoriesSheet: a category saved with no name', () => {
  it('is named at render time, so a language switch renames it and the field stays empty', async () => {
    const { groupFixture } = await import('@tests/support/mocks/nostr-bridge');
    const sheet = (
      <ManageCategoriesSheet
        relayUrl="wss://relay.test"
        layout={{ categories: [{ id: 'c1', name: '', position: 0 }], channels: [{ id: 'rly/general', categoryId: 'c1', position: 0 }], updatedAt: 0 }}
        channels={[groupFixture({ id: 'rly/general', name: 'general' })]}
        close={vi.fn()}
      />
    );
    const { rerender } = render(<LocaleProvider initialLocale="es">{sheet}</LocaleProvider>);
    expect(screen.getByLabelText('Nombre de la categoría')).toHaveValue('');
    expect(screen.getByLabelText('Nombre de la categoría')).toHaveAttribute('placeholder', 'Sin título');
    expect(screen.getByText('Sin título · 1')).toBeInTheDocument();

    rerender(<LocaleProvider initialLocale="en">{sheet}</LocaleProvider>);
    expect(screen.getByText('Untitled · 1')).toBeInTheDocument();
    expect(screen.queryByText(/Sin título/)).toBeNull();
  });
});
