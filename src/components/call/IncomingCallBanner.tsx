'use client';

import { useTranslations } from 'next-intl';
import { useIncomingCallBanner } from '@/hooks/call/useIncomingCallBanner';
import UserAvatar from '@/components/ui/media/UserAvatar';
import IconButton from '@/components/ui/buttons/IconButton';
import { LockIcon, PhoneIcon, PhoneOffIcon, VideoIcon } from '@/components/ui/icons/icons';

/** The ringing banner at the top: who is calling, decline, accept, accept with video. */
export default function IncomingCallBanner() {
  const t = useTranslations();
  const vm = useIncomingCallBanner();
  if (!vm.peer) return null;
  return (
    <div
      className="fixed inset-x-0 top-3 z-[90] mx-auto flex w-[min(28rem,calc(100%-2rem))] items-center gap-3 rounded-2xl border border-lc-green/40 bg-lc-dark/95 p-3 shadow-2xl backdrop-blur"
      role="alertdialog"
      aria-label={vm.video ? t('calls.call.incomingVideo') : t('calls.call.incomingVoice')}
      data-testid="dm-incoming-call"
    >
      <span className="relative shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-lc-green/30" aria-hidden="true" />
        <UserAvatar pubkey={vm.peer} picture={vm.picture} name={vm.name} size={11} className="relative" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-lc-white">{vm.name}</div>
        <div className="flex items-center gap-1 text-xs text-lc-muted">
          <LockIcon size={11} />
          <span className="truncate">{vm.video ? t('calls.call.incomingVideo') : t('calls.call.incomingVoice')}</span>
        </div>
      </div>
      <IconButton
        tone="dangerSolid"
        size="10"
        onClick={vm.decline}
        aria-label={t('calls.call.decline')}
        title={t('calls.call.decline')}
        data-testid="dm-call-decline"
      >
        <PhoneOffIcon size={18} />
      </IconButton>
      <IconButton
        tone="primary"
        size="10"
        onClick={vm.acceptVoice}
        aria-label={t('calls.call.acceptVoice')}
        title={t('calls.call.acceptVoice')}
        data-testid="dm-call-accept"
      >
        <PhoneIcon size={18} />
      </IconButton>
      {vm.video && (
        <IconButton
          tone="primary"
          size="10"
          onClick={vm.acceptVideo}
          aria-label={t('calls.call.acceptVideo')}
          title={t('calls.call.acceptVideo')}
          data-testid="dm-call-accept-video"
        >
          <VideoIcon size={18} />
        </IconButton>
      )}
    </div>
  );
}
