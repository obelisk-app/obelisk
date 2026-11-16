'use client';

import type { ConcordCommunity } from '@applesauce/concord/client';
import { useTranslations } from 'next-intl';
import { useForm } from '@/hooks/common/useForm';
import { concordChannelEditForm } from '@/services/chat/concord/channel-form';
import Form from '@/components/ui/forms/Form';
import Input from '@/components/ui/forms/Input';
import FormError from '@/components/ui/forms/FormError';
import FormActions from '@/components/ui/forms/FormActions';

export default function ConcordChannelEditForm({ community, channelId, name, onSaved }: {
  community: ConcordCommunity; channelId: string; name: string; onSaved: () => void;
}) {
  const t = useTranslations();
  const form = useForm(concordChannelEditForm(community, channelId, name, onSaved));
  return <Form form={form} layout="stack">
    <Input label={t('chat.concord.channelName')} data-testid="concord-channel-edit-name" {...form.field('name')} />
    <FormError>{form.error}</FormError>
    <FormActions submitLabel={t('common.save')} submitTestId="concord-channel-edit-save" busy={form.submitting} disabled={!form.canSubmit} />
  </Form>;
}
