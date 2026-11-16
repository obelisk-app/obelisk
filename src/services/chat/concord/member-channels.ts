import type { ConcordClient, ConcordCommunity } from '@applesauce/concord/client';
import { PERM, VSK } from '@/constants/chat/concord';
import { memberChannelPolicy } from '@/schemas/chat/concord-member-channels';
import { awaitConcordSendReady } from './send-readiness';
import { disableMemberChannelRole } from './member-channel-preservation';

/** Only the owner opts a community into automatic, protocol-valid member grants. */
export async function setMemberChannelPolicy(community: ConcordCommunity, enabled: boolean, roleName: string) {
  await awaitConcordSendReady(community);
  if (community.pubkey !== community.material.owner) throw new Error('Owner required');
  const previous = memberChannelPolicy(community.state$.value);
  let roleId = previous?.roleId;
  if (!roleId && enabled) roleId = await community.createRole(roleName, 0xfffffffe, PERM.MANAGE_CHANNELS);
  if (!roleId) return;
  const role = community.state$.value.roles.find(item => item.role_id === roleId);
  if (!role || role.scope.kind !== 'server' || role.position !== 0xfffffffe) throw new Error('Invalid member role');
  if (enabled) await community.editRole(roleId, { permissions: String(PERM.MANAGE_CHANNELS), deleted: false });
  else await disableMemberChannelRole(community, roleId);
  const head = await community.admin.latestEdition(community.communityId);
  if (!head) throw new Error('Community metadata unavailable');
  const content = JSON.parse(head.content);
  await community.admin.publishEdition(VSK.METADATA, community.communityId, JSON.stringify({
    ...content, custom: { ...content.custom, obelisk: { ...content.custom?.obelisk, memberChannels: { roleId, enabled } } },
  }), 'member-channel-policy', { expectedHead: head.hash });
}

/** Grants retain existing roles. No synthetic client-side permission or shared staff secret. */
export function startMemberChannelGrants(community: ConcordCommunity) {
  let disposed = false;
  let running = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const next = () => {
    const state = community.state$.value;
    const policy = memberChannelPolicy(state);
    if (disposed || community.phase$.value !== 'live' || community.pubkey !== state.material.owner || state.dissolved || !policy?.enabled) return;
    const role = state.roles.find(item => item.role_id === policy.roleId);
    if (!role || role.deleted || role.scope.kind !== 'server' || role.position !== 0xfffffffe || role.permissions !== String(PERM.MANAGE_CHANNELS)) return;
    const member = [...state.members].find(key => key !== state.material.owner && !state.banlist.has(key) &&
      !(state.grants.get(key) ?? []).includes(role.role_id) && (state.grants.get(key)?.length ?? 0) < 64);
    return member ? { member, roles: [...(state.grants.get(member) ?? []), role.role_id] } : undefined;
  };
  const run = async () => {
    if (running || disposed || retry) return;
    running = true;
    try {
      let grant;
      while ((grant = next())) await community.grantRoles(grant.member, grant.roles);
    } catch {
      // Do not spin on relay/signer failures or replace SDK authority checks.
      if (!disposed) retry = setTimeout(() => { retry = undefined; void run(); }, 30_000);
    } finally { running = false; }
  };
  const stateSub = community.state$.subscribe(() => { void run(); });
  const phaseSub = community.phase$.subscribe(() => { void run(); });
  return () => { disposed = true; clearTimeout(retry); stateSub.unsubscribe(); phaseSub.unsubscribe(); };
}

export function startClientMemberChannelGrants(client: ConcordClient) {
  const stops = new Map<string, () => void>();
  const sub = client.communities$.subscribe(states => {
    const ids = new Set(states.map(state => state.material.community_id));
    for (const [id, stop] of stops) if (!ids.has(id)) { stop(); stops.delete(id); }
    for (const id of ids) {
      const community = client.getCommunity(id);
      if (community && !stops.has(id)) stops.set(id, startMemberChannelGrants(community));
    }
  });
  return () => { sub.unsubscribe(); for (const stop of stops.values()) stop(); stops.clear(); };
}
