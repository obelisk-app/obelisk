import type { ConcordCommunity } from '@applesauce/concord/client';
import { VSK } from '@/constants/chat/concord';

/** The SDK revalidates channel authors against current roles. Keep their accepted work
 * owner-rooted before removing a shared role, including terminal deletion editions. */
export async function disableMemberChannelRole(community: ConcordCommunity, roleId: string) {
  if (community.pubkey !== community.material.owner) throw new Error('Owner required');
  const heads = () => [...(community.state$.value.controlVerification?.heads.values() ?? [])]
    .filter(head => head.vsk === VSK.CHANNEL);
  const preservedDeletions = new Set<string>();
  for (const head of heads()) {
    const author = head.edition.author;
    if (author === community.material.owner || !community.state$.value.grants.get(author)?.includes(roleId)) continue;
    await community.admin.publishEdition(VSK.CHANNEL, head.eid, head.edition.rumor.content,
      'preserve-member-channel', { expectedHead: head.hash });
    // Terminal deletions select the lowest rumor ID, not the newest edition.
    // Our acknowledged owner deletion may become selected only after demotion.
    if (JSON.parse(head.edition.rumor.content).deleted === true) preservedDeletions.add(head.eid);
  }
  const fingerprint = () => heads().map(head => `${head.eid}:${head.hash}`).sort().join(',');
  const expectedChannels = fingerprint();
  // New work during signer I/O must abort revocation, not disappear from the fold.
  const check = () => {
    if (fingerprint() !== expectedChannels) throw new Error('Channels changed; retry disabling member creation');
    const state = community.state$.value;
    if (heads().some(head => state.controlVerification?.suspended.has(head.eid) ||
      head.edition.author !== state.material.owner && state.grants.get(head.edition.author)?.includes(roleId) && !preservedDeletions.has(head.eid))) {
      throw new Error('Member channel preservation is incomplete');
    }
  };
  const role = await community.admin.latestEdition(roleId);
  if (!role) throw new Error('Member role unavailable');
  check();
  await community.admin.publishEdition(VSK.ROLE, roleId, JSON.stringify({
    ...JSON.parse(role.content), permissions: '0', deleted: false,
  }), 'disable-member-channels', { expectedHead: role.hash, check });
}
