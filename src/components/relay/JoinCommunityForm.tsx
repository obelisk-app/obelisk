'use client';

import { useTranslations } from 'next-intl';
import { LinkIcon } from '@/assets/icons';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import FormError from '@/components/ui/forms/FormError';
import Input from '@/components/ui/forms/Input';
import { useJoinCommunityForm } from '@/hooks/relay/rail/useJoinCommunityForm';

export function JoinCommunityForm({ onClose, fromInvite = false }: { onClose: () => void; fromInvite?: boolean }) {
  const t = useTranslations('shell.rail.addModal');
  const form = useJoinCommunityForm(onClose, fromInvite);
  return (
    <Form form={form} layout="stack" className="rounded-xl border border-lc-border bg-lc-card/60 p-3 sm:p-4">
      <Input
        label={t('joinLink')}
        placeholder={t('pasteLink')}
        prefix={<LinkIcon size={16} />}
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        data-testid="community-join-link"
        {...form.field('link')}
      />
      <FormError>{form.error}</FormError>
      <FormActions submitLabel={t('join')} submitTestId="community-join" busy={form.submitting} disabled={!form.canSubmit} />
    </Form>
  );
}
