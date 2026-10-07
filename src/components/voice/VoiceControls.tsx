'use client';

/**
 * Floating control bar for an active voice channel.
 * Renders as a centered pill with backdrop blur - caller places it
 * absolutely or in a flex column footer. State and toggles come from
 * `useVoiceControls`; the quality popover's open flag is local.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useVoiceControls } from '@/hooks/voice/controls/useVoiceControls';
import { voiceErrorText } from '@/utils/voice/error-text';
import QualityPopover from './QualityPopover';
import CircleBtn from './controls/CircleBtn';
import {
  CameraOffIcon, CameraOnIcon, ChatIcon, DeafenOffIcon, DeafenOnIcon, GearIcon, LeaveIcon,
  MicOffIcon, MicOnIcon, ScreenShareIcon, SwitchCameraIcon,
} from './icons';

interface VoiceControlsProps {
  onLeave: () => void;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
}

export default function VoiceControls({ onLeave, isChatOpen, onToggleChat }: VoiceControlsProps) {
  const t = useTranslations();
  const vm = useVoiceControls();
  const [qualityOpen, setQualityOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2 pointer-events-none" data-testid="voice-controls">
      {vm.error && (
        <div
          className="pointer-events-auto text-xs text-red-200 bg-red-600/30 backdrop-blur-md border border-red-500/30 px-3 py-1.5 rounded-full shadow-lg"
          data-testid="voice-error"
        >
          {voiceErrorText(t, vm.error)}
        </div>
      )}
      <div
        className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0))' }}
      >
        <CircleBtn
          active={!vm.isMuted}
          danger={vm.isMuted}
          onClick={vm.toggleMute}
          title={t(vm.isMuted ? 'voice.controls.unmute' : 'voice.controls.mute')}
          data-testid="mute-btn"
        >
          {vm.isMuted ? <MicOffIcon /> : <MicOnIcon />}
        </CircleBtn>

        <CircleBtn
          active={!vm.isDeafened}
          danger={vm.isDeafened}
          onClick={vm.toggleDeafen}
          title={t(vm.isDeafened ? 'voice.controls.undeafen' : 'voice.controls.deafen')}
          data-testid="deafen-btn"
        >
          {vm.isDeafened ? <DeafenOffIcon /> : <DeafenOnIcon />}
        </CircleBtn>

        <CircleBtn
          active={vm.isCameraOn}
          onClick={vm.toggleCamera}
          title={t(vm.isCameraOn ? 'voice.controls.cameraOff' : 'voice.controls.cameraOn')}
          data-testid="camera-btn"
        >
          {vm.isCameraOn ? <CameraOnIcon /> : <CameraOffIcon />}
        </CircleBtn>

        {vm.showSwitchCamera && (
          <CircleBtn
            active={false}
            onClick={vm.switchCamera}
            title={t('voice.switchCamera')}
            data-testid="switch-camera-btn"
          >
            <SwitchCameraIcon />
          </CircleBtn>
        )}

        <CircleBtn
          active={vm.isScreenSharing}
          onClick={vm.toggleScreenShare}
          title={t(vm.isScreenSharing ? 'voice.controls.stopShare' : 'voice.controls.shareScreen')}
          data-testid="screen-share-btn"
          className="hidden sm:flex"
        >
          <ScreenShareIcon sharing={vm.isScreenSharing} />
        </CircleBtn>

        {onToggleChat && (
          <CircleBtn
            active={!!isChatOpen}
            onClick={onToggleChat}
            title={t(isChatOpen ? 'voice.controls.hideChat' : 'voice.controls.showChat')}
            data-testid="voice-chat-toggle"
          >
            <ChatIcon />
          </CircleBtn>
        )}

        <div className="relative">
          <CircleBtn
            active={qualityOpen}
            onClick={() => setQualityOpen((v) => !v)}
            title={t('voice.videoQuality')}
            data-testid="quality-btn"
          >
            <GearIcon />
          </CircleBtn>
          {qualityOpen && <QualityPopover />}
        </div>

        <div className="w-px h-6 bg-white/10 mx-1" aria-hidden />

        <button
          onClick={onLeave}
          className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700 flex items-center justify-center text-white transition-colors shadow-lg shadow-red-900/40"
          title={t('voice.disconnect')}
          data-testid="leave-voice-btn"
        >
          <LeaveIcon />
        </button>
      </div>
    </div>
  );
}
