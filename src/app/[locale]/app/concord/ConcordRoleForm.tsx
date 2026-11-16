'use client';

import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useForm } from '@/hooks/common/useForm';
import { concordRoleForm } from '@/services/chat/concord/role-form';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import FormError from '@/components/ui/forms/FormError';
import Input from '@/components/ui/forms/Input';
import Checkbox from '@/components/ui/forms/Checkbox';

export default function ConcordRoleForm({ community }: { community: ConcordCommunity }) {
  const t = useTranslations();
  const form = useForm(concordRoleForm(community));
  return <Form form={form} layout="stack">
    <Input label={t('chat.concord.roleName')} data-testid="concord-role-name" {...form.field('name')} />
    <Input label={t('chat.concord.rolePosition')} type="number" min={1} {...form.field('position')} />
    <Input label={t('chat.concord.roleColor')} type="color" {...form.field('color')} />
    <Checkbox label={t('chat.concord.allowInvites')} checked={form.values.invite} onChange={event => form.set('invite', event.target.checked)} />
    <Checkbox label={t('chat.concord.manageMessages')} checked={form.values.messages} onChange={event => form.set('messages', event.target.checked)} />
    <Checkbox label={t('chat.concord.manageChannels')} checked={form.values.channels} onChange={event => form.set('channels', event.target.checked)} />
    <FormError>{form.error}</FormError>
    <FormActions submitLabel={t('chat.concord.createRole')} submitTestId="concord-role-create" busy={form.submitting} disabled={!form.canSubmit} />
  </Form>;
}
