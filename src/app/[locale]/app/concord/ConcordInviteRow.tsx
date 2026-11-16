'use client';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity, ConcordInviteLink } from '@applesauce/concord/client';
import { useForm } from '@/hooks/common/useForm';
import { concordRevokeInviteForm } from '@/services/chat/concord/invite-form';
import Form from '@/components/ui/forms/Form';
import FormError from '@/components/ui/forms/FormError';
import FormActions from '@/components/ui/forms/FormActions';
import CopyButton from '@/components/ui/buttons/CopyButton';
import Text from '@/components/ui/layout/Text';

export default function ConcordInviteRow({ community, invite }: { community: ConcordCommunity; invite: ConcordInviteLink }) {
  const t = useTranslations();
  const form = useForm(concordRevokeInviteForm(community, invite));
  return <Form form={form} layout="stack" data-testid="concord-existing-invite">
    <Text as="div">{invite.label || t('chat.concord.invite')}</Text>
    <CopyButton text={invite.url} label={t('common.copy', { label: invite.label || t('chat.concord.invite') })} copiedLabel={t('common.copied')} />
    <FormError>{form.error}</FormError>
    <FormActions submitLabel={t('chat.concord.revokeInvite')} busy={form.submitting} disabled={!form.canSubmit} />
  </Form>;
}
