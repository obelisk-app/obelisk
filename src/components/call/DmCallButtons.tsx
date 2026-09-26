'use client';

/**
 * Voice / video call buttons for a DM thread header. Calls ride the NIP-17
 * inbox, so they need DMs switched on; while any call is in progress the
 * buttons are disabled rather than hidden, so the header doesn't jump.
 */

import { useTranslation } from '@/i18n/context';
import { usePreferences } from '@/lib/preferences';
import { useDmCallStore } from '@/store/dm-call';
import { ICON_BUTTON_CLASS } from '@/components/ui/menu';
import { PhoneIcon, VideoIcon } from '@/components/ui/icons';

export function DmCallButtons({ peer, variant = 'desktop' }: { peer: string; variant?: 'desktop' | 'mobile' }) {
  const { t } = useTranslation();
  const dmsOn = usePreferences().directMessagesEnabled;
  const status = useDmCallStore((s) => s.status);
  const busy = status !== 'idle' && status !== 'ended';
  const disabled = !dmsOn || busy;
  const title = (label: string) => (dmsOn ? label : t('call.needsDms'));
  const cls = variant === 'desktop'
    ? `${ICON_BUTTON_CLASS} h-8 w-8 disabled:cursor-not-allowed disabled:opacity-40`
    : 'dm-header-action flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40';
  return (
    <>
      <button
        type="button"
        className={cls}
        onClick={() => void useDmCallStore.getState().startCall(peer, false)}
        disabled={disabled}
        aria-label={t('call.voice')}
        title={title(t('call.voice'))}
        data-testid="dm-call-voice"
      >
        <PhoneIcon size={16} />
      </button>
      <button
        type="button"
        className={cls}
        onClick={() => void useDmCallStore.getState().startCall(peer, true)}
        disabled={disabled}
        aria-label={t('call.video')}
        title={title(t('call.video'))}
        data-testid="dm-call-video"
      >
        <VideoIcon size={16} />
      </button>
    </>
  );
}
