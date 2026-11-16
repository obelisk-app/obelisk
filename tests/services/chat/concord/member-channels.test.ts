import { afterEach, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { CommunityState } from '@applesauce/concord';
import { startMemberChannelGrants } from '@/services/chat/concord/member-channels';
import { PERM } from '@/constants/chat/concord';

const stops: Array<() => void> = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.useRealTimers(); });
function fixture(enabled = true) {
  const roleId = 'ab'.repeat(32);
  const state$ = new BehaviorSubject({ material: { owner: 'owner' },
    metadata: { custom: { obelisk: { memberChannels: { roleId, enabled } } } },
    roles: [{ role_id: roleId, permissions: String(PERM.MANAGE_CHANNELS), position: 0xfffffffe, scope: { kind: 'server' } }],
    members: new Set(['owner', 'member', 'banned']), banlist: new Set(['banned']), grants: new Map([['member', ['prior-role']]]),
  } as unknown as CommunityState);
  const grantRoles = vi.fn(async (member: string, roles: string[]) => { state$.value.grants.set(member, roles); state$.next({ ...state$.value }); });
  const community = { pubkey: 'owner', state$, phase$: new BehaviorSubject('live'), grantRoles } as unknown as ConcordCommunity;
  return { community, grantRoles, state$, roleId };
}
it('grants only the opted-in member role, preserves other roles and skips owner/bans', async () => {
  const h = fixture();
  stops.push(startMemberChannelGrants(h.community));
  await vi.waitFor(() => expect(h.grantRoles).toHaveBeenCalledOnce());
  expect(h.grantRoles).toHaveBeenCalledWith('member', ['prior-role', h.roleId]);
  h.state$.next({ ...h.state$.value });
  expect(h.grantRoles).toHaveBeenCalledOnce();
});
it('does not grant for a disabled policy or from a non-owner account', () => {
  const h = fixture(false);
  stops.push(startMemberChannelGrants(h.community));
  const other = fixture();
  stops.push(startMemberChannelGrants({ ...other.community, pubkey: 'member' } as ConcordCommunity));
  expect(h.grantRoles).not.toHaveBeenCalled();
  expect(other.grantRoles).not.toHaveBeenCalled();
});
it('rejects a policy role edited to include unrelated authority', () => {
  const h = fixture();
  h.state$.value.roles[0].permissions = String(PERM.MANAGE_CHANNELS | PERM.BAN);
  stops.push(startMemberChannelGrants(h.community));
  expect(h.grantRoles).not.toHaveBeenCalled();
});
it('backs off failures and cancels retry when the runtime stops', async () => {
  vi.useFakeTimers();
  const h = fixture();
  h.grantRoles.mockRejectedValue(new Error('Offline'));
  const stop = startMemberChannelGrants(h.community);
  stops.push(stop);
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.grantRoles).toHaveBeenCalledOnce();
  stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(h.grantRoles).toHaveBeenCalledOnce();
});
