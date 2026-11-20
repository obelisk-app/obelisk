import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';
import { PERM } from '@/constants/chat/concord';
import { awaitConcordSendReady } from './send-readiness';

class InviteBlocked extends Error {
  constructor(readonly reason: 'chat.concord.inviteSyncFailed' | 'chat.concord.invitePermission') {
    super(reason);
  }
}

export function concordInviteForm(community: ConcordCommunity, onCreated: (url: string) => void): FormSpec<Record<string, never>, string> {
  return {
    initial: {},
    submit: async () => {
      // A failed initial reconciliation otherwise leaves this instance in
      // the SDK's error phase until a reload.
      try {
        const retrying = community.phase$.value === 'error';
        const ready = awaitConcordSendReady(community, retrying);
        if (retrying) void community.start().catch(() => {});
        await ready;
      } catch {
        throw new InviteBlocked('chat.concord.inviteSyncFailed');
      }
      if (!community.canDo(PERM.CREATE_INVITE)) throw new InviteBlocked('chat.concord.invitePermission');
      return (await community.createInvite({ base: window.location.origin, label: 'Obelisk' })).url;
    },
    onSuccess: onCreated,
    failure: error => error instanceof InviteBlocked ? error.reason : 'chat.concord.invitePublishFailed',
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
