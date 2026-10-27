/**
 * What a refused key is told: ask the operator (the npub short on screen,
 * copied whole), or choose another relay.
 */
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY } from '@tests/support/mocks/nostr-bridge';
import { useToastStore } from '@/store/feedback/toast';
import { safeNpub, shortNpubLabel } from '@/utils/identity/short-npub';
import RelayAccessHelp from '@/components/relay/RelayAccessHelp';

function mount(onChooseRelay = vi.fn(), seed: Record<string, unknown> = {}, locale: 'en' | 'es' = 'en') {
  renderWithBridge(<RelayAccessHelp onChooseRelay={onChooseRelay} />, fakeBridge({ currentRelayUrl: 'wss://public.obelisk.ar', ...seed }), { locale });
  return { onChooseRelay };
}

afterEach(() => useToastStore.getState().clearToasts());

describe('RelayAccessHelp', () => {
  it('names the relay and says to ask its operator', () => {
    mount();
    expect(screen.getByText('public.obelisk.ar has not let you in yet')).toBeInTheDocument();
    expect(screen.getByText(/Ask its operator to add yours/)).toBeInTheDocument();
  });

  it('shows the npub short, never hex, and copies it whole with the usual toast', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mount();
    expect(screen.getByTestId('relay-access-npub').textContent).toBe(shortNpubLabel(BRIDGE_MOCK_PUBKEY));
    expect(screen.getByTestId('relay-access-help').textContent).not.toContain(BRIDGE_MOCK_PUBKEY);
    fireEvent.click(screen.getByTestId('relay-access-copy-npub'));
    expect(writeText).toHaveBeenCalledWith(safeNpub(BRIDGE_MOCK_PUBKEY));
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ title: 'npub copied', body: shortNpubLabel(BRIDGE_MOCK_PUBKEY) });
  });

  it('offers the relay chooser', () => {
    const { onChooseRelay } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Choose another relay' }));
    expect(onChooseRelay).toHaveBeenCalled();
  });

  it('reads in Spanish with the dialog\'s own "Elegir otro relay"', () => {
    mount(vi.fn(), {}, 'es');
    expect(screen.getByText('public.obelisk.ar todavía no te dejó entrar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elegir otro relay' })).toBeInTheDocument();
  });

  it('signed out: no npub row, the chooser still there', () => {
    mount(vi.fn(), { myPubkey: null });
    expect(screen.queryByTestId('relay-access-copy-npub')).toBeNull();
    expect(screen.getByTestId('relay-access-choose-relay')).toBeInTheDocument();
  });
});
