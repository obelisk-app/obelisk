'use client';

import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordMember } from '@/hooks/chat/concord/useConcordMember';
import Form from '@/components/ui/forms/Form';
import FormError from '@/components/ui/forms/FormError';
import FormActions from '@/components/ui/forms/FormActions';
import Checkbox from '@/components/ui/forms/Checkbox';
import Text from '@/components/ui/layout/Text';

export default function ConcordMember({ community, pubkey }: { community: ConcordCommunity; pubkey: string }) {
  const t = useTranslations();
  const vm = useConcordMember(community, pubkey);
  return <div data-testid="concord-member"><Form form={vm.form} layout="stack">
    <Text>{vm.name}</Text>
    {vm.roles.map(role => <Checkbox key={role.role_id} disabled={!vm.canManage} label={role.name} checked={vm.form.values.roles.includes(role.role_id)} onChange={event => vm.toggle(role.role_id, event.target.checked)} />)}
    <FormError>{vm.form.error}</FormError>
    {vm.canManage && <FormActions submitLabel={t('chat.concord.saveRoles')} busy={vm.form.submitting} disabled={!vm.form.dirty || !vm.form.canSubmit} />}
  </Form>
    {vm.canBan && <Form form={vm.removal} layout="stack">
      <Checkbox label={t('chat.concord.confirmRemoval')} checked={vm.removal.values.confirmed} onChange={event => vm.removal.set('confirmed', event.target.checked)} />
      <FormError>{vm.removal.error}</FormError>
      <FormActions submitLabel={t('chat.concord.banRotate')} busy={vm.removal.submitting} disabled={!vm.removal.canSubmit} />
    </Form>}
  </div>;
}
