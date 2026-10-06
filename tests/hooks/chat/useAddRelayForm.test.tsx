import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const addRelay = vi.fn();
const switchRelay = vi.fn();
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: {
      addRelay: (...a: unknown[]) => addRelay(...a),
      switchRelay: (...a: unknown[]) => switchRelay(...a),
    },
  });
});

import { useAddRelayForm, useSuggestedRelayAdd } from '@/hooks/chat/useAddRelayForm';

afterEach(() => {
  addRelay.mockReset();
  switchRelay.mockReset();
});

describe('useAddRelayForm', () => {
  it('starts with the wss:// prefix and no error', () => {
    const { result } = renderHook(() => useAddRelayForm(() => {}));
    expect(result.current.url).toBe('wss://');
    expect(result.current.error).toBeNull();
  });

  it('normalizes a bare host, adds it, switches to it, then reports', async () => {
    addRelay.mockResolvedValueOnce(undefined);
    switchRelay.mockResolvedValueOnce(undefined);
    const onAdded = vi.fn();
    const { result } = renderHook(() => useAddRelayForm(onAdded));
    act(() => result.current.setUrl('relay.example'));
    await act(() => result.current.submit());
    expect(addRelay).toHaveBeenCalledWith('wss://relay.example');
    expect(switchRelay).toHaveBeenCalledWith('wss://relay.example');
    expect(switchRelay.mock.invocationCallOrder[0]).toBeGreaterThan(addRelay.mock.invocationCallOrder[0]);
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('rejects an unparseable address before touching the bridge', async () => {
    const { result } = renderHook(() => useAddRelayForm(() => {}));
    act(() => result.current.setUrl('wss://'));
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Invalid URL');
    expect(addRelay).not.toHaveBeenCalled();
  });

  it('surfaces the bridge error and does not switch when add fails', async () => {
    addRelay.mockRejectedValueOnce(new Error('relay down'));
    const onAdded = vi.fn();
    const { result } = renderHook(() => useAddRelayForm(onAdded));
    act(() => result.current.setUrl('wss://relay.example'));
    await act(() => result.current.submit());
    expect(result.current.error).toBe('relay down');
    expect(switchRelay).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
});

describe('useSuggestedRelayAdd', () => {
  it('adds without switching', async () => {
    addRelay.mockResolvedValueOnce(undefined);
    const onAdded = vi.fn();
    const { result } = renderHook(() => useSuggestedRelayAdd('wss://s.example', false, onAdded));
    await act(() => result.current.add());
    expect(addRelay).toHaveBeenCalledWith('wss://s.example');
    expect(switchRelay).not.toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the relay is already configured', async () => {
    const { result } = renderHook(() => useSuggestedRelayAdd('wss://s.example', true, () => {}));
    await act(() => result.current.add());
    expect(addRelay).not.toHaveBeenCalled();
  });
});
