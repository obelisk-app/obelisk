import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { RelayAccessModal } from '@/app/[locale]/app/modals/relay/RelayAccessModal';
vi.mock('@/app/[locale]/app/rail/AddRelayModal', () => ({ AddRelayModal: () => <div data-testid="relay-chooser" /> }));
it('opens a relay chooser directly from the restriction explanation', () => {
  renderWithBridge(<RelayAccessModal />, fakeBridge({ currentRelayUrl: 'wss://example.com', relayAccess: { 'wss://example.com': 'restricted' } }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose another relay' }));
  expect(screen.getByTestId('relay-chooser')).toBeInTheDocument();
  expect(screen.queryByText('Not whitelisted on example.com')).toBeNull();
});
