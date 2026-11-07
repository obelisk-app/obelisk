import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import RelayDeckPicker from '@/components/relay/RelayDeckPicker';

vi.mock('@/hooks/relay/rail/useRelayDeckCard', () => ({
  useRelayDeckCard: (url: string) => ({
    loaded: true, unread: 0, name: url, banner: 'https://images.test/banner.jpg',
    description: 'Relay description', onBannerError: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([2, 3])('browses a %i-relay banner deck, selects the settled front relay, and closes', count => {
  const select = vi.fn();
  const relays = ['wss://one.test', 'wss://two.test', 'wss://three.test'].slice(0, count);
  render(<LocaleProvider><RelayDeckPicker relays={relays} activeRelay={relays[0]} onSelect={select}>Active relay</RelayDeckPicker></LocaleProvider>);
  fireEvent.click(screen.getByTestId('relay-deck-picker'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const card = screen.getAllByTestId('relay-deck-card')[1];
  expect(card.querySelector('img')).toHaveAttribute('src', 'https://images.test/banner.jpg');
  fireEvent.click(card);
  act(() => vi.advanceTimersByTime(160));
  expect(select).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(500));
  expect(card).toHaveAttribute('data-front', 'true');
  fireEvent.click(card);
  expect(select).toHaveBeenCalledWith(relays[1]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps adding a relay available without the side rail', () => {
  const add = vi.fn();
  render(<LocaleProvider><RelayDeckPicker relays={['wss://one.test']} activeRelay="wss://one.test" onSelect={vi.fn()} onAdd={add} /></LocaleProvider>);
  fireEvent.click(screen.getByTestId('relay-deck-picker'));
  fireEvent.click(screen.getByRole('button', { name: 'Add relay' }));
  expect(add).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
