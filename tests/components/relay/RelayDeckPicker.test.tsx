import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import RelayDeckPicker from '@/components/relay/RelayDeckPicker';

vi.mock('@/hooks/relay/rail/useRelayDeckCard', () => ({
  useRelayDeckCard: (url: string) => ({
    loaded: true, unread: 0, name: url, banner: 'https://images.test/banner.jpg',
    description: 'Relay description', onBannerError: vi.fn(),
  }),
}));

const { confirmLeave, removeRelay } = vi.hoisted(() => ({ confirmLeave: vi.fn(), removeRelay: vi.fn() }));
vi.mock('@/services/shell/mobile/relay-menu', () => ({ confirmLeaveRelay: confirmLeave }));

beforeEach(() => {
  confirmLeave.mockReset().mockResolvedValue(true);
  removeRelay.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([2, 3])('browses a %i-relay banner deck, selects the settled front relay, and closes', count => {
  const select = vi.fn();
  const relays = ['wss://one.test', 'wss://two.test', 'wss://three.test'].slice(0, count);
  renderWithBridge(<LocaleProvider><RelayDeckPicker relays={relays} activeRelay={relays[0]} onSelect={select}>Active relay</RelayDeckPicker></LocaleProvider>, fakeBridge({}, { removeRelay }));
  fireEvent.click(screen.getByTestId('relay-deck-picker'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const card = screen.getAllByTestId('relay-deck-card')[1];
  expect(card.querySelector('img')).toHaveAttribute('src', 'https://images.test/banner.jpg');
  fireEvent.click(card.querySelector('button')!);
  act(() => vi.advanceTimersByTime(160));
  expect(select).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(500));
  expect(card).toHaveAttribute('data-front', 'true');
  fireEvent.click(card.querySelector('button')!);
  expect(select).toHaveBeenCalledWith(relays[1]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps adding a relay available without the side rail', () => {
  const add = vi.fn();
  renderWithBridge(<LocaleProvider><RelayDeckPicker relays={['wss://one.test']} activeRelay="wss://one.test" onSelect={vi.fn()} onAdd={add} /></LocaleProvider>, fakeBridge({}, { removeRelay }));
  fireEvent.click(screen.getByTestId('relay-deck-picker'));
  fireEvent.click(screen.getByRole('button', { name: 'Add relay' }));
  expect(add).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});


it('removes the displayed relay after confirmation without selecting it', async () => {
  const select = vi.fn();
  renderWithBridge(<LocaleProvider><RelayDeckPicker relays={['wss://one.test', 'wss://two.test']} activeRelay="wss://one.test" onSelect={select} /></LocaleProvider>, fakeBridge({}, { removeRelay }));
  fireEvent.click(screen.getByTestId('relay-deck-picker'));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  act(() => vi.advanceTimersByTime(660));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove relay two.test' })); });
  expect(screen.queryByRole('button', { name: 'Remove relay two.test' })).not.toBeInTheDocument();
  expect(confirmLeave).toHaveBeenCalledWith(expect.any(Function), 'two.test');
  expect(removeRelay).toHaveBeenCalledExactlyOnceWith('wss://two.test');
  expect(select).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps the picker and relay when removal is cancelled', async () => {
  confirmLeave.mockResolvedValue(false);
  renderWithBridge(<LocaleProvider><RelayDeckPicker relays={['wss://one.test', 'wss://two.test']} activeRelay="wss://one.test" onSelect={vi.fn()} /></LocaleProvider>, fakeBridge({}, { removeRelay }));
  fireEvent.click(screen.getByTestId('relay-deck-picker'));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove relay one.test' })); });
  expect(removeRelay).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('disables removing the last configured relay', () => {
  renderWithBridge(<LocaleProvider><RelayDeckPicker relays={['wss://one.test']} activeRelay="wss://one.test" onSelect={vi.fn()} /></LocaleProvider>, fakeBridge({}, { removeRelay }));
  fireEvent.click(screen.getByTestId('relay-deck-picker'));
  const remove = screen.getByRole('button', { name: 'Remove relay one.test' });
  expect(remove).toBeDisabled();
  expect(remove.closest('[data-testid=relay-deck-card]')).toHaveAttribute('data-front', 'true');
  expect(remove.parentElement?.closest('button')).toBeNull();
  expect(confirmLeave).not.toHaveBeenCalled();
  expect(removeRelay).not.toHaveBeenCalled();
});
