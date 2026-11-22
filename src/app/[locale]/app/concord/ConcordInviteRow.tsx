'use client';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity, ConcordInviteLink } from '@applesauce/concord/client';
import { useForm } from '@/hooks/common/useForm';
import { concordRevokeInviteForm, concordShareInviteForm } from '@/services/chat/concord/invite-form';
import Form from '@/components/ui/forms/Form';
import FormError from '@/components/ui/forms/FormError';
import FormActions from '@/components/ui/forms/FormActions';
import Button from '@/components/ui/buttons/Button';
import CopyButton from '@/components/ui/buttons/CopyButton';
import Text from '@/components/ui/layout/Text';

export default function ConcordInviteRow({ community, invite, canShare, shared }: { community: ConcordCommunity; invite: ConcordInviteLink; canShare: boolean; shared: boolean }) {
  const t = useTranslations();
  const form = useForm(concordRevokeInviteForm(community, invite));
  const share = useForm(concordShareInviteForm(community, invite, shared));
  return <Form form={form} layout="stack" data-testid="concord-existing-invite">
    <Text as="div">{invite.label || t('chat.concord.invite')}</Text>
    <CopyButton text={invite.url} label={t('common.copy', { label: invite.label || t('chat.concord.invite') })} copiedLabel={t('common.copied')} />
    {canShare && <Button type="button" variant="outline" loading={share.submitting} onClick={() => void share.submit()}>{t(share.submitting ? 'chat.concord.updatingSharedInvite' : shared ? 'chat.concord.stopSharingInvite' : 'chat.concord.shareInvite')}</Button>}
    <FormError>{share.error}</FormError>
    <FormError>{form.error}</FormError>
    <FormActions submitLabel={t('chat.concord.revokeInvite')} busy={form.submitting} disabled={!form.canSubmit} />
  </Form>;
}
