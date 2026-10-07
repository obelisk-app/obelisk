'use client';

import { useTranslations } from 'next-intl';
import { useDmCallView } from '@/hooks/call/useDmCallView';
import UserAvatar from '@/components/ui/media/UserAvatar';
import IconButton from '@/components/ui/buttons/IconButton';
import {
  CloseIcon, FlipCameraIcon, LockIcon, MaximizeIcon, MicIcon, MicOffIcon, MinimizeIcon, PhoneOffIcon,
  ScreenShareIcon, ShieldIcon, VideoIcon, VideoOffIcon,
} from '@/assets/icons';
import CallControlButton from './CallControlButton';
import CallStatusText from './CallStatusText';

/** The call view, from "Calling..." through the "Call ended" card. */
export default function DmCallView() {
  const t = useTranslations();
  const { viewRef, remoteVideoRef, localVideoRef, ...vm } = useDmCallView();
  const { s, full, ended } = vm;
  if (!s.peer) return null;

  return (
    <div
      ref={viewRef}
      className={full
        ? 'fixed inset-0 z-[80] flex flex-col bg-black'
        : 'fixed inset-0 z-[80] flex flex-col bg-lc-black/95 backdrop-blur-sm sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[32rem] sm:w-[26rem] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-lc-border sm:shadow-2xl'}
      role="dialog"
      aria-label={vm.name}
      data-testid="dm-call-view"
      data-status={s.status}
      data-fullscreen={full || undefined}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black" onDoubleClick={ended ? undefined : vm.toggleFullscreen}>
        {!ended && (
          <div className="absolute right-3 top-3 z-10 hidden sm:block">
            <IconButton
              tone="overlay"
              onClick={vm.toggleFullscreen}
              aria-label={full ? t('calls.call.exitFullscreen') : t('calls.call.fullscreen')}
              title={full ? t('calls.call.exitFullscreen') : t('calls.call.fullscreen')}
              data-testid="dm-call-fullscreen"
            >
              {full ? <MinimizeIcon size={18} /> : <MaximizeIcon size={18} />}
            </IconButton>
          </div>
        )}
        {vm.showRemoteVideo ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-contain" data-testid="dm-call-remote-video" />
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <UserAvatar pubkey={s.peer} picture={vm.picture} name={vm.name} size={24} />
            <div className="text-lg font-bold text-lc-white">{vm.name}</div>
            <div className="text-sm text-lc-muted" role="status">
              <CallStatusText ended={ended} endedKey={vm.endedKey} lineKey={vm.lineKey} connectedAt={s.connectedAt} />
            </div>
          </div>
        )}
        {s.media.localVideo && !ended && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`absolute bottom-3 right-3 rounded-xl border border-lc-border object-cover shadow-lg [transform:scaleX(-1)] ${full ? 'h-40 w-56 sm:h-44 sm:w-64' : 'h-32 w-24 sm:h-28 sm:w-20'}`}
            data-testid="dm-call-local-video"
          />
        )}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {vm.showRemoteVideo && (
            <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-lc-white">
              {vm.name}
              {' · '}
              <CallStatusText ended={ended} endedKey={vm.endedKey} lineKey={vm.lineKey} connectedAt={s.connectedAt} />
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-lc-white" data-testid="dm-call-encrypted">
            <LockIcon size={11} />
            {t('calls.call.encrypted')}
          </span>
          {s.relayOnly && (
            <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-lc-green" data-testid="dm-call-ip-hidden">
              <ShieldIcon size={11} />
              {t('calls.call.ipHidden')}
            </span>
          )}
        </div>
      </div>
      {/* Shown on the ended card too: "Call failed" alone doesn't say that the
          microphone permission was refused. */}
      {s.error && <p className="px-4 pt-2 text-center text-xs text-red-400" role="alert">{t(`calls.call.error.${s.error}`)}</p>}
      <div className="flex shrink-0 items-center justify-center gap-3 px-4 py-4">
        {ended ? (
          <CallControlButton onClick={() => s.dismiss()} label={t('calls.call.close')} testId="dm-call-close">
            <CloseIcon size={20} />
          </CallControlButton>
        ) : (
          <>
            <CallControlButton
              onClick={() => s.setMic(!s.media.micOn)}
              label={s.media.micOn ? t('calls.call.mute') : t('calls.call.unmute')}
              active={s.media.micOn}
              testId="dm-call-mic"
            >
              {s.media.micOn ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
            </CallControlButton>
            <CallControlButton
              onClick={() => void s.setCamera(!s.media.cameraOn)}
              label={s.media.cameraOn ? t('calls.call.cameraOff') : t('calls.call.cameraOn')}
              active={s.media.cameraOn}
              testId="dm-call-camera"
            >
              {s.media.cameraOn ? <VideoIcon size={20} /> : <VideoOffIcon size={20} />}
            </CallControlButton>
            {s.media.cameraOn && (
              <CallControlButton onClick={() => void s.flipCamera()} label={t('calls.call.flip')} testId="dm-call-flip">
                <FlipCameraIcon size={20} />
              </CallControlButton>
            )}
            {vm.canShare && (
              <CallControlButton
                onClick={() => void s.setScreenShare(!s.media.screenOn)}
                label={s.media.screenOn ? t('calls.call.stopShare') : t('calls.call.shareScreen')}
                active={!s.media.screenOn}
                testId="dm-call-screen"
              >
                <ScreenShareIcon size={20} />
              </CallControlButton>
            )}
            <CallControlButton onClick={() => s.hangup()} label={t('calls.call.hangup')} danger testId="dm-call-hangup">
              <PhoneOffIcon size={20} />
            </CallControlButton>
          </>
        )}
      </div>
    </div>
  );
}
