import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { RelayAccessModal } from '@/app/[locale]/app/modals/relay/RelayAccessModal';
vi.mock('@/app/[locale]/app/rail/AddRelayModal', () => ({ AddRelayModal: () => <div data-testid="relay-chooser" /> }));

it('opens a relay chooser directly from the explanation', () => {
  renderWithBridge(<RelayAccessModal />, fakeBridge({ currentRelayUrl: 'wss://example.com', relayAccess: { 'wss://example.com': 'unreachable' } }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose another relay' }));
  expect(screen.getByTestId('relay-chooser')).toBeInTheDocument();
  expect(screen.queryByText('Cannot reach example.com')).toBeNull();
});

it('stays closed for a refused key: the status row and the empty state already say it, once each', () => {
  renderWithBridge(<RelayAccessModal />, fakeBridge({ currentRelayUrl: 'wss://example.com', relayAccess: { 'wss://example.com': 'restricted' } }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Choose another relay' })).toBeNull();
});
