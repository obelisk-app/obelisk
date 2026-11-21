'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { downloadConcordBackup, stageConcordBackupRestore, useBridge } from '@/services/nostr-bridge';
import { confirmDialog } from '@/services/common/confirm-dialog';
import { errorText } from '@/utils/errors/error-text';

export function useConcordBackup() {
  const t = useTranslations();
  const bridge = useBridge();
  const pending = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const run = async (restore: File | null) => {
    if (!bridge || pending.current) return;
    pending.current = true;
    try {
      if (restore && !await confirmDialog({
        title: t('settings.preferences.concordBackup.restore'),
        message: t('settings.preferences.concordBackup.confirm'),
        confirmLabel: t('settings.preferences.concordBackup.restore'),
        tone: 'danger', icon: 'none',
      })) return;
      setStatus('working');
      setMessage('');
      if (restore) {
        await stageConcordBackupRestore(bridge, restore);
        window.location.reload();
        return;
      }
      await downloadConcordBackup(bridge);
      setStatus('done');
      setMessage(t('settings.preferences.backup.done'));
    } catch (error) {
      setStatus('error');
      setMessage(errorText(t, error, 'settings.preferences.concordBackup.error'));
    } finally {
      pending.current = false;
    }
  };
  return {
    status, message, working: status === 'working', canRestore: !!file,
    selectFile: (event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null),
    download: () => void run(null),
    restore: () => { if (file) void run(file); },
  };
}
