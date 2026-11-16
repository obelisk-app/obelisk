import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';
import { awaitConcordSendReady } from './send-readiness';

export function concordInviteForm(community: ConcordCommunity, onCreated: (url: string) => void): FormSpec<Record<string, never>, string> {
  return {
    initial: {},
    submit: async () => {
      await awaitConcordSendReady(community);
      return (await community.createInvite({ base: window.location.origin, label: 'Obelisk' })).url;
    },
    onSuccess: onCreated, failure: 'chat.concord.failed',
  };
}

/** Revocation stops future admissions through this link, not existing readers. */
export function concordRevokeInviteForm(community: ConcordCommunity, invite: import('@applesauce/concord/client').ConcordInviteLink): FormSpec<Record<string, never>> {
  return {
    initial: {},
    submit: async () => { await awaitConcordSendReady(community); await community.revokeInvite(invite); },
    failure: 'chat.concord.failed',
  };
}
