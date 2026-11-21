import type { CommunityMetadata } from '@applesauce/concord';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';
import { PERM, VSK } from '@/constants/chat/concord';
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

/** Share only an existing live link. The authenticated metadata contains no invite signer key. */
export function concordShareInviteForm(
  community: ConcordCommunity,
  invite: import('@applesauce/concord/client').ConcordInviteLink,
  shared: boolean,
): FormSpec<Record<string, never>> {
  return {
    initial: {},
    submit: async () => {
      await awaitConcordSendReady(community);
      if (!community.canDo(PERM.MANAGE_METADATA)) throw new Error('Community metadata permission required');
      const state = community.state$.value;
      if (!shared && (!state.inviteLinks.has(invite.signerPubkey) || invite.revoked ||
        (invite.expiresAt !== undefined && invite.expiresAt <= Date.now() / 1000))) throw new Error('Invite is no longer active');
      const head = await community.admin.latestEdition(community.communityId);
      if (!head) throw new Error('Community metadata unavailable');
      const content = JSON.parse(head.content) as CommunityMetadata;
      const custom = content.custom ?? {};
      const obelisk = custom.obelisk && typeof custom.obelisk === 'object' ? custom.obelisk : {};
      const current = 'sharedInvite' in obelisk ? obelisk.sharedInvite : undefined;
      if (shared && (!current || typeof current !== 'object' || !('url' in current) || current.url !== invite.url)) return;
      const sharedInvite = shared ? undefined : { url: invite.url, expiresAt: invite.expiresAt };
      await community.admin.publishEdition(VSK.METADATA, community.communityId, JSON.stringify({
        ...content, custom: { ...custom, obelisk: { ...obelisk, sharedInvite } },
      }), 'community-shared-invite', { expectedHead: head.hash });
    },
    failure: 'chat.concord.failed',
  };
}
