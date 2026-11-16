'use client';

import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useForm } from '@/hooks/common/useForm';
import { memberChannelPolicyForm } from '@/services/chat/concord/member-channel-form';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import FormError from '@/components/ui/forms/FormError';
import Checkbox from '@/components/ui/forms/Checkbox';

export default function ConcordMemberChannelPolicy({ community }: { community: ConcordCommunity }) {
  const t = useTranslations();
  const form = useForm(memberChannelPolicyForm(community, t('chat.concord.memberChannelsRole')));
  return <Form form={form} layout="stack">
    <Checkbox label={t('chat.concord.memberChannels')} checked={form.values.enabled} onChange={event => form.set('enabled', event.target.checked)} data-testid="concord-member-channels" />
    <p className="text-sm text-lc-muted">{t('chat.concord.memberChannelsHelp')}</p>
    <FormError>{form.error}</FormError>
    <FormActions submitLabel={t('common.save')} submitTestId="concord-member-channels-save" busy={form.submitting} disabled={!form.canSubmit} />
  </Form>;
}
