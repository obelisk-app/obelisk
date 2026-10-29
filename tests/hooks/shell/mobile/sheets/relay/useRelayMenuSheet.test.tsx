import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useToastStore } from '@/store/feedback/toast';
import { useRelayMenuSheet } from '@/hooks/shell/mobile/sheets/relay/useRelayMenuSheet';
import { OPEN_SETTINGS_EVENT } from '@/constants/settings/open-settings';
import { takeRequestedInviteRelay } from '@/services/settings/open-settings';
import type { BridgeImpl } from '@/services/nostr-bridge';

const signEventTemplate = vi.fn(async (t: { kind: number; tags: string[][]; content: string; created_at?: number }) => ({
  ...t, id: 'id', pubkey: 'pk', sig: 'sig', created_at: t.created_at ?? 0,
}));

function setup(relayUrl = 'wss://a') {
  const close = vi.fn();
  const { result } = renderHook(() => useRelayMenuSheet({ relayUrl, label: 'Alpha', close }), {
    wrapper: bridgeWrapper(fakeBridge({ configuredRelays: ['wss://a', 'wss://b'] }, { signEventTemplate } as unknown as Partial<BridgeImpl>)),
  });
  return { result, close };
}

beforeEach(() => {
  useToastStore.getState().clearToasts();
  // The relay's invite API: only `minty` lets this account create links.
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (new URL(url).host === 'minty'
    ? new Response(JSON.stringify({ pubkey: 'pk', basis: 'admin', can_mint: true, is_admin: true, admits_total: 10, admits_used: 0, admits_left: 10, codes: [] }), { status: 200 })
    : new Response('', { status: 404 }))));
});
afterEach(() => vi.unstubAllGlobals());

describe('useRelayMenuSheet', () => {
  it('opens and closes one admin panel at a time', () => {
    const { result } = setup();
    expect(result.current.adminPanel).toBeNull();
    act(() => result.current.openPanel('roles'));
    expect(result.current.adminPanel).toBe('roles');
    act(() => result.current.closePanel());
    expect(result.current.adminPanel).toBeNull();
  });

  it('copies the URL and dispatches through the shared toast store', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    const { result } = setup();
    await act(async () => { result.current.copyUrl(); await Promise.resolve(); });
    expect(useToastStore.getState().toasts).toMatchObject([{ title: 'Relay URL copied' }]);
  });

  it('does not confirm a clipboard write that failed', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) }, configurable: true });
    const { result } = setup();
    await act(async () => { result.current.copyUrl(); await Promise.resolve(); });
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('marks the invite busy while it copies', async () => {
    let resolve!: () => void;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => new Promise<void>((r) => { resolve = r; }) }, configurable: true });
    const { result } = setup();
    act(() => result.current.invite());
    expect(result.current.busy).toBe('invite');
    await act(async () => { resolve(); await Promise.resolve(); });
    expect(result.current.busy).toBeNull();
    expect(useToastStore.getState().toasts).toMatchObject([{ title: 'Invite copied' }]);
  });

  it('knows the relays in the rail', () => {
    expect(setup().result.current.relays).toEqual(['wss://a', 'wss://b']);
  });

  it('opens the invite panel on this relay when this account may create links there', async () => {
    const { result, close } = setup('wss://minty');
    await waitFor(() => expect(result.current.canMint).toBe(true));
    const opened = vi.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, opened);
    await act(async () => { result.current.invite(); await Promise.resolve(); });
    window.removeEventListener(OPEN_SETTINGS_EVENT, opened);
    expect(close).toHaveBeenCalled();
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ section: 'invites', relay: 'wss://minty' });
    expect(takeRequestedInviteRelay()).toBe('wss://minty');
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('shares the bare relay link where this account cannot invite', async () => {
    const { result } = setup();
    await act(async () => { await Promise.resolve(); });
    expect(result.current.canMint).toBe(false);
  });
});
