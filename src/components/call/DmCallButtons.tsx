'use client';

/**
 * Voice / video call buttons for a DM thread header - one joined control,
 * the same height and border as the ⋯ beside it, so the header's actions
 * read as a set rather than three loose icons. Calls ride the NIP-17 inbox,
 * so they need DMs switched on; while any call is in progress the buttons
 * are disabled rather than hidden, so the header doesn't jump.
 */

import { useTranslations } from 'next-intl';
import { useDmCallButtons } from '@/hooks/call/useDmCallButtons';
import { PhoneIcon, VideoIcon } from '@/components/ui/icons/icons';
import { prefetchDmCallSession } from '@/services/call/load-session';

const GROUP_CLASS = {
  desktop: 'inline-flex h-8 shrink-0 items-stretch overflow-hidden rounded-lg border border-lc-border bg-lc-card/60 divide-x divide-lc-border',
  mobile: 'inline-flex shrink-0 items-center gap-0.5',
} as const;

const BUTTON_CLASS = {
  desktop: 'flex w-9 items-center justify-center text-lc-white transition-colors hover:bg-lc-green/15 hover:text-lc-green active:bg-lc-green/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-lc-white',
  mobile: 'dm-header-action flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40',
} as const;

export function DmCallButtons({ peer, variant = 'desktop' }: { peer: string; variant?: 'desktop' | 'mobile' }) {
  const t = useTranslations();
  const vm = useDmCallButtons(peer);
  const btn = BUTTON_CLASS[variant];
  return (
    // Pointing at the buttons starts the call stack's download (load-session.ts).
    <span className={GROUP_CLASS[variant]} role="group" aria-label={t('calls.call.voice')} onPointerEnter={prefetchDmCallSession} onFocus={prefetchDmCallSession}>
      <button
        type="button"
        className={btn}
        onClick={vm.startVoice}
        disabled={vm.disabled}
        aria-label={t('calls.call.voice')}
        title={vm.titleFor(t('calls.call.voice'))}
        data-testid="dm-call-voice"
      >
        <PhoneIcon size={variant === 'desktop' ? 15 : 19} />
      </button>
      <button
        type="button"
        className={btn}
        onClick={vm.startVideo}
        disabled={vm.disabled}
        aria-label={t('calls.call.video')}
        title={vm.titleFor(t('calls.call.video'))}
        data-testid="dm-call-video"
      >
        <VideoIcon size={variant === 'desktop' ? 16 : 20} />
      </button>
    </span>
  );
}
