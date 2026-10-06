import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';

const createGroup = vi.fn(async () => 'new-id');
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ nostrActions: { createGroup: () => createGroup() } });
});

import { CreateGroupSection } from '@/app/app/panes/CreateGroupSection';

function mount(onCreated = vi.fn()) {
  render(<LocaleProvider initialLocale="en"><CreateGroupSection count={3} onCreated={onCreated} /></LocaleProvider>);
  return onCreated;
}

describe('CreateGroupSection', () => {
  it('opens the inline form from the + button and types a channel name', () => {
    mount();
    expect(screen.queryByTestId('create-channel-input')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create channel' }));
    const input = screen.getByTestId('create-channel-input');
    expect(input).toHaveAttribute('placeholder', 'channel name');
    fireEvent.change(input, { target: { value: 'dev' } });
    expect(input).toHaveValue('dev');
  });

  it('names the channel-name input for screen readers', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Create channel' }));
    expect(screen.getByRole('textbox', { name: 'channel name' })).toBe(screen.getByTestId('create-channel-input'));
  });
});
