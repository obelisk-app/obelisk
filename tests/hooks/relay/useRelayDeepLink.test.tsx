import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { ConfirmDialogHost } from '@/components/ui/overlays/ConfirmDialog';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

/**
 * The bridge is the only thing that opens a socket, answers NIP-42 AUTH or
 * writes the relay list and the recent-relays MRU, and `switchRelay` is the
 * only call the deep link makes into it. So "no AUTH and no persistence"
 * reduces to one observable: `switchRelay` must not have been called.
 */
const bridgeState = {
  current: 'wss://home.relay',
  configured: ['wss://home.relay', 'wss://known.relay'] as ReadonlyArray<string>,
};
const switchRelay = vi.fn();

import {
  classifyDeepLinkRelay,
  normalizeDeepLinkRelay,
  switchToDeepLinkedRelay,
  useRelayDeepLink,
} from '@/hooks/relay/useRelayDeepLink';

function mountShell() {
  render(<LocaleProvider initialLocale="en"><ConfirmDialogHost /></LocaleProvider>);
  // The real hook under a provider holding a fake bridge; `nostrActions`
  // reaches the same fake through the page slot the provider fills.
  const bridge = fakeBridge(
    { currentRelayUrl: bridgeState.current, configuredRelays: [...bridgeState.configured] },
    { switchRelay: (url: string) => switchRelay(url) },
  );
  const { result } = renderHook(() => useRelayDeepLink(), { wrapper: bridgeWrapper(bridge) });
  return result.current;
}

/** Let the bridge read and the dialog open settle before querying. */
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const persistedRelayKeys = () =>
  Object.keys(localStorage).filter((key) => /relay/i.test(key));

beforeEach(() => {
  switchRelay.mockReset().mockResolvedValue(undefined);
  bridgeState.current = 'wss://home.relay';
  bridgeState.configured = ['wss://home.relay', 'wss://known.relay'];
  localStorage.clear();
});

afterEach(() => cleanup());

describe('normalizeDeepLinkRelay / classifyDeepLinkRelay', () => {
  it('treats scheme, case and a trailing slash as the same relay', () => {
    expect(normalizeDeepLinkRelay('Relay.Example/')).toBe('wss://relay.example');
    expect(normalizeDeepLinkRelay('WSS://relay.example//')).toBe('wss://relay.example');
    expect(normalizeDeepLinkRelay('ws://relay.example')).toBe('ws://relay.example');
  });

  it('classifies against the current relay first, then the list', () => {
    const list = ['wss://home.relay', 'wss://known.relay/'];
    expect(classifyDeepLinkRelay('home.relay', 'wss://home.relay/', list)).toBe('current');
    expect(classifyDeepLinkRelay('KNOWN.relay', 'wss://home.relay', list)).toBe('known');
    expect(classifyDeepLinkRelay('attacker.example', 'wss://home.relay', list)).toBe('unknown');
    expect(classifyDeepLinkRelay('attacker.example', null, [])).toBe('unknown');
  });
});

describe('switchToDeepLinkedRelay (ordering)', () => {
  it('awaits the confirmation before it ever calls switchRelay for an unknown relay', async () => {
    const calls: string[] = [];
    let answer!: (ok: boolean) => void;
    const outcome = switchToDeepLinkedRelay({
      requested: 'attacker.example',
      readRelayState: async () => ({ current: 'wss://home.relay', configured: ['wss://home.relay'] }),
      confirm: (host) => { calls.push(`confirm:${host}`); return new Promise((r) => { answer = r; }); },
      switchRelay: async (url) => { calls.push(`switch:${url}`); },
    });
    await Promise.resolve();
    await Promise.resolve();
    // The dialog is up, the bridge has not been touched.
    expect(calls).toEqual(['confirm:attacker.example']);
    answer(true);
    expect(await outcome).toBe('switched');
    expect(calls).toEqual(['confirm:attacker.example', 'switch:wss://attacker.example']);
  });

  it('never calls switchRelay when the user declines', async () => {
    const switchFn = vi.fn();
    const outcome = await switchToDeepLinkedRelay({
      requested: 'attacker.example',
      readRelayState: async () => ({ current: 'wss://home.relay', configured: ['wss://home.relay'] }),
      confirm: async () => false,
      switchRelay: switchFn,
    });
    expect(outcome).toBe('declined');
    expect(switchFn).not.toHaveBeenCalled();
  });

  it('does not ask for a relay already in the list', async () => {
    const confirm = vi.fn(async () => false);
    const switchFn = vi.fn(async () => {});
    const outcome = await switchToDeepLinkedRelay({
      requested: 'known.relay',
      readRelayState: async () => ({ current: 'wss://home.relay', configured: ['wss://home.relay', 'wss://known.relay'] }),
      confirm,
      switchRelay: switchFn,
    });
    expect(outcome).toBe('switched');
    expect(confirm).not.toHaveBeenCalled();
    expect(switchFn).toHaveBeenCalledWith('wss://known.relay');
  });

  it('reports a failed switch instead of throwing into the shell effect', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const outcome = await switchToDeepLinkedRelay({
      requested: 'known.relay',
      readRelayState: async () => ({ current: 'wss://home.relay', configured: ['wss://known.relay'] }),
      confirm: async () => true,
      switchRelay: async () => { throw new Error('relay down'); },
    });
    expect(outcome).toBe('failed');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('useRelayDeepLink (through the real dialog)', () => {
  it('shows the host and holds the switch until the user accepts', async () => {
    const switchFromDeepLink = mountShell();
    let outcome!: Promise<string>;
    act(() => { outcome = switchFromDeepLink('attacker.example/'); });
    await flush();

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Connect to attacker.example?');
    expect(screen.getByText(/public key/)).toBeInTheDocument();
    expect(screen.getByText(/IP address/)).toBeInTheDocument();
    // Dialog open: nothing has gone to the relay and nothing is on disk.
    expect(switchRelay).not.toHaveBeenCalled();
    expect(persistedRelayKeys()).toEqual([]);

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(await outcome).toBe('switched');
    expect(switchRelay).toHaveBeenCalledTimes(1);
    expect(switchRelay).toHaveBeenCalledWith('wss://attacker.example');
  });

  it('declining leaves no trace: no switch, no list entry, no recent relay', async () => {
    const switchFromDeepLink = mountShell();
    let outcome!: Promise<string>;
    act(() => { outcome = switchFromDeepLink('attacker.example'); });
    await flush();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(await outcome).toBe('declined');
    expect(switchRelay).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(persistedRelayKeys()).toEqual([]);
  });

  it('Escape is a decline too', async () => {
    const switchFromDeepLink = mountShell();
    let outcome!: Promise<string>;
    act(() => { outcome = switchFromDeepLink('attacker.example'); });
    await flush();
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(await outcome).toBe('declined');
    expect(switchRelay).not.toHaveBeenCalled();
  });

  it('switches to a relay already in the list without asking', async () => {
    const switchFromDeepLink = mountShell();
    let outcome!: Promise<string>;
    act(() => { outcome = switchFromDeepLink('known.relay'); });
    expect(await outcome).toBe('switched');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(switchRelay).toHaveBeenCalledWith('wss://known.relay');
  });

  it('does nothing for the relay that is already open', async () => {
    const switchFromDeepLink = mountShell();
    let outcome!: Promise<string>;
    act(() => { outcome = switchFromDeepLink('HOME.relay/'); });
    expect(await outcome).toBe('unchanged');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(switchRelay).not.toHaveBeenCalled();
  });

  it('reads the bridge, not the first-render hook placeholder, for the list', async () => {
    // The shells run their URL parse in a mount effect, when
    // `useConfiguredRelays()` still returns its `[]` initial value. Had the
    // gate read that, every relay the user owns would have prompted.
    bridgeState.configured = ['wss://home.relay', 'wss://mine.relay'];
    const switchFromDeepLink = mountShell();
    let outcome!: Promise<string>;
    act(() => { outcome = switchFromDeepLink('mine.relay'); });
    expect(await outcome).toBe('switched');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
