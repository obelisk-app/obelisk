import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LocaleProvider, translator } from '@tests/support/intl';
import { CodedError } from '@/utils/errors/codes';
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

import { useAddRelayForm, useSuggestedRelayAdd } from '@/hooks/relay/useAddRelayForm';

afterEach(() => {
  addRelay.mockReset();
  switchRelay.mockReset();
});

/** The hook words its errors through next-intl, so it needs a provider. */
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

describe('useAddRelayForm', () => {
  it('starts with the wss:// prefix and no error', () => {
    const { result } = renderHook(() => useAddRelayForm(() => {}), { wrapper });
    expect(result.current.url).toBe('wss://');
    expect(result.current.error).toBeNull();
  });

  it('normalizes a bare host, adds it, switches to it, then reports', async () => {
    addRelay.mockResolvedValueOnce(undefined);
    switchRelay.mockResolvedValueOnce(undefined);
    const onAdded = vi.fn();
    const { result } = renderHook(() => useAddRelayForm(onAdded), { wrapper });
    act(() => result.current.setUrl('relay.example'));
    await act(() => result.current.submit());
    expect(addRelay).toHaveBeenCalledWith('wss://relay.example');
    expect(switchRelay).toHaveBeenCalledWith('wss://relay.example');
    expect(switchRelay.mock.invocationCallOrder[0]).toBeGreaterThan(addRelay.mock.invocationCallOrder[0]);
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('rejects an unparseable address before touching the bridge', async () => {
    const { result } = renderHook(() => useAddRelayForm(() => {}), { wrapper });
    act(() => result.current.setUrl('wss://'));
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Invalid URL');
    expect(addRelay).not.toHaveBeenCalled();
  });

  it('says the add failed, in the reader\'s language, and does not switch', async () => {
    addRelay.mockRejectedValueOnce(new Error('relay down'));
    const onAdded = vi.fn();
    const { result } = renderHook(() => useAddRelayForm(onAdded), { wrapper });
    act(() => result.current.setUrl('wss://relay.example'));
    await act(() => result.current.submit());
    // The relay's English stays in the console; the form speaks one language.
    expect(result.current.error).toBe('Could not add that relay.');
    expect(switchRelay).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
});

describe('useSuggestedRelayAdd', () => {
  it('adds without switching', async () => {
    addRelay.mockResolvedValueOnce(undefined);
    const onAdded = vi.fn();
    const { result } = renderHook(() => useSuggestedRelayAdd('wss://s.example', false, onAdded), { wrapper });
    await act(() => result.current.add());
    expect(addRelay).toHaveBeenCalledWith('wss://s.example');
    expect(switchRelay).not.toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('reads a coded bridge error in the reader\'s language', async () => {
    addRelay.mockRejectedValueOnce(new CodedError('invalid-relay-url', 'relay URL must be a public wss:// hostname'));
    const es = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="es">{children}</LocaleProvider>;
    const { result } = renderHook(() => useSuggestedRelayAdd('wss://10.0.0.1', false, () => {}), { wrapper: es });
    await act(() => result.current.add());
    expect(result.current.error).toBe(translator('es')('errors.codes.invalid-relay-url'));
  });

  it('is a no-op when the relay is already configured', async () => {
    const { result } = renderHook(() => useSuggestedRelayAdd('wss://s.example', true, () => {}), { wrapper });
    await act(() => result.current.add());
    expect(addRelay).not.toHaveBeenCalled();
  });
});
