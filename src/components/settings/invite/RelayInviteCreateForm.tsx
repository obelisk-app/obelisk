'use client';

import { useTranslations } from 'next-intl';
import { useForm } from '@/hooks/common/useForm';
import { relayInviteCreateForm } from '@/services/relay/relay-invite-form';
import type { RelayInviteCode } from '@/types/relay/relay-invite';
import type { InviteFormLimits } from '@/utils/relay/relay-invite-panel';
import { RELAY_INVITE_LABEL_MAX } from '@/constants/relay/relay-invite';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import Input from '@/components/ui/forms/Input';
import Heading from '@/components/ui/layout/Heading';

interface Props {
  relay: string;
  limits: InviteFormLimits;
  onCreated: (invite: RelayInviteCode) => void;
}

/**
 * "New invite link": a label only the creator sees, how many people may use
 * it and for how many days. Mounted per relay and allowance (its `key`), so
 * the defaults follow the relay picked.
 */
export default function RelayInviteCreateForm({ relay, limits, onCreated }: Props) {
  const t = useTranslations();
  const form = useForm(relayInviteCreateForm(relay, limits, onCreated));
  return (
    <Form form={form} layout="stack" error={form.error} data-testid="relay-invite-create-form">
      <Heading as="h4" variant="label">{t('settings.invites.form.title')}</Heading>
      <Input
        {...form.field('label')}
        label={t('settings.invites.form.label')}
        hint={t('settings.invites.form.labelHint')}
        maxLength={RELAY_INVITE_LABEL_MAX}
        size="sm"
        data-testid="relay-invite-label"
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          {...form.field('people')}
          type="number"
          inputMode="numeric"
          min={1}
          max={limits.maxPeople}
          label={t('settings.invites.form.people')}
          hint={t('settings.invites.form.peopleHint', { max: limits.maxPeople })}
          size="sm"
          data-testid="relay-invite-people"
        />
        <Input
          {...form.field('days')}
          type="number"
          inputMode="numeric"
          min={1}
          max={limits.maxDays}
          label={t('settings.invites.form.days')}
          hint={t('settings.invites.form.daysHint', { max: limits.maxDays })}
          size="sm"
          data-testid="relay-invite-days"
        />
      </div>
      <FormActions
        variant="start"
        submitLabel={t('settings.invites.create')}
        busyLabel={t('settings.invites.form.creating')}
        busy={form.submitting}
        disabled={!form.canSubmit}
        submitTestId="relay-invite-create"
      />
    </Form>
  );
}
