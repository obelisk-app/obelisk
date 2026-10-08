import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useForm } from '@/hooks/common/useForm';
import { createChannelForm } from '@/services/chat/channel/create-channel-form';

const createGroup = vi.fn();
const wrapper = bridgeWrapper(fakeBridge({}, { createGroup: (...a: unknown[]) => createGroup(...a) } as never));
const useCreateChannelForm = (onCreated: (id: string) => void) => useForm(createChannelForm(onCreated));

afterEach(() => createGroup.mockReset());

describe('createChannelForm', () => {
  it('cannot submit an empty or whitespace name, and never calls the bridge for one', async () => {
    const { result } = renderHook(() => useCreateChannelForm(() => {}), { wrapper });
    expect(result.current.canSubmit).toBe(false);
    act(() => result.current.set('name', '   '));
    expect(result.current.canSubmit).toBe(false);
    await act(() => result.current.submit());
    expect(createGroup).not.toHaveBeenCalled();
  });

  it('publishes a public, open channel with the trimmed name and reports the id', async () => {
    createGroup.mockResolvedValueOnce('rly/new');
    const onCreated = vi.fn();
    const { result } = renderHook(() => useCreateChannelForm(onCreated), { wrapper });
    act(() => result.current.set('name', '  general  '));
    const prevent = vi.fn();
    await act(() => result.current.submit({ preventDefault: prevent } as never));
    expect(prevent).toHaveBeenCalled();
    expect(createGroup).toHaveBeenCalledWith({ name: 'general', isPublic: true, isOpen: true });
    expect(onCreated).toHaveBeenCalledWith('rly/new');
    expect(result.current.values.name).toBe('');
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces the relay error, keeps the draft and does not report a creation', async () => {
    createGroup.mockRejectedValueOnce(new Error('restricted: admins only'));
    const onCreated = vi.fn();
    const { result } = renderHook(() => useCreateChannelForm(onCreated), { wrapper });
    act(() => result.current.set('name', 'general'));
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Could not create the channel.');
    expect(result.current.values.name).toBe('general');
    expect(onCreated).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it('ignores a second submit while one is in flight', async () => {
    let finish!: (id: string) => void;
    createGroup.mockImplementationOnce(() => new Promise<string>((r) => { finish = r; }));
    const { result } = renderHook(() => useCreateChannelForm(() => {}), { wrapper });
    act(() => result.current.set('name', 'general'));
    let first!: Promise<void>;
    act(() => { first = result.current.submit(); });
    expect(result.current.submitting).toBe(true);
    expect(result.current.canSubmit).toBe(false);
    await act(() => result.current.submit());
    expect(createGroup).toHaveBeenCalledTimes(1);
    await act(async () => { finish('rly/x'); await first; });
    expect(result.current.submitting).toBe(false);
  });

  it('reset drops the draft and the error', async () => {
    createGroup.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useCreateChannelForm(() => {}), { wrapper });
    act(() => result.current.set('name', 'x'));
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Could not create the channel.');
    act(() => result.current.reset());
    expect(result.current.values.name).toBe('');
    expect(result.current.error).toBeNull();
  });
});
