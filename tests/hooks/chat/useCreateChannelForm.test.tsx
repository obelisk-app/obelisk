import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createGroup = vi.fn();
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: { createGroup: (...a: unknown[]) => createGroup(...a) },
  });
});

import { useCreateChannelForm } from '@/hooks/chat/useCreateChannelForm';
import { LocaleProvider } from '@tests/support/intl';
import type { ReactNode } from 'react';

/** The hook words its errors through next-intl, so it needs a provider. */
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;


afterEach(() => createGroup.mockReset());

describe('useCreateChannelForm', () => {
  it('cannot submit an empty or whitespace name, and never calls the bridge for one', async () => {
    const { result } = renderHook(() => useCreateChannelForm(() => {}), { wrapper });
    expect(result.current.canSubmit).toBe(false);
    act(() => result.current.setName('   '));
    expect(result.current.canSubmit).toBe(false);
    await act(() => result.current.submit());
    expect(createGroup).not.toHaveBeenCalled();
  });

  it('publishes a public, open channel with the trimmed name and reports the id', async () => {
    createGroup.mockResolvedValueOnce('rly/new');
    const onCreated = vi.fn();
    const { result } = renderHook(() => useCreateChannelForm(onCreated), { wrapper });
    act(() => result.current.setName('  general  '));
    const prevent = vi.fn();
    await act(() => result.current.submit({ preventDefault: prevent } as unknown as React.FormEvent));
    expect(prevent).toHaveBeenCalled();
    expect(createGroup).toHaveBeenCalledWith({ name: 'general', isPublic: true, isOpen: true });
    expect(onCreated).toHaveBeenCalledWith('rly/new');
    expect(result.current.name).toBe('');
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces the relay error, keeps the draft and does not report a creation', async () => {
    createGroup.mockRejectedValueOnce(new Error('restricted: admins only'));
    const onCreated = vi.fn();
    const { result } = renderHook(() => useCreateChannelForm(onCreated), { wrapper });
    act(() => result.current.setName('general'));
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Could not create the channel.');
    expect(result.current.name).toBe('general');
    expect(onCreated).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('ignores a second submit while one is in flight', async () => {
    let finish!: (id: string) => void;
    createGroup.mockImplementationOnce(() => new Promise<string>((r) => { finish = r; }));
    const { result } = renderHook(() => useCreateChannelForm(() => {}), { wrapper });
    act(() => result.current.setName('general'));
    let first!: Promise<void>;
    act(() => { first = result.current.submit(); });
    expect(result.current.busy).toBe(true);
    expect(result.current.canSubmit).toBe(false);
    await act(() => result.current.submit());
    expect(createGroup).toHaveBeenCalledTimes(1);
    await act(async () => { finish('rly/x'); await first; });
    expect(result.current.busy).toBe(false);
  });

  it('reset drops the draft and the error', async () => {
    createGroup.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useCreateChannelForm(() => {}), { wrapper });
    act(() => result.current.setName('x'));
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Could not create the channel.');
    act(() => result.current.reset());
    expect(result.current.name).toBe('');
    expect(result.current.error).toBeNull();
  });
});
