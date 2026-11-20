import { useContext } from 'react';
import { ConcordContext } from '@/contexts/chat/concord';
import { useConcordAdded } from '@/hooks/chat/concord/useConcordAdded';
import { useForm } from '@/hooks/common/useForm';
import { joinCommunityForm } from '@/services/relay/join-community-form';

export function useJoinCommunityForm(onClose: () => void, fromInvite: boolean) {
  const { client } = useContext(ConcordContext);
  const onJoined = useConcordAdded(onClose);
  return useForm(joinCommunityForm(client, onClose, onJoined, fromInvite));
}
