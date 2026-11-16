import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';
import { memberChannelPolicy } from '@/schemas/chat/concord-member-channels';
import { setMemberChannelPolicy } from './member-channels';

export function memberChannelPolicyForm(community: ConcordCommunity, roleName: string): FormSpec<{ enabled: boolean }> {
  return {
    initial: { enabled: memberChannelPolicy(community.state$.value)?.enabled ?? false },
    submit: values => setMemberChannelPolicy(community, values.enabled, roleName),
    failure: 'chat.concord.failed',
  };
}
