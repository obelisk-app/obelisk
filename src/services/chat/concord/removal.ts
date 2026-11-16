import type { ConcordCommunity } from '@applesauce/concord/client';
import { PERM } from '@/constants/chat/concord';
import { refoundAuthority } from '@applesauce/concord/helpers';
import type { FormSpec } from '@/types/common/form';

/** Never report a ban as read-access revocation until root and private keys rotate. */
export async function banConcordMember(community: ConcordCommunity, member: string, readers: Record<string, string[]> = {}) {
  const state = community.state$.value;
  if (!refoundAuthority(state, PERM.BAN, member)(community.pubkey)) throw new Error('Insufficient removal authority');
  const privateChannels = state.channels.filter(channel => channel.private);
  if (privateChannels.length && !community.canDo(PERM.MANAGE_CHANNELS)) throw new Error('Private channel rotation requires channel authority');
  for (const channel of privateChannels) {
    const keep = readers[channel.channel_id];
    if (!keep?.includes(community.pubkey) || !community.material.channels.some(key => key.id === channel.channel_id) || keep.some(pubkey => pubkey === member || state.banlist.has(pubkey) || !state.members.has(pubkey))) throw new Error('Private channel readership must be reviewed before removal');
  }
  // Rotate each private channel only to its explicitly reviewed audience. Do not
  // use the community roster as a shortcut for private-channel membership.
  for (const channel of privateChannels) await community.rotateChannel(channel.channel_id, { keep: readers[channel.channel_id] });
  // The SDK rejects incompatible pending refoundings, and reports success only
  // after the mandatory artifacts reach a common relay majority.
  await community.banMembers([member], { refound: true });
}

export function concordRemovalForm(community: ConcordCommunity, member: string): FormSpec<{ confirmed: boolean; readers: Record<string, string[]> }> {
  return {
    initial: { confirmed: false, readers: Object.fromEntries(community.state$.value.channels.filter(channel => channel.private).map(channel => [channel.channel_id, [community.pubkey]])) },
    ready: values => values.confirmed,
    submit: values => banConcordMember(community, member, values.readers),
    failure: 'chat.concord.removalFailed', resetOnSuccess: true,
  };
}
