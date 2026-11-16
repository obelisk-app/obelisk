'use client';

import type { ConcordCommunity } from '@applesauce/concord/client';
import { useTranslations } from 'next-intl';
import { useConcordChannelEdit } from '@/hooks/chat/concord/useConcordChannelEdit';
import Select from '@/components/ui/forms/Select';
import Checkbox from '@/components/ui/forms/Checkbox';
import Form from '@/components/ui/forms/Form';
import Input from '@/components/ui/forms/Input';
import FormError from '@/components/ui/forms/FormError';
import FormActions from '@/components/ui/forms/FormActions';

export default function ConcordChannelEditForm({ community, channelId, name, onSaved }: {
  community: ConcordCommunity; channelId: string; name: string; onSaved: () => void;
}) {
  const t = useTranslations();
  const vm = useConcordChannelEdit(community, channelId, name, onSaved);
  const { form } = vm;
  return <Form form={form} layout="stack">
    <Input label={t('chat.concord.channelName')} data-testid="concord-channel-edit-name" {...form.field('name')} />
    <Input label={t('chat.concord.category')} data-testid="concord-channel-edit-category" {...form.field('category')} />
    <Input type="number" min="0" step="1" label={t('chat.concord.channelPosition')} {...form.field('position')} />
    <Select label={t('chat.concord.parentChannel')} {...form.field('parent')}>
      <option value="">{t('chat.concord.noParent')}</option>
      {vm.parents.map(channel => <option key={channel.channel_id} value={channel.channel_id}>{channel.name}</option>)}
    </Select>
    <Checkbox label={t('chat.concord.publication')} checked={form.values.publication} onChange={event => vm.setPublication(event.target.checked)} />
    <FormError>{form.error}</FormError>
    <FormActions submitLabel={t('common.save')} submitTestId="concord-channel-edit-save" busy={form.submitting} disabled={!form.canSubmit} />
  </Form>;
}
