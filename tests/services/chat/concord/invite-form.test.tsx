import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { expect, it, vi } from 'vitest';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { LocaleProvider } from '@tests/support/intl';
import { useForm } from '@/hooks/common/useForm';
import { concordInviteForm } from '@/services/chat/concord/invite-form';

it('shows pending work, waits for synchronized keys and deduplicates repeated invite actions', async () => {
  const phase$ = new BehaviorSubject('syncing');
  const createInvite = vi.fn().mockResolvedValue({ url: 'test-invitation' });
  const created = vi.fn();
  const community = { phase$, createInvite } as unknown as ConcordCommunity;
  const { result } = renderHook(() => useForm(concordInviteForm(community, created)), {
    wrapper: ({ children }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>,
  });
  let pending!: Promise<void>;
  act(() => { pending = result.current.submit(); void result.current.submit(); });
  expect(result.current.submitting).toBe(true);
  expect(createInvite).not.toHaveBeenCalled();
  await act(async () => { phase$.next('live'); await pending; });
  expect(createInvite).toHaveBeenCalledOnce();
  expect(created).toHaveBeenCalledWith('test-invitation', {});
  expect(result.current.submitting).toBe(false);
});

it('shows an invite failure and permits retry', async () => {
  const createInvite = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ url: 'test-invitation' });
  const community = { phase$: new BehaviorSubject('live'), createInvite } as unknown as ConcordCommunity;
  const created = vi.fn();
  const { result } = renderHook(() => useForm(concordInviteForm(community, created)), {
    wrapper: ({ children }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>,
  });
  await act(async () => { await result.current.submit(); });
  expect(result.current.error).toBeTruthy();
  expect(created).not.toHaveBeenCalled();
  await act(async () => { await result.current.submit(); });
  expect(created).toHaveBeenCalledOnce();
  expect(result.current.error).toBeNull();
});
