'use client';

import { useProfileEditorForm } from '@/hooks/chat/profile/useProfileEditorForm';
import ProfileAppearanceEditor from '@/components/settings/account/ProfileAppearanceEditor';
import { profileAppearance, profileAppearancePatch, type ProfileEditorInitial } from '@/utils/chat/profile/profile-form-values';
import { useTranslations } from 'next-intl';
import Form from '@/components/ui/forms/Form';
import FormActions from '@/components/ui/forms/FormActions';
import FormError from '@/components/ui/forms/FormError';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { ProfileFormField as Field } from './ProfileFormField';

/** The desktop profile editor: picture and banner, the five kind 0 fields, save and cancel. */
export function EditProfileForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: ProfileEditorInitial | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const form = useProfileEditorForm(initial, onSaved);

  return (
    <Form form={form} layout="stack" className="p-4">
      <ProfileAppearanceEditor
        pubkey={form.values.name || '0'}
        displayName={form.values.name}
        value={profileAppearance(form.values)}
        uploading={form.uploading}
        onChange={(next) => form.setValues(profileAppearancePatch(next))}
      />
      <Field label={t('shell.user.field.name')}>
        <Input autoFocus {...form.field('name')} />
      </Field>
      <Field label={t('shell.user.about')}>
        <TextArea {...form.field('about')} rows={2} resize="both" />
      </Field>
      <Field label={t('shell.user.field.nip05')}>
        <Input {...form.field('nip05')} placeholder="you@example.com" />
      </Field>
      <Field label={t('shell.user.field.lud16')}>
        <Input {...form.field('lud16')} placeholder="you@walletofsatoshi.com" />
      </Field>
      <Field label={t('shell.user.field.website')}>
        <Input {...form.field('website')} placeholder="https://…" />
      </Field>
      <FormError>{form.error}</FormError>
      <FormActions
        variant="start"
        submitLabel={t('common.save')}
        busyLabel={t('common.saving')}
        busy={form.submitting}
        cancel={{ label: t('common.cancel'), onClick: onCancel }}
        submitTestId="save-profile-button"
      />
    </Form>
  );
}
