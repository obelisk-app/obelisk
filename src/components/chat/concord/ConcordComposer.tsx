'use client';

import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordComposer } from '@/hooks/chat/concord/useConcordComposer';
import Form from '@/components/ui/forms/Form';
import Input from '@/components/ui/forms/Input';
import FormActions from '@/components/ui/forms/FormActions';
import FormError from '@/components/ui/forms/FormError';
import Text from '@/components/ui/layout/Text';

export default function ConcordComposer({ community, channelId, publication = false }: { community: ConcordCommunity; channelId: string; publication?: boolean }) {
  const t = useTranslations();
  const form = useConcordComposer(community, channelId);
  return <Form form={form} layout="stack" className="border-t border-lc-border p-3">
    {publication && <Input label={t('chat.concord.subject')} {...form.field('subject')} />}
    <Input aria-label={t('chat.concord.message')} data-testid="concord-message-input" {...form.field('content')} />
    <Input type="file" multiple value="" label={t('chat.concord.attachments')} onChange={event => form.attach(event.target.files)} />
    {form.values.files.map((file, index) => <Text key={index} variant="caption">{file.name}</Text>)}
    <FormError>{form.error}</FormError>
    <FormActions submitLabel={t('chat.concord.send')} submitTestId="concord-send" busy={form.submitting} disabled={!form.canSubmit} />
  </Form>;
}
