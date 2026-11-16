'use client';

import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordChannelForm } from '@/hooks/chat/concord/useConcordChannelForm';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import FormError from '@/components/ui/forms/FormError';
import Input from '@/components/ui/forms/Input';
import Checkbox from '@/components/ui/forms/Checkbox';

export default function ConcordChannelForm({ community }: { community: ConcordCommunity }) {
  const t = useTranslations();
  const vm = useConcordChannelForm(community);
  return <Form form={vm.form} layout="stack">
    <Input label={t('chat.concord.channelName')} data-testid="concord-channel-name" {...vm.form.field('name')} />
    <Input label={t('chat.concord.category')} {...vm.form.field('category')} />
    <Checkbox label={t('chat.concord.privateChannel')} checked={vm.form.values.private} onChange={event => vm.setPrivate(event.target.checked)} />
    <Checkbox label={t('chat.concord.publication')} checked={vm.form.values.publication} onChange={event => vm.setPublication(event.target.checked)} />
    <FormError>{vm.form.error}</FormError>
    <FormActions submitLabel={t('chat.concord.createChannel')} submitTestId="concord-channel-create" busy={vm.form.submitting} disabled={!vm.form.canSubmit} />
  </Form>;
}
