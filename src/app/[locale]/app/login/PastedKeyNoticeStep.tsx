'use client';

import { Modal } from '@nostr-wot/ui';
import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

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
          <Heading as="h3" className="nui-form-title">{t('shell.login.pastedKey.title')}</Heading>
          <Text as="p" className="nui-form-sub">{t('shell.login.pastedKey.body')}</Text>
        </div>
        {error && <Text as="p" className="nui-error" role="alert">{error}</Text>}
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
