'use client';

import { useTranslations } from 'next-intl';
import type { ConcordClient } from '@applesauce/concord/client';
import { useForm } from '@/hooks/common/useForm';
import { concordCreateForm } from '@/services/chat/concord/community-form';
import Form from '@/components/ui/forms/Form';
import Input from '@/components/ui/forms/Input';
import FormError from '@/components/ui/forms/FormError';
import FormActions from '@/components/ui/forms/FormActions';

export default function ConcordSetup({ client, onSelect }: { client: ConcordClient; onSelect: (id: string) => void }) {
  const t = useTranslations();
  const create = useForm(concordCreateForm(client, onSelect));
  return (
    <Form form={create} layout="stack">
      <Input label={t('chat.concord.name')} data-testid="concord-name" {...create.field('name')} />
      <Input label={t('chat.concord.description')} {...create.field('description')} />
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm text-lc-muted">{t('shell.rail.addModal.advanced')}</summary>
        <Input label={t('chat.concord.relay', { number: 1 })} data-testid="concord-relay-1" {...create.field('relay1')} />
        <Input label={t('chat.concord.relay', { number: 2 })} data-testid="concord-relay-2" {...create.field('relay2')} />
        <Input label={t('chat.concord.relay', { number: 3 })} data-testid="concord-relay-3" {...create.field('relay3')} />
      </details>
      <FormError>{create.error}</FormError>
      <FormActions submitLabel={t('shell.rail.addModal.createCommunity')} submitTestId="concord-create" busy={create.submitting} disabled={!create.canSubmit} />
    </Form>
  );
}
