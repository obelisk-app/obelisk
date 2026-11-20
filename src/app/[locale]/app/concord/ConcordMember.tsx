'use client';

import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordMember } from '@/hooks/chat/concord/useConcordMember';
import Form from '@/components/ui/forms/Form';
import FormError from '@/components/ui/forms/FormError';
import FormActions from '@/components/ui/forms/FormActions';
import Checkbox from '@/components/ui/forms/Checkbox';
import { Avatar } from '@/app/[locale]/app/desktop/Avatar';

export default function ConcordMember({ community, pubkey }: { community: ConcordCommunity; pubkey: string }) {
  const t = useTranslations();
  const vm = useConcordMember(community, pubkey);
  if (!vm.canManage && !vm.canBan) return <div className="mb-2 flex items-center gap-2 p-2 text-sm font-medium" data-testid="concord-member" data-pubkey={pubkey}>
    <Avatar pubkey={pubkey} size={8} picture={null} />{vm.name}
  </div>;
  return <details className="mb-2 rounded-lg p-2 hover:bg-lc-card" data-testid="concord-member" data-pubkey={pubkey}><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Avatar pubkey={pubkey} size={8} picture={null} />{vm.name}</summary><Form form={vm.form} layout="stack">
    {vm.roles.map(role => <Checkbox key={role.role_id} disabled={!vm.canManage} label={role.name} checked={vm.form.values.roles.includes(role.role_id)} onChange={event => vm.toggle(role.role_id, event.target.checked)} />)}
    <FormError>{vm.form.error}</FormError>
    {vm.canManage && <FormActions submitLabel={t('chat.concord.saveRoles')} busy={vm.form.submitting} disabled={!vm.form.dirty || !vm.form.canSubmit} />}
  </Form>
    {vm.canBan && <Form form={vm.removal} layout="stack">
      {vm.privateChannels.map(channel => <fieldset key={channel.channel_id}>
        <legend>{t('chat.concord.reviewReaders', { channel: channel.name })}</legend>
        {vm.readers.map(reader => <Checkbox key={reader.pubkey} label={reader.label} disabled={reader.pubkey === community.pubkey} checked={vm.removal.values.readers[channel.channel_id]?.includes(reader.pubkey) ?? false} onChange={event => vm.keepReader(channel.channel_id, reader.pubkey, event.target.checked)} />)}
      </fieldset>)}
      <Checkbox label={t('chat.concord.confirmRemoval')} checked={vm.removal.values.confirmed} onChange={event => vm.removal.set('confirmed', event.target.checked)} />
      <FormError>{vm.removal.error}</FormError>
      <FormActions submitLabel={t('chat.concord.banRotate')} busy={vm.removal.submitting} disabled={!vm.removal.canSubmit} />
    </Form>}
  </details>;
}
