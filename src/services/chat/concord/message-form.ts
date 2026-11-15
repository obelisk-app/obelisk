import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';

export function concordMessageForm(community: ConcordCommunity, channelId: string, onSent: () => void): FormSpec<{ content: string; files: File[]; subject: string }> {
  return {
    initial: { content: '', files: [], subject: '' }, ready: values => !!values.content.trim() || values.files.length > 0,
    submit: values => community.sendMessage(channelId, values.content, undefined, values.files, undefined, { subject: values.subject.trim() || undefined }),
    onSuccess: onSent, failure: 'chat.concord.failed',
  };
}
