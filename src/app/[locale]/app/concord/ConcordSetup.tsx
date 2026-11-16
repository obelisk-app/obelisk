'use client';

import { useState } from 'react';
import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import type { ConcordClient } from '@applesauce/concord/client';
import { useForm } from '@/hooks/common/useForm';
import { concordCreateForm, concordJoinForm } from '@/services/chat/concord/community-form';
import Form from '@/components/ui/forms/Form';
import Input from '@/components/ui/forms/Input';
import FormError from '@/components/ui/forms/FormError';
import FormActions from '@/components/ui/forms/FormActions';
import Heading from '@/components/ui/layout/Heading';

export default function ConcordSetup({ client, onSelect }: { client: ConcordClient; onSelect: (id: string) => void }) {
  const t = useTranslations();
  const [mode, setMode] = useState<'create' | 'join'>('join');
  const create = useForm(concordCreateForm(client, onSelect));
  const join = useForm(concordJoinForm(client, onSelect));
  return <div className="space-y-5">
    <div className="flex gap-2"><Button variant={mode === 'join' ? 'primary' : 'outline'} onClick={() => setMode('join')}>{t('chat.concord.join')}</Button><Button variant={mode === 'create' ? 'primary' : 'outline'} onClick={() => setMode('create')}>{t('chat.concord.create')}</Button></div>
    {mode === 'create' ? <Form form={create} layout="stack">
      <Heading as="h2" variant="panel">{t('chat.concord.create')}</Heading>
      <Input label={t('chat.concord.name')} data-testid="concord-name" {...create.field('name')} />
      <Input label={t('chat.concord.description')} {...create.field('description')} />
      <details className="space-y-3"><summary className="cursor-pointer text-sm text-lc-muted">{t('chat.concord.relays')}</summary>
      <Input label={t('chat.concord.relay', { number: 1 })} data-testid="concord-relay-1" {...create.field('relay1')} />
      <Input label={t('chat.concord.relay', { number: 2 })} data-testid="concord-relay-2" {...create.field('relay2')} />
      <Input label={t('chat.concord.relay', { number: 3 })} data-testid="concord-relay-3" {...create.field('relay3')} />
      </details>
      <FormError>{create.error}</FormError>
      <FormActions submitLabel={t('chat.concord.create')} submitTestId="concord-create" busy={create.submitting} disabled={!create.canSubmit} />
    </Form> : <Form form={join} layout="stack">
      <Heading as="h2" variant="panel">{t('chat.concord.join')}</Heading>
      <Input label={t('chat.concord.invite')} data-testid="concord-invite-input" {...join.field('invite')} />
      <FormError>{join.error}</FormError>
      <FormActions submitLabel={t('chat.concord.join')} submitTestId="concord-join" busy={join.submitting} disabled={!join.canSubmit} />
    </Form>}
  </div>;
}
