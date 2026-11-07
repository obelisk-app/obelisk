import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import RelayDeckPicker from '@/components/relay/RelayDeckPicker';

vi.mock('@/hooks/relay/rail/useRelayDeckCard', () => ({
  useRelayDeckCard: (url: string) => ({
    loaded: true, unread: 0, name: url, banner: 'https://images.test/banner.jpg',
    description: 'Relay description', onBannerError: vi.fn(),
  }),
}));

it('browses banner cards, selects the front relay, and closes', () => {
  const select = vi.fn();
  const relays = ['wss://one.test', 'wss://two.test', 'wss://three.test'];
  render(<LocaleProvider><RelayDeckPicker relays={relays} activeRelay={relays[0]} onSelect={select} /></LocaleProvider>);
  fireEvent.click(screen.getByTestId('relay-deck-picker'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const card = screen.getAllByTestId('relay-deck-card')[1];
  expect(card.querySelector('img')).toHaveAttribute('src', 'https://images.test/banner.jpg');
  fireEvent.click(card);
  expect(card).toHaveAttribute('data-front', 'true');
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(card);
  expect(select).toHaveBeenCalledWith(relays[1]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
