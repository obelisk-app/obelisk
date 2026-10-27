/**
 * The phone channel list's empty state: a refused key gets the way in (ask
 * the operator with the npub, or another relay), not a bare "whitelist" line.
 */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import type { RelayAccessState } from '@/services/nostr-bridge';
import { ChannelListEmptyState } from '@/app/[locale]/app/mobile/screens/server/ChannelListEmptyState';

function mount(relayAccess: RelayAccessState, onChooseRelay = vi.fn()) {
  renderWithBridge(
    <ChannelListEmptyState relayAccess={relayAccess} connectionState="Connected" metadataEose={false} onChooseRelay={onChooseRelay} />,
    fakeBridge({ currentRelayUrl: 'wss://public.obelisk.ar' }),
    { locale: 'es' },
  );
  return { onChooseRelay };
}

describe('ChannelListEmptyState', () => {
  it('restricted: explains how to get in, keeps the whitelist state for selectors', () => {
    const { onChooseRelay } = mount('restricted');
    const empty = screen.getByTestId('channels-empty');
    expect(empty).toHaveAttribute('data-state', 'whitelist');
    expect(screen.getByTestId('relay-access-help')).toBeInTheDocument();
    expect(screen.queryByText('Tenés que estar en la whitelist')).toBeNull();
    expect(screen.getByRole('button', { name: /Copiar npub/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir otro relay' }));
    expect(onChooseRelay).toHaveBeenCalled();
  });

  it('auth-required is not a refusal: the short line, no operator advice', () => {
    mount('auth-required');
    expect(screen.getByTestId('channels-empty')).toHaveAttribute('data-state', 'whitelist');
    expect(screen.queryByTestId('relay-access-help')).toBeNull();
  });
});
