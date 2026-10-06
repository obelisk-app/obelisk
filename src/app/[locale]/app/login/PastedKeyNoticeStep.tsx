'use client';

import { Modal } from '@nostr-wot/ui';
import Button from '@/components/ui/Button';
import { useTranslations } from 'next-intl';

type Props = {
  onClose: () => void;
  /** Back to the method list, dropping the pasted key. */
  onBack: () => void;
  onContinue: () => void;
  busy: boolean;
  error: string;
};

/** After pasting an nsec: one line on why that is the least safe way in, before the bridge sees the key. */
export function PastedKeyNoticeStep({ onClose, onBack, onContinue, busy, error }: Props) {
  const t = useTranslations();
  return (
    <Modal open onClose={onClose} aria-label={t('shell.login.pastedKey.title')} classes={{ modal: 'obelisk-login-modal' }}>
      <div className="nui-form" data-testid="pasted-key-notice">
        <div className="nui-form-head">
          <h3 className="nui-form-title">{t('shell.login.pastedKey.title')}</h3>
          <p className="nui-form-sub">{t('shell.login.pastedKey.body')}</p>
        </div>
        {error && <p className="nui-error" role="alert">{error}</p>}
        <Button variant="pill" className="w-full" loading={busy} onClick={onContinue}>
          {t('shell.login.pastedKey.continue')}
        </Button>
        <Button variant="outlinePill" size="lg" className="w-full" disabled={busy} onClick={onBack}>
          {t('shell.login.pastedKey.useSigner')}
        </Button>
      </div>
    </Modal>
  );
}
