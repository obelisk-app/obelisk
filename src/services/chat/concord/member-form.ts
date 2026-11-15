import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';

export function concordMemberForm(community: ConcordCommunity, pubkey: string): FormSpec<{ roles: string[] }> {
  return {
    initial: { roles: [...(community.state$.value.grants.get(pubkey) ?? [])] },
    submit: values => community.grantRoles(pubkey, values.roles),
    failure: 'chat.concord.failed',
  };
}
