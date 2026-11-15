import type { ConcordCommunity } from '@applesauce/concord/client';
import type { FormSpec } from '@/types/common/form';
import { PERM } from '@/constants/chat/concord';

export function concordRoleForm(community: ConcordCommunity): FormSpec<{
  name: string; position: string; color: string; invite: boolean; messages: boolean; channels: boolean;
}> {
  return {
    initial: { name: '', position: '10', color: '#22c55e', invite: false, messages: false, channels: false },
    ready: values => !!values.name.trim() && /^\d+$/.test(values.position) && Number(values.position) > 0 && Number(values.position) < 0xffffffff,
    submit: async values => {
      const permissions = (values.invite ? PERM.CREATE_INVITE : BigInt(0)) |
        (values.messages ? PERM.MANAGE_MESSAGES : BigInt(0)) | (values.channels ? PERM.MANAGE_CHANNELS : BigInt(0));
      const id = await community.createRole(values.name.trim(), Number(values.position), permissions);
      await community.editRole(id, { color: Number.parseInt(values.color.slice(1), 16) });
    },
    resetOnSuccess: true, failure: 'chat.concord.failed',
  };
}
