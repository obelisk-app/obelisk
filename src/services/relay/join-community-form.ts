import type { ConcordClient } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';
import { parseCommunityLink } from '@/schemas/relay/community-link';
import { relayInviteLink } from '@/utils/relay/relay-invite';
import { concordJoinForm } from '@/services/chat/concord/community-form';
import { readPendingConcordInvite } from '@/services/chat/concord/pending-invite';
import { addRelayForm } from './add-relay-form';

export function joinCommunityForm(
  getClient: () => Promise<ConcordClient>,
  onClose: () => void,
  onJoined: (id: string) => void,
  fromInvite: boolean,
): FormSpec<{ link: string }> {
  return {
    initial: { link: fromInvite ? readPendingConcordInvite() : '' },
    ready: ({ link }) => !!link.trim(),
    validate: ({ link }) => parseCommunityLink(link) ? null : 'shell.rail.addModal.invalidLink',
    submit: async ({ link }) => {
      const target = parseCommunityLink(link);
      if (!target) return;
      if (target.kind === 'relay-invite') {
        // Keep the established invitation landing and its relay confirmation.
        const url = relayInviteLink(window.location.origin, target.code, target.relay);
        window.location.assign(url);
      } else if (target.kind === 'concord') {
        const form = concordJoinForm(await getClient(), onJoined);
        const values = { invite: target.url };
        const id = await form.submit(values);
        form.onSuccess?.(id, values);
      } else if (target.kind === 'relay') {
        await addRelayForm(onClose).submit({ url: target.url });
        onClose();
      }
    },
    failure: 'shell.rail.addModal.joinFailed',
  };
}
