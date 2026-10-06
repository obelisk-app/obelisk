'use client';

/**
 * Floating control bar for an active voice channel.
 * Renders as a centered pill with backdrop blur - caller places it
 * absolutely or in a flex column footer.
 */
import { useEffect, useState } from 'react';
import { useVoiceStore } from '@/store/voice';
import { getActiveVoiceClient } from '@/services/voice/active-client';
import { voiceErrorCode } from '@/services/voice/errors';
import { voiceErrorText } from '@/utils/voice/error-text';
import { useTranslations } from 'next-intl';
import QualityPopover from './QualityPopover';
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
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const error = useVoiceStore((s) => s.error);
  const setError = useVoiceStore((s) => s.setError);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const devices = await navigator.mediaDevices?.enumerateDevices?.();
        if (cancelled) return;
        const cams = (devices ?? []).filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(cams.length > 1);
      } catch (err) {
        // Only the switch-camera button depends on this; say why it is missing.
        console.warn('[voice] enumerateDevices failed; the switch-camera button stays hidden', err);
      }
    };
    void check();
    const onChange = () => { void check(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
    };
  }, []);

  const handleSwitchCamera = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    try { await client.switchCamera(); }
    catch (e) {
      if ((e as { name?: string })?.name === 'NotAllowedError') return;
      setError(voiceErrorCode(e, 'switchCamera'));
    }
  };

  const handleToggleMute = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    try {
      await client.setMicEnabled(isMuted);
    } catch (e) {
      setError(voiceErrorCode(e, 'mic'));
    }
  };

  const handleToggleDeafen = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    const next = !isDeafened;
    client.setDeafenEnabled(next);
    useVoiceStore.getState().setDeafened(next);
    if (next && !isMuted) {
      // Deafen is already applied; a mic that will not stop is the one
      // thing here worth hearing about, since it stays live.
      try { await client.setMicEnabled(false); }
      catch (e) { console.warn('[voice] mic did not stop on deafen', e); }
    }
  };

  const handleToggleCamera = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    try {
      await client.setCameraEnabled(!isCameraOn);
    } catch (e) {
      if ((e as { name?: string })?.name === 'NotAllowedError') return;
      setError(voiceErrorCode(e, 'camera'));
    }
  };

  const handleToggleScreenShare = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    try {
      await client.setScreenShareEnabled(!isScreenSharing);
    } catch (e) {
      if ((e as { name?: string })?.name === 'NotAllowedError') return;
      setError(voiceErrorCode(e, 'screen'));
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 pointer-events-none" data-testid="voice-controls">
      {error && (
        <div
          className="pointer-events-auto text-xs text-red-200 bg-red-600/30 backdrop-blur-md border border-red-500/30 px-3 py-1.5 rounded-full shadow-lg"
          data-testid="voice-error"
        >
          {voiceErrorText(t, error)}
        </div>
      )}
      <div
        className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0))' }}
      >
        <CircleBtn
          active={!isMuted}
          danger={isMuted}
          onClick={handleToggleMute}
          title={t(isMuted ? 'voice.controls.unmute' : 'voice.controls.mute')}
          data-testid="mute-btn"
        >
          {isMuted ? <MicOffIcon /> : <MicOnIcon />}
        </CircleBtn>

        <CircleBtn
          active={!isDeafened}
          danger={isDeafened}
          onClick={handleToggleDeafen}
          title={t(isDeafened ? 'voice.controls.undeafen' : 'voice.controls.deafen')}
          data-testid="deafen-btn"
        >
          {isDeafened ? <DeafenOffIcon /> : <DeafenOnIcon />}
        </CircleBtn>

        <CircleBtn
          active={isCameraOn}
          onClick={handleToggleCamera}
          title={t(isCameraOn ? 'voice.controls.cameraOff' : 'voice.controls.cameraOn')}
          data-testid="camera-btn"
        >
          {isCameraOn ? <CameraOnIcon /> : <CameraOffIcon />}
        </CircleBtn>

        {isCameraOn && hasMultipleCameras && (
          <CircleBtn
            active={false}
            onClick={handleSwitchCamera}
            title={t('voice.switchCamera')}
            data-testid="switch-camera-btn"
          >
            <SwitchCameraIcon />
          </CircleBtn>
        )}

        <CircleBtn
          active={isScreenSharing}
          onClick={handleToggleScreenShare}
          title={t(isScreenSharing ? 'voice.controls.stopShare' : 'voice.controls.shareScreen')}
          data-testid="screen-share-btn"
          className="hidden sm:flex"
        >
          <ScreenShareIcon sharing={isScreenSharing} />
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

function CircleBtn({
  active,
  danger,
  onClick,
  title,
  children,
  className,
  ...rest
}: {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={
        'w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 ' +
        (danger
          ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25 ring-1 ring-red-500/30'
          : active
            ? 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30 ring-1 ring-lc-green/40'
            : 'bg-white/5 text-white/85 hover:bg-white/10 ring-1 ring-white/10') +
        (className ? ' ' + className : '')
      }
    >
      {children}
    </button>
  );
}
