'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useAddRelayForm } from '@/hooks/relay/useAddRelayForm';
import Input from '@/components/ui/forms/Input';

/** The add-relay sheet's custom tab: a relay URL field and the add button. */
export function CustomRelayForm({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations();
  const urlId = useId();
  const { url, busy, error: err, setUrl, submit } = useAddRelayForm(onAdded);

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label htmlFor={urlId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace" }}>
        {t('shell.rail.addModal.urlLabel')}
      </label>
      <p style={{ fontSize: 12, color: 'var(--app-text-dim)', margin: 0, lineHeight: 1.5 }}>
        {t('mobile.rail.addHelp')}
      </p>
      <div className="setup-input-wrap">
        <Input
          autoFocus
          variant="mobile"
          id={urlId}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
        />
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--presence-dnd)' }}>{err}</div>}
      <button
        type="submit"
        disabled={busy || !url.trim()}
        className="btn-primary"
        style={{ marginTop: 4 }}
      >
        {busy ? t('mobile.rail.adding') : t('mobile.rail.addRelay')}
      </button>
    </form>
  );
}
