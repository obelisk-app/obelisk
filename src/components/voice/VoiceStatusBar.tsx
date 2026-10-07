'use client';

/**
 * Persistent mini-bar shown above the user pill at the bottom of the sidebar
 * whenever a call is active. Lets the user mute / deafen / toggle camera /
 * toggle screen-share / leave without navigating back to /app/voice/<id>.
 *
 * State and handlers come from `useVoiceStatusBar` (the voice store and the
 * active VoiceClient). Clicking the channel pill jumps the AppShell view back
 * to the voice channel.
 */
import { useTranslations } from 'next-intl';
import { useVoiceStatusBar } from '@/hooks/voice/status-bar/useVoiceStatusBar';
import SmallBtn from './status-bar/SmallBtn';
import {
  CameraOffIcon, CameraOnIcon, DeafenOffIcon, DeafenOnIcon, LeaveIcon, MicOffIcon, MicOnIcon,
  ScreenShareIcon, SignalIcon, SwitchCameraIcon,
} from './icons';

export default function VoiceStatusBar() {
  const t = useTranslations();
  const vm = useVoiceStatusBar();

  if (!vm.channelId) return null;

  return (
    <div className="px-2 pt-2" data-testid="voice-status-bar">
      <div className="bg-lc-black/60 border border-lc-border rounded-xl p-2 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={vm.jump}
            className="flex-1 min-w-0 flex items-center gap-2 text-left hover:bg-lc-border/30 rounded-md px-1.5 py-1 transition"
            title={t('voice.goToChannel')}
          >
            <span className="shrink-0 w-8 h-8 rounded-md bg-lc-green/10 flex items-center justify-center text-lc-green">
              <SignalIcon size={16} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              {vm.isSignalingDegraded ? (
                <span className="block text-sm text-amber-300 font-semibold" data-testid="voice-bar-reconnecting">
                  {t('voice.reconnectingSignaling')}
                </span>
              ) : (
                <span className="block text-sm text-lc-green font-semibold">{t('voice.connected')}</span>
              )}
              <span className="block text-xs text-lc-muted truncate">
                {vm.channelLabel}
              </span>
            </span>
          </button>
          <button
            onClick={vm.leave}
            className="w-7 h-7 rounded-md bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-colors"
            title={t('voice.disconnect')}
            data-testid="voice-bar-leave"
          >
            <LeaveIcon size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 w-full">
          <SmallBtn active={!vm.isMuted} danger={vm.isMuted} onClick={vm.toggleMute} title={t(vm.isMuted ? 'voice.controls.unmute' : 'voice.controls.mute')}>
            {vm.isMuted ? <MicOffIcon size={14} /> : <MicOnIcon size={14} />}
          </SmallBtn>
          <SmallBtn active={!vm.isDeafened} danger={vm.isDeafened} onClick={vm.toggleDeafen} title={t(vm.isDeafened ? 'voice.controls.undeafen' : 'voice.controls.deafen')}>
            {vm.isDeafened ? <DeafenOffIcon size={14} /> : <DeafenOnIcon size={14} />}
          </SmallBtn>
          <SmallBtn active={vm.isCameraOn} onClick={vm.toggleCamera} title={t(vm.isCameraOn ? 'voice.controls.cameraOff' : 'voice.controls.cameraOn')} data-testid="voice-bar-camera">
            {vm.isCameraOn ? <CameraOnIcon size={14} /> : <CameraOffIcon size={14} />}
          </SmallBtn>
          {vm.showSwitchCamera && (
            <SmallBtn active={false} onClick={vm.switchCamera} title={t('voice.switchCamera')} data-testid="voice-bar-switch-camera">
              <SwitchCameraIcon size={14} />
            </SmallBtn>
          )}
          <SmallBtn active={vm.isScreenSharing} onClick={vm.toggleScreen} title={t(vm.isScreenSharing ? 'voice.controls.stopShare' : 'voice.controls.shareScreen')} data-testid="voice-bar-screenshare">
            <ScreenShareIcon size={14} sharing={vm.isScreenSharing} />
          </SmallBtn>
        </div>
      </div>
    </div>
  );
}
