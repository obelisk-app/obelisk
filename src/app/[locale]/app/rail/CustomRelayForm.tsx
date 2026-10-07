'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useAddRelayForm } from '@/hooks/relay/useAddRelayForm';
import Button from '@/components/ui/buttons/Button';
import Input from '@/components/ui/forms/Input';

/** The add-relay dialog's custom tab: type a URL, add it and switch to it. */
export function CustomRelayForm({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations();
  const { url, busy, error: err, setUrl, submit } = useAddRelayForm(onAdded);

  const urlId = useId();
  return (
    <form onSubmit={(e) => void submit(e)}>
      <label htmlFor={urlId} className="block text-sm font-semibold text-lc-white">{t('shell.rail.addModal.urlLabel')}</label>
      <p className="mt-1 text-xs text-lc-muted">{t('shell.rail.addModal.urlHint')}</p>
      <Input
        id={urlId}
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        spellCheck={false}
        className="mt-3 font-mono"
      />
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={busy || !url.trim()}>
          {busy ? t('shell.rail.addModal.adding') : t('shell.rail.addRelay')}
        </Button>
      </div>
    </form>
  );
}
