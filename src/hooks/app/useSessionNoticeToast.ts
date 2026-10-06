'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from '@/i18n/context';
import { useSessionNotice, type SessionNotice } from '@/services/nostr-bridge';
import { useToastStore } from '@/store/toast';

/**
 * Tells the person, once, when their login lives for this visit only: the
 * browser could not keep a key to protect it (some private windows, storage
 * turned off), so nothing was saved and the next visit asks again.
 */
export function useSessionNoticeToast(): void {
  const notice = useSessionNotice();
  const { t } = useTranslation();
  const last = useRef<SessionNotice | null>(null);
  useEffect(() => {
    if (notice === 'not-remembered' && last.current !== notice) {
      useToastStore.getState().pushToast({
        title: t('login.notice.notRemembered.title'),
        body: t('login.notice.notRemembered.body'),
      });
    }
    last.current = notice;
  }, [notice, t]);
}
