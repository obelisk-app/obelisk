'use client';

/**
 * Voice / video call buttons for a DM thread header - one joined control,
 * the same height and border as the ⋯ beside it, so the header's actions
 * read as a set rather than three loose icons. Calls ride the NIP-17 inbox,
 * so they need DMs switched on; while any call is in progress the buttons
 * are disabled rather than hidden, so the header doesn't jump.
 */

import { useTranslation } from '@/i18n/context';
import { usePreferences } from '@/hooks/usePreferences';
import { useDmCallStore } from '@/store/dm-call';
import { PhoneIcon, VideoIcon } from '@/components/ui/icons';
import { prefetchDmCallSession } from '@/services/dm-call/load-session';

export function DmCallButtons({ peer, variant = 'desktop' }: { peer: string; variant?: 'desktop' | 'mobile' }) {
  const { t } = useTranslation();
  const dmsOn = usePreferences().directMessagesEnabled;
  const status = useDmCallStore((s) => s.status);
  const busy = status !== 'idle' && status !== 'ended';
  const disabled = !dmsOn || busy;
  const title = (label: string) => (dmsOn ? label : t('call.needsDms'));
  const group = variant === 'desktop'
    ? 'inline-flex h-8 shrink-0 items-stretch overflow-hidden rounded-lg border border-lc-border bg-lc-card/60 divide-x divide-lc-border'
    : 'inline-flex shrink-0 items-center gap-0.5';
  const btn = variant === 'desktop'
    ? 'flex w-9 items-center justify-center text-lc-white transition-colors hover:bg-lc-green/15 hover:text-lc-green active:bg-lc-green/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-lc-white'
    : 'dm-header-action flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40';
  return (
    // Pointing at the buttons starts the call stack's download (load-session.ts).
    <span className={group} role="group" aria-label={t('call.voice')} onPointerEnter={prefetchDmCallSession} onFocus={prefetchDmCallSession}>
      <button
        type="button"
        className={btn}
        onClick={() => void useDmCallStore.getState().startCall(peer, false)}
        disabled={disabled}
        aria-label={t('call.voice')}
        title={title(t('call.voice'))}
        data-testid="dm-call-voice"
      >
        <PhoneIcon size={variant === 'desktop' ? 15 : 19} />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => void useDmCallStore.getState().startCall(peer, true)}
        disabled={disabled}
        aria-label={t('call.video')}
        title={title(t('call.video'))}
        data-testid="dm-call-video"
      >
        <VideoIcon size={variant === 'desktop' ? 16 : 20} />
      </button>
    </span>
  );
}
