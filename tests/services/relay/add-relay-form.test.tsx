import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { translator } from '@tests/support/intl';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { CodedError } from '@/utils/errors/codes';
import { useForm } from '@/hooks/common/useForm';
import { useSuggestedRelayAdd } from '@/hooks/relay/rail/useSuggestedRelayAdd';
import { addRelayForm } from '@/services/relay/add-relay-form';

function bridge(addRelay = vi.fn().mockResolvedValue(undefined), switchRelay = vi.fn().mockResolvedValue(undefined)) {
  return { addRelay, switchRelay, fake: fakeBridge({}, { addRelay, switchRelay } as never) };
}

function customForm(onAdded = vi.fn(), b = bridge()) {
  const view = renderHook(() => useForm(addRelayForm(onAdded)), { wrapper: bridgeWrapper(b.fake) });
  return { ...view, ...b, onAdded };
}

describe('addRelayForm', () => {
  it('starts with the wss:// prefix and no error', () => {
    const { result } = customForm();
    expect(result.current.values.url).toBe('wss://');
    expect(result.current.error).toBeNull();
  });

  it('normalizes a bare host, adds it, switches to it, then reports', async () => {
    const { result, addRelay, switchRelay, onAdded } = customForm();
    act(() => result.current.set('url', 'relay.example'));
    await act(() => result.current.submit());
    expect(addRelay).toHaveBeenCalledWith('wss://relay.example');
    expect(switchRelay).toHaveBeenCalledWith('wss://relay.example');
    expect(switchRelay.mock.invocationCallOrder[0]).toBeGreaterThan(addRelay.mock.invocationCallOrder[0]);
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('rejects an unparseable address before touching the bridge', async () => {
    const { result, addRelay } = customForm();
    act(() => result.current.set('url', 'wss://'));
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Invalid URL');
    expect(addRelay).not.toHaveBeenCalled();
  });

  it('does nothing for a blank field', async () => {
    const { result, addRelay } = customForm();
    act(() => result.current.set('url', '  '));
    expect(result.current.canSubmit).toBe(false);
    await act(() => result.current.submit());
    expect(addRelay).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('says the add failed, in the reader\'s language, and does not switch', async () => {
    const { result, switchRelay, onAdded } = customForm(vi.fn(), bridge(vi.fn().mockRejectedValue(new Error('relay down'))));
    act(() => result.current.set('url', 'wss://relay.example'));
    await act(() => result.current.submit());
    // The relay's English stays in the console; the form speaks one language.
    expect(result.current.error).toBe('Could not add that relay.');
    expect(switchRelay).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });
});

describe('useSuggestedRelayAdd', () => {
  it('adds without switching', async () => {
    const b = bridge();
    const onAdded = vi.fn();
    const { result } = renderHook(() => useSuggestedRelayAdd('wss://s.example', false, onAdded), { wrapper: bridgeWrapper(b.fake) });
    await act(() => result.current.add());
    expect(b.addRelay).toHaveBeenCalledWith('wss://s.example');
    expect(b.switchRelay).not.toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('reads a coded bridge error in the reader\'s language', async () => {
    const b = bridge(vi.fn().mockRejectedValue(new CodedError('invalid-relay-url', 'relay URL must be a public wss:// hostname')));
    const { result } = renderHook(() => useSuggestedRelayAdd('wss://10.0.0.1', false, () => {}), { wrapper: bridgeWrapper(b.fake, { locale: 'es' }) });
    await act(() => result.current.add());
    expect(result.current.error).toBe(translator('es')('errors.codes.invalid-relay-url'));
  });

  it('is a no-op when the relay is already configured', async () => {
    const b = bridge();
    const { result } = renderHook(() => useSuggestedRelayAdd('wss://s.example', true, () => {}), { wrapper: bridgeWrapper(b.fake) });
    await act(() => result.current.add());
    expect(b.addRelay).not.toHaveBeenCalled();
  });
});
