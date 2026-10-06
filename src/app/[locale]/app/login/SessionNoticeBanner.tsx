'use client';

import { useTranslations } from 'next-intl';
import { useSessionNotice } from '@/services/nostr-bridge';

/**
 * Above the login methods: why a saved session could not be restored. The
 * three causes collapse to two messages; which of `key-missing` and
 * `unlock-failed` happened matters for logs, not for people.
 */
export function SessionNoticeBanner() {
  const t = useTranslations();
  const notice = useSessionNotice();
  if (notice === null || notice === 'not-remembered') return null;
  const message = notice === 'vault-unavailable' ? t('shell.login.notice.vaultUnavailable') : t('shell.login.notice.unlockFailed');
  return (
    <p className="nui-warning" role="status" data-testid="session-notice">
      {message}
    </p>
  );
}
