import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';
import { setConcordChannelCategory, setConcordChannelName } from './channel-metadata';

export function concordChannelForm(community: ConcordCommunity, onCreated: (id: string) => void): FormSpec<{
  name: string; private: boolean; publication: boolean; category: string;
}, string> {
  return {
    initial: { name: '', private: false, publication: false, category: '' },
    ready: values => !!values.name.trim(),
    submit: async values => {
      const id = await community.createChannel(values.name.trim(), {
        private: values.private, view: values.publication ? 'forum' : 'chat',
      });
      if (values.category.trim()) await setConcordChannelCategory(community, id, values.category);
      return id;
    },
    onSuccess: onCreated, resetOnSuccess: true, failure: 'chat.concord.failed',
  };
}

export function concordChannelEditForm(community: ConcordCommunity, channelId: string, name: string, onSaved: () => void): FormSpec<{ name: string }> {
  return {
    initial: { name }, ready: values => !!values.name.trim(),
    submit: values => setConcordChannelName(community, channelId, values.name),
    onSuccess: onSaved, failure: 'chat.concord.failed',
  };
}
