'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useSessionNotice } from '@/hooks/session/useSession';
import type { SessionNotice } from '@/services/nostr-bridge';
import { useToastStore } from '@/store/feedback/toast';

/**
 * Tells the person, once, when their login lives for this visit only: the
 * browser could not keep a key to protect it (some private windows, storage
 * turned off), so nothing was saved and the next visit asks again.
 */
export function useSessionNoticeToast(): void {
  const notice = useSessionNotice();
  const t = useTranslations();
  const last = useRef<SessionNotice | null>(null);
  useEffect(() => {
    if (notice === 'not-remembered' && last.current !== notice) {
      useToastStore.getState().pushToast({
        title: t('shell.login.notice.notRemembered.title'),
        body: t('shell.login.notice.notRemembered.body'),
      });
    }
    last.current = notice;
  }, [notice, t]);
}
