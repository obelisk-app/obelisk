import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useToastStore } from '@/store/feedback/toast';
import { useRelayMenuSheet } from '@/hooks/shell/mobile/sheets/relay/useRelayMenuSheet';

function setup() {
  const close = vi.fn();
  const { result } = renderHook(() => useRelayMenuSheet({ relayUrl: 'wss://a', label: 'Alpha', close }), {
    wrapper: bridgeWrapper(fakeBridge({ configuredRelays: ['wss://a', 'wss://b'] })),
  });
  return { result, close };
}

beforeEach(() => useToastStore.getState().clearToasts());

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
});
