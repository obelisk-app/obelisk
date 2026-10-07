'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useCreateChannelSheet } from '@/hooks/shell/mobile/sheets/channel/useCreateChannelSheet';
import Sheet from '@/components/ui/overlays/Sheet';
import Input from '@/components/ui/forms/Input';
import SheetActions from '../chrome/SheetActions';
import SheetHeader from '../chrome/SheetHeader';

/**
 * Phone skin of the new-channel form, as a bottom sheet over the channel
 * list. The form itself is `useCreateChannelForm`, shared with the desktop
 * sidebar's `CreateGroupSection`.
 */
export function CreateChannelSheet({
  relayLabel,
  close,
  onCreated,
}: {
  relayLabel: string;
  close: () => void;
  onCreated: (groupId: string) => void;
}) {
  const t = useTranslations();
  const nameId = useId();
  const form = useCreateChannelSheet(onCreated, close);

  return (
    <Sheet onClose={close} screen="create-channel" label={t('mobile.space.newChannel')} maxHeight="88%">
      <SheetHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
        title={t('mobile.space.newChannel')}
        subtitle={t.rich('shell.channel.create.help', { settings: () => <strong>{t('shell.desktop.channel.settings')}</strong> })}
      />
      <form onSubmit={form.submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label htmlFor={nameId}
          style={{
            fontSize: 10,
            color: 'var(--app-text-dim)',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {t('shell.channel.create.nameOn', { relay: relayLabel })}
        </label>
        <div className="setup-input-wrap">
          <Input
            variant="mobile"
            id={nameId}
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
            placeholder={t('shell.channel.create.examplePlaceholder')}
            spellCheck={false}
            data-testid="mobile-create-channel-input"
          />
        </div>
        {form.error && <div style={{ fontSize: 12, color: 'var(--presence-dnd)' }}>{form.error}</div>}
        <button
          type="submit"
          disabled={!form.canSubmit}
          className="btn-primary"
          style={{ marginTop: 4 }}
          data-testid="mobile-create-channel-submit"
        >
          {form.busy ? t('shell.channel.create.creating') : t('shell.channel.create.submit')}
        </button>
      </form>
      <SheetActions onCancel={close} />
    </Sheet>
  );
}
