'use client';

import { useProfileEditorForm } from '@/hooks/session/useProfileEditorForm';
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
  pubkey,
  initial,
  onCancel,
  onSaved,
}: {
  /** The account being edited: the avatar's fallback comes from it when there is no name. */
  pubkey: string;
  initial: ProfileEditorInitial | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const form = useProfileEditorForm(initial, onSaved);

  return (
    <Form form={form} layout="stack" className="p-4">
      <ProfileAppearanceEditor
        pubkey={pubkey}
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
        <Input {...form.field('nip05')} placeholder={t('shell.user.placeholder.nip05')} />
      </Field>
      <Field label={t('shell.user.field.lud16')}>
        <Input {...form.field('lud16')} placeholder={t('shell.user.placeholder.lud16')} />
      </Field>
      <Field label={t('shell.user.field.website')}>
        <Input {...form.field('website')} placeholder="https://…" />
      </Field>
      <FormError>{form.error}</FormError>
      {/*
        Sticky to the foot of the settings pane's scroll area, so Save and
        Cancel stay on screen however tall the form is (at 1080p they used to
        sit below the dialog's edge).
      */}
      <FormActions
        variant="start"
        className="sticky bottom-0 z-10 -mx-4 border-t border-lc-border bg-lc-black px-4 py-3"
        submitLabel={t('common.save')}
        busyLabel={t('common.saving')}
        busy={form.submitting}
        cancel={{ label: t('common.cancel'), onClick: onCancel }}
        submitTestId="save-profile-button"
        testId="profile-form-actions"
      />
    </Form>
  );
}
