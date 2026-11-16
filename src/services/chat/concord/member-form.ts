import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';

export function concordMemberForm(community: ConcordCommunity, pubkey: string): FormSpec<{ roles: string[] }> {
  return {
    initial: { roles: [...(community.state$.value.grants.get(pubkey) ?? [])] },
    submit: async values => {
      try { await community.grantRoles(pubkey, values.roles); }
      catch (error) {
        if (process.env.NODE_ENV === 'development' && error instanceof Error) console.error('Concord grant:', error.message.replace(/nsec1[a-z0-9]+|\b[0-9a-f]{64}\b/g, '[redacted]'));
        throw error;
      }
    },
    failure: 'chat.concord.failed',
  };
}
