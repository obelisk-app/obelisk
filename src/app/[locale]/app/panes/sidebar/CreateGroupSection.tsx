'use client';

import { useTranslations } from 'next-intl';
import { useCreateGroupSection } from '@/hooks/shell/panes/sidebar/useCreateGroupSection';
import Form from '@/components/ui/forms/Form';
import FormError from '@/components/ui/forms/FormError';
import Input from '@/components/ui/forms/Input';
import Button from '@/components/ui/buttons/Button';
import { CloseIcon, PlusIcon } from '@/assets/icons';

/**
 * Desktop skin of the new-channel form: a `+` in the channels header that
 * unfolds a one-line form. The form itself is `createChannelForm`, shared
 * with the phone's `CreateChannelSheet`.
 */
export function CreateGroupSection({ count, onCreated }: { count: number; onCreated: (groupId: string) => void }) {
  const t = useTranslations();
  const { open, form, toggle } = useCreateGroupSection(onCreated);
  const toggleLabel = open ? t('common.cancel') : t('shell.channel.create.submit');

  return (
    <div className="mt-2 shrink-0">
      <div className="flex items-center justify-between px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
        <span className="truncate">{t('shell.channel.create.header', { count: String(count) })}</span>
        {/* Icons rather than the `×` / `+` glyphs, which rendered in the OS font. */}
        <Button variant="ghost" size="icon" onClick={toggle} className="-my-0.5 shrink-0" title={toggleLabel} aria-label={toggleLabel}>
          {open ? <CloseIcon size={12} /> : <PlusIcon size={12} />}
        </Button>
      </div>
      {open && (
        <Form form={form} className="mb-1 flex flex-col gap-1 px-3 pb-1">
          <div className="flex items-center gap-1">
            <Input
              size="xs"
              autoFocus
              {...form.field('name')}
              placeholder={t('shell.desktop.channel.namePlaceholder')}
              aria-label={t('shell.desktop.channel.namePlaceholder')}
              className="min-w-0 flex-1"
              data-testid="create-channel-input"
            />
            <Button
              type="submit"
              size="xs"
              disabled={!form.canSubmit}
              className="shrink-0"
              data-testid="create-channel-submit"
            >
              {form.submitting ? '…' : t('shell.channel.create.submitShort')}
            </Button>
          </div>
          <FormError>{form.error}</FormError>
        </Form>
      )}
    </div>
  );
}
