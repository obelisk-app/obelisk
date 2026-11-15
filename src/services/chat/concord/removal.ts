import type { ConcordCommunity } from '@applesauce/concord/client';
import { PERM } from '@/constants/chat/concord';
import { refoundAuthority } from '@applesauce/concord/helpers';

/** Never report a ban as read-access revocation until root and private keys rotate. */
export async function banConcordMember(community: ConcordCommunity, member: string) {
  const state = community.state$.value;
  if (!refoundAuthority(state, PERM.BAN, member)(community.pubkey)) throw new Error('Insufficient removal authority');
  const privateChannels = state.channels.filter(channel => channel.private);
  // The UI must collect a reviewed readership before rotating private channels.
  // Refuse here instead of silently granting every remaining member every key.
  if (privateChannels.length) throw new Error('Private channel readership must be reviewed before removal');
  await community.banMembers([member], { refound: true });
}
