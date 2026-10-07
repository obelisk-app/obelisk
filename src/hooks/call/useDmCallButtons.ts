'use client';

import { useTranslations } from 'next-intl';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { useDmCallStore, type DmCallStatus } from '@/store/call/dm-call';

/** A call is in progress from the first ring until it has ended. */
export function dmCallBusy(status: DmCallStatus): boolean {
  return status !== 'idle' && status !== 'ended';
}

/**
 * The DM header's call buttons' view model: disabled with DMs off or while
 * any call is in progress, a tooltip that says why, and the two starts
 * (docs/conventions.md#component-files).
 */
export function useDmCallButtons(peer: string) {
  const t = useTranslations();
  const dmsOn = usePreferences().directMessagesEnabled;
  const status = useDmCallStore((s) => s.status);
  return {
    disabled: !dmsOn || dmCallBusy(status),
    /** The button's own label, or why calls are off. */
    titleFor: (label: string) => (dmsOn ? label : t('calls.call.needsDms')),
    startVoice: () => void useDmCallStore.getState().startCall(peer, false),
    startVideo: () => void useDmCallStore.getState().startCall(peer, true),
  };
}
