import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { ConfirmDialogHost } from '@/components/ui/overlays/ConfirmDialog';
import { RelayMenuSheet } from '@/app/[locale]/app/mobile/sheets/relay/RelayMenuSheet';

const URL_A = 'wss://a.test';
const URL_B = 'wss://b.test';
const writeText = vi.fn().mockResolvedValue(undefined);

function mount(methods: Record<string, unknown> = {}) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const close = vi.fn();
  const bridge = fakeBridge({ configuredRelays: [URL_A, URL_B] }, methods as never);
  renderWithBridge(<><ConfirmDialogHost /><RelayMenuSheet close={close} relayUrl={URL_A} label="Alpha" iconUrl={null} /></>, bridge);
  return { close };
}

afterEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
});

describe('RelayMenuSheet actions', () => {
  it('shows the relay as a letter tile with its host', () => {
    mount();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('a.test')).toBeInTheDocument();
  });

  it('copies the invite and says so', async () => {
    mount();
    fireEvent.click(screen.getByText('Invite people…'));
    expect(writeText).toHaveBeenCalledWith('Join Alpha on Obelisk: wss://a.test');
    expect(await screen.findByText('Invite copied')).toBeInTheDocument();
  });

  it('shares through the system sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    mount();
    fireEvent.click(screen.getByText('Share this space'));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Alpha', text: 'Join Alpha on Obelisk: wss://a.test', url: URL_A }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the invite instead when the browser cannot share', async () => {
    mount();
    fireEvent.click(screen.getByText('Share this space'));
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('Join Alpha on Obelisk: wss://a.test');
  });

  it('copies the relay URL', async () => {
    mount();
    fireEvent.click(screen.getByText('Copy relay URL'));
    expect(await screen.findByText('Relay URL copied')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(URL_A);
  });

  it('clears the toast after a moment', async () => {
    vi.useFakeTimers();
    try {
      mount();
      fireEvent.click(screen.getByText('Copy relay URL'));
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText('Relay URL copied')).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(1700); });
      expect(screen.queryByText('Relay URL copied')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves after confirming: removes the relay, switches to the next one and closes', async () => {
    const removeRelay = vi.fn().mockResolvedValue(undefined);
    const switchRelay = vi.fn().mockResolvedValue(undefined);
    const { close } = mount({ removeRelay, switchRelay });
    fireEvent.click(screen.getByText('Leave this space'));
    fireEvent.click(await screen.findByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(removeRelay).toHaveBeenCalledWith(URL_A);
    expect(switchRelay).toHaveBeenCalledWith(URL_B);
  });

  it('stays when the confirmation is cancelled', async () => {
    const removeRelay = vi.fn();
    const { close } = mount({ removeRelay });
    fireEvent.click(screen.getByText('Leave this space'));
    fireEvent.click(await screen.findByTestId('confirm-dialog-cancel'));
    await act(async () => { await Promise.resolve(); });
    expect(removeRelay).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
