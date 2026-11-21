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
  const community = { phase$, createInvite, canDo: () => true } as unknown as ConcordCommunity;
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
  const community = { phase$: new BehaviorSubject('live'), createInvite, canDo: () => true } as unknown as ConcordCommunity;
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

it('revokes the selected invitation only after synchronization and exposes rejection', async () => {
  const { concordRevokeInviteForm } = await import('@/services/chat/concord/invite-form');
  const phase$ = new BehaviorSubject('syncing');
  const revokeInvite = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
  const community = { phase$, revokeInvite } as unknown as ConcordCommunity;
  const invite = { token: 'test-only' } as import('@applesauce/concord/client').ConcordInviteLink;
  const { result } = renderHook(() => useForm(concordRevokeInviteForm(community, invite)), {
    wrapper: ({ children }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>,
  });
  let pending!: Promise<void>;
  act(() => { pending = result.current.submit(); void result.current.submit(); });
  expect(revokeInvite).not.toHaveBeenCalled();
  await act(async () => { phase$.next('live'); await pending; });
  expect(result.current.error).toBeTruthy();
  await act(async () => { await result.current.submit(); });
  expect(revokeInvite).toHaveBeenCalledTimes(2);
  expect(revokeInvite).toHaveBeenLastCalledWith(invite);
  expect(result.current.error).toBeNull();
});

it('retries the failed community sync when an invite is requested', async () => {
  const phase$ = new BehaviorSubject('error');
  const start = vi.fn(async () => { await Promise.resolve(); phase$.next('syncing'); phase$.next('live'); });
  const createInvite = vi.fn().mockResolvedValue({ url: 'test-invitation' });
  const community = { phase$, start, createInvite, canDo: () => true } as unknown as ConcordCommunity;
  const form = concordInviteForm(community, vi.fn());
  await expect(form.submit({})).resolves.toBe('test-invitation');
  expect(start).toHaveBeenCalledOnce();
  expect(createInvite).toHaveBeenCalledOnce();
});

it('preserves the SDK permission check after synchronization', async () => {
  const createInvite = vi.fn();
  const community = { phase$: new BehaviorSubject('live'), createInvite, canDo: () => false } as unknown as ConcordCommunity;
  const form = concordInviteForm(community, vi.fn());
  await expect(form.submit({})).rejects.toThrow('chat.concord.invitePermission');
  expect(createInvite).not.toHaveBeenCalled();
});

it('shares a registered invite without its revocation key and preserves unrelated metadata', async () => {
  const { concordShareInviteForm } = await import('@/services/chat/concord/invite-form');
  const { PERM } = await import('@/constants/chat/concord');
  const publishEdition = vi.fn();
  const canDo = vi.fn(permission => permission === PERM.MANAGE_METADATA);
  const community = {
    communityId: 'community',
    phase$: new BehaviorSubject('live'),
    state$: { value: { inviteLinks: new Set(['registered']) } },
    canDo,
    admin: {
      latestEdition: vi.fn().mockResolvedValue({ hash: 'head', content: JSON.stringify({ name: 'Garden', custom: { obelisk: { layout: ['preserved'] } } }) }),
      publishEdition,
    },
  } as unknown as ConcordCommunity;
  const invite = { signerPubkey: 'registered', url: 'https://obelisk.example/invite/example#token', signerSk: 'revocation-secret' } as import('@applesauce/concord/client').ConcordInviteLink;
  await concordShareInviteForm(community, invite, false).submit({});
  const [_kind, _id, content, _stage, options] = publishEdition.mock.calls[0];
  expect(JSON.parse(content)).toEqual({ name: 'Garden', custom: { obelisk: { layout: ['preserved'], sharedInvite: { url: invite.url } } } });
  expect(content).not.toContain(invite.signerSk);
  expect(options).toEqual({ expectedHead: 'head' });

  canDo.mockReturnValue(false);
  await expect(concordShareInviteForm(community, invite, false).submit({})).rejects.toThrow('metadata permission');
  expect(publishEdition).toHaveBeenCalledOnce();
});
