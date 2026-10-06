'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { useCreateChannelForm } from '@/hooks/chat/useCreateChannelForm';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { CloseIcon } from '@/components/ui/icons';

/**
 * Desktop skin of the new-channel form: a `+` in the channels header that
 * unfolds a one-line form. The form itself is `useCreateChannelForm`, shared
 * with the phone's `CreateChannelSheet`.
 */
export function CreateGroupSection({ count, onCreated }: { count: number; onCreated: (groupId: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const form = useCreateChannelForm((id) => {
    setOpen(false);
    onCreated(id);
  });
  const toggle = () => {
    if (open) form.reset();
    setOpen((v) => !v);
  };
  const toggleLabel = open ? t('common.cancel') : t('channel.create.submit');

  return (
    <div className="mt-2 shrink-0">
      <div className="flex items-center justify-between px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
        <span className="truncate">{t('channel.create.header').replace('{count}', String(count))}</span>
        {/* Icons rather than the `×` / `+` glyphs, which rendered in the OS font. */}
        <Button variant="ghost" size="icon" onClick={toggle} className="-my-0.5 shrink-0" title={toggleLabel} aria-label={toggleLabel}>
          {open ? <CloseIcon size={12} /> : <PlusGlyph />}
        </Button>
      </div>
      {open && (
        <form onSubmit={form.submit} className="mb-1 flex flex-col gap-1 px-3 pb-1">
          <div className="flex items-center gap-1">
            <Input
              size="xs"
              autoFocus
              value={form.name}
              onChange={(e) => form.setName(e.target.value)}
              placeholder={t('desktop.channel.namePlaceholder')}
              aria-label={t('desktop.channel.namePlaceholder')}
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
              {form.busy ? '…' : t('channel.create.submitShort')}
            </Button>
          </div>
          {form.error && <span className="break-words text-[10px] text-red-400">{form.error}</span>}
        </form>
      )}
    </div>
  );
}

/** A plus at the icon set's size and stroke; `icons.tsx` has no `PlusIcon` yet. */
function PlusGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
