'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { downloadAccountBackup } from '@/services/settings/account-backup';
import { errorText } from '@/utils/errors/error-text';
import { failedBackupMedia } from '@/utils/settings/backup-result';

export type BackupStatus = 'idle' | 'working' | 'done' | 'error';

/** The account backup button: build and download the file, then say how it went. */
export function useAccountBackupExport() {
  const t = useTranslations();
  const [status, setStatus] = useState<BackupStatus>('idle');
  const [message, setMessage] = useState('');

  const download = async () => {
    setStatus('working');
    setMessage('');
    try {
      const failed = failedBackupMedia(await downloadAccountBackup());
      setStatus('done');
      setMessage(failed
        ? t('settings.preferences.backup.partial', { count: String(failed) })
        : t('settings.preferences.backup.done'));
    } catch (error) {
      setStatus('error');
      setMessage(errorText(t, error, 'settings.preferences.backup.error'));
    }
  };

  return { status, message, working: status === 'working', download: () => void download() };
}
