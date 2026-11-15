import type { ConcordClient } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';
import { CONCORD_DEFAULT_RELAYS } from '@/constants/nostr-bridge/concord';
import { parseConcordCreationRelays } from '@/schemas/chat/concord-relays';
import { clearPendingConcordInvite, readPendingConcordInvite } from './pending-invite';

export function concordCreateForm(client: ConcordClient, onCreated: (id: string) => void): FormSpec<{
  name: string; description: string; relay1: string; relay2: string; relay3: string;
}, string> {
  return {
    initial: { name: '', description: '', relay1: CONCORD_DEFAULT_RELAYS[0], relay2: CONCORD_DEFAULT_RELAYS[1], relay3: CONCORD_DEFAULT_RELAYS[2] },
    ready: values => values.name.trim().length > 0,
    validate: values => parseConcordCreationRelays([values.relay1, values.relay2, values.relay3]) ? null : 'chat.concord.invalidRelays',
    submit: async values => {
      const relays = parseConcordCreationRelays([values.relay1, values.relay2, values.relay3]);
      if (!relays) throw new Error('Invalid relay set');
      const community = await client.createNewCommunity(values.name.trim(), values.description, [...relays]);
      return community.communityId;
    },
    onSuccess: onCreated, failure: 'chat.concord.failed',
  };
}

export function concordJoinForm(client: ConcordClient, onJoined: (id: string) => void): FormSpec<{ invite: string }, string> {
  return {
    initial: { invite: readPendingConcordInvite() }, ready: values => !!values.invite.trim(),
    submit: async values => (await client.joinByLink(values.invite.trim())).communityId,
    onSuccess: id => { clearPendingConcordInvite(); onJoined(id); }, failure: 'chat.concord.failed',
  };
}
