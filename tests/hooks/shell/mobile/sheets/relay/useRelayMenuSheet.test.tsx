import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useRelayMenuSheet } from '@/hooks/shell/mobile/sheets/relay/useRelayMenuSheet';

function setup() {
  const close = vi.fn();
  const { result } = renderHook(() => useRelayMenuSheet({ relayUrl: 'wss://a', label: 'Alpha', close }), {
    wrapper: bridgeWrapper(fakeBridge({ configuredRelays: ['wss://a', 'wss://b'] })),
  });
  return { result, close };
}

describe('useRelayMenuSheet', () => {
  it('opens and closes one admin panel at a time', () => {
    const { result } = setup();
    expect(result.current.adminPanel).toBeNull();
    act(() => result.current.openPanel('roles'));
    expect(result.current.adminPanel).toBe('roles');
    act(() => result.current.closePanel());
    expect(result.current.adminPanel).toBeNull();
  });

  it('copies the URL and shows a line that clears itself', async () => {
    vi.useFakeTimers();
    try {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
      const { result } = setup();
      await act(async () => { result.current.copyUrl(); await Promise.resolve(); });
      expect(result.current.toast).toBe('Relay URL copied');
      act(() => { vi.advanceTimersByTime(1600); });
      expect(result.current.toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the invite busy while it copies', async () => {
    let resolve!: () => void;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => new Promise<void>((r) => { resolve = r; }) }, configurable: true });
    const { result } = setup();
    act(() => result.current.invite());
    expect(result.current.busy).toBe('invite');
    await act(async () => { resolve(); await Promise.resolve(); });
    expect(result.current.busy).toBeNull();
    expect(result.current.toast).toBe('Invite copied');
  });

  it('knows the relays in the rail', () => {
    expect(setup().result.current.relays).toEqual(['wss://a', 'wss://b']);
  });
});
