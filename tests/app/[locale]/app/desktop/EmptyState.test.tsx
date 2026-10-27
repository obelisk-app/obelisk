/**
 * The desktop main pane with nothing open: "pick a channel", or, when the
 * relay refused this key, how to get in.
 */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { EmptyState } from '@/app/[locale]/app/desktop/EmptyState';

vi.mock('@/app/[locale]/app/rail/AddRelayModal', () => ({ AddRelayModal: () => <div data-testid="relay-chooser" /> }));

const RELAY = 'wss://public.obelisk.ar';

describe('desktop EmptyState', () => {
  it('asks to pick a channel when the relay lets you in', () => {
    renderWithBridge(<EmptyState />, fakeBridge({ currentRelayUrl: RELAY, relayAccess: { [RELAY]: 'ok' } }));
    expect(screen.getByText('Pick a channel or DM')).toBeInTheDocument();
    expect(screen.queryByTestId('relay-access-help')).toBeNull();
  });

  it('a refused key is told how to get in instead of "tap + to create a channel"', () => {
    renderWithBridge(<EmptyState />, fakeBridge({ currentRelayUrl: RELAY, relayAccess: { [RELAY]: 'restricted' } }));
    expect(screen.getByTestId('relay-access-help')).toBeInTheDocument();
    expect(screen.queryByText('Pick a channel or DM')).toBeNull();
    expect(screen.getByTestId('relay-access-copy-npub')).toBeInTheDocument();
  });

  it('opens the relay chooser from there', () => {
    renderWithBridge(<EmptyState />, fakeBridge({ currentRelayUrl: RELAY, relayAccess: { [RELAY]: 'restricted' } }));
    fireEvent.click(screen.getByTestId('relay-access-choose-relay'));
    expect(screen.getByTestId('relay-chooser')).toBeInTheDocument();
  });
});
